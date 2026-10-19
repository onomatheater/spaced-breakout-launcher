#Requires -Version 5.1
# Spaced Breakout launcher (WPF GUI, RU/EN toggle, MIT)
# Config lives in launcher-config.json next to this script (NOT in git).
# See launcher-config.example.json for the template.

Add-Type -AssemblyName PresentationFramework

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ScriptDir "launcher-config.json"
$ManifestPath = Join-Path $ScriptDir "manifest.json"

$T = @{
  ru = @{
    title        = "Spaced Breakout"
    subtitle     = "Модпак Factorio 2.0.77 · v1.2 · 40 модов"
    download     = "Скачать / обновить сборку"
    play         = "Играть"
    close        = "Закрыть"
    statusIdle   = "Готов."
    statusNeedCfg= "Нет launcher-config.json — смотри launcher-config.example.json"
    statusDl     = "Скачиваю бандл..."
    statusVerify = "Проверяю файлы..."
    statusDone   = "Готово. Моды на месте, можно играть."
    statusPlay   = "Запускаю Factorio..."
    statusNoExe  = "Не найден factorio.exe — укажи путь в конфиге."
    lang         = "Язык:"
  }
  en = @{
    title        = "Spaced Breakout"
    subtitle     = "Factorio 2.0.77 modpack · v1.2 · 40 mods"
    download     = "Download / update pack"
    play         = "Play"
    close        = "Close"
    statusIdle   = "Ready."
    statusNeedCfg= "Missing launcher-config.json — see launcher-config.example.json"
    statusDl     = "Downloading bundle..."
    statusVerify = "Verifying files..."
    statusDone   = "Done. Mods are in place, ready to play."
    statusPlay   = "Launching Factorio..."
    statusNoExe  = "factorio.exe not found — set the path in config."
    lang         = "Language:"
  }
}

$Lang = "ru"
function S($key) { return $T[$Lang][$key] }

[xml]$Xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Spaced Breakout" Height="320" Width="480"
        WindowStartupLocation="CenterScreen" ResizeMode="NoResize">
  <StackPanel Margin="20">
    <TextBlock Name="TitleBlock" FontSize="28" FontWeight="Bold" Text="Spaced Breakout"/>
    <TextBlock Name="SubtitleBlock" FontSize="12" Opacity="0.7" Margin="0,0,0,15" Text=""/>
    <StackPanel Orientation="Horizontal" Margin="0,0,0,15">
      <TextBlock Name="LangLabel" VerticalAlignment="Center" Margin="0,0,10,0" Text="Язык:"/>
      <ComboBox Name="LangBox" Width="120" SelectedIndex="0">
        <ComboBoxItem>RU</ComboBoxItem>
        <ComboBoxItem>EN</ComboBoxItem>
      </ComboBox>
    </StackPanel>
    <Button Name="DlButton" Height="36" Margin="0,0,0,10" Content="Скачать / обновить сборку"/>
    <Button Name="PlayButton" Height="36" Margin="0,0,0,10" Content="Играть"/>
    <Button Name="CloseButton" Height="28" Content="Закрыть"/>
    <TextBlock Name="StatusBlock" Margin="0,10,0,0" TextWrapping="Wrap" Text=""/>
  </StackPanel>
</Window>
"@

$Reader = New-Object System.Xml.XmlNodeReader $Xaml
$Window = [Windows.Markup.XamlReader]::Load($Reader)
$TitleBlock = $Window.FindName("TitleBlock")
$SubtitleBlock = $Window.FindName("SubtitleBlock")
$LangLabel = $Window.FindName("LangLabel")
$LangBox = $Window.FindName("LangBox")
$DlButton = $Window.FindName("DlButton")
$PlayButton = $Window.FindName("PlayButton")
$CloseButton = $Window.FindName("CloseButton")
$StatusBlock = $Window.FindName("StatusBlock")

function Refresh-Texts {
  $Window.Title = S "title"
  $TitleBlock.Text = S "title"
  $SubtitleBlock.Text = S "subtitle"
  $LangLabel.Text = S "lang"
  $DlButton.Content = S "download"
  $PlayButton.Content = S "play"
  $CloseButton.Content = S "close"
  if ([string]::IsNullOrWhiteSpace($StatusBlock.Text)) { $StatusBlock.Text = S "statusIdle" }
}

function Get-Config {
  if (-not (Test-Path $ConfigPath)) { return $null }
  return (Get-Content $ConfigPath -Raw | ConvertFrom-Json)
}

function Get-FactorioExe($cfg) {
  if ($cfg.factorio_exe -and (Test-Path $cfg.factorio_exe)) { return $cfg.factorio_exe }
  $candidates = @(
    "C:\Program Files (x86)\Steam\steamapps\common\Factorio\bin\x64\factorio.exe",
    "$env:ProgramFiles\Factorio\bin\x64\factorio.exe"
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  return $null
}

$LangBox.Add_SelectionChanged({
  if ($LangBox.SelectedIndex -eq 1) { $script:Lang = "en" } else { $script:Lang = "ru" }
  Refresh-Texts
})

$DlButton.Add_Click({
  $cfg = Get-Config
  if (-not $cfg) { $StatusBlock.Text = S "statusNeedCfg"; return }
  $modsDir = Join-Path $env:APPDATA "Factorio\mods"
  New-Item -ItemType Directory -Force -Path $modsDir | Out-Null
  try {
    $StatusBlock.Text = S "statusDl"
    $Window.UpdateLayout()
    $tmp = Join-Path ([IO.Path]::GetTempPath()) "spaced-breakout-bundle.zip"
    Invoke-WebRequest -Uri $cfg.bundle_url -OutFile $tmp -UseBasicParsing
    $manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($tmp)
    $StatusBlock.Text = S "statusVerify"
    $ok = $true
    foreach ($f in $manifest.files) {
      $entry = $zip.Entries | Where-Object { $_.FullName -match ([regex]::Escape($f.name) + "$") } | Select-Object -First 1
      if (-not $entry) { $ok = $false; break }
      $dest = Join-Path $modsDir $f.name
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
      $hash = (Get-FileHash $dest -Algorithm SHA1).Hash.ToLower()
      if ($hash -ne $f.sha1.ToLower()) { $ok = $false; break }
    }
    $zip.Dispose()
    if ($ok) {
      # enable all pack mods in mod-list.json
      $mlPath = Join-Path $modsDir "mod-list.json"
      $ml = @{ mods = @() }
      if (Test-Path $mlPath) { $ml = Get-Content $mlPath -Raw | ConvertFrom-Json }
      $names = @($ml.mods | ForEach-Object { $_.name })
      foreach ($f in $manifest.files) {
        $modName = $f.name -replace '_[\d.]+\.zip$', ''
        if ($names -notcontains $modName) {
          $ml.mods += @{ name = $modName; enabled = $true }
          $names += $modName
        }
      }
      ($ml | ConvertTo-Json -Depth 5) | Set-Content $mlPath
      $StatusBlock.Text = S "statusDone"
    } else {
      $StatusBlock.Text = "SHA1 mismatch!"
    }
  } catch {
    $StatusBlock.Text = $_.Exception.Message
  }
})

$PlayButton.Add_Click({
  $cfg = Get-Config
  $exe = Get-FactorioExe $cfg
  if (-not $exe) { $StatusBlock.Text = S "statusNoExe"; return }
  $StatusBlock.Text = S "statusPlay"
  Start-Process $exe
})

$CloseButton.Add_Click({ $Window.Close() })

Refresh-Texts
$StatusBlock.Text = S "statusIdle"
[void]$Window.ShowDialog()
