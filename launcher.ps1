#Requires -Version 5.1
# Spaced Breakout launcher (WPF GUI, MIT).
# NOTE: this file must stay UTF-8 with BOM, otherwise PowerShell 5.1
# misreads Cyrillic strings. Keep it that way after every edit.

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName System.IO.Compression.FileSystem

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- Text resources (RU/EN toggle switches $Script:Lang) ---------------------

$Strings = @{
  ru = @{
    subtitle     = "Модпак Factorio {0} · v{1} · {2} модов"
    download     = "Скачать / обновить сборку"
    play         = "Играть"
    close        = "Закрыть"
    statusIdle   = "Готов."
    statusNeedCfg= "Нет launcher-config.json — скопируй launcher-config.example.json и впиши ссылку на бандл."
    statusDl     = "Скачиваю сборку..."
    statusVerify = "Проверяю файлы..."
    statusDone   = "Готово. Моды на месте, можно играть."
    statusPlay   = "Запускаю Factorio..."
    statusNoExe  = "Не найден factorio.exe — укажи путь в launcher-config.json."
    statusBadZip = "Бандл поврежден или неполный: "
    statusNoMods = "В бандле нет модов."
    lang         = "Язык:"
    optional     = "Дополнительно:"
  }
  en = @{
    subtitle     = "Factorio {0} modpack · v{1} · {2} mods"
    download     = "Download / update pack"
    play         = "Play"
    close        = "Close"
    statusIdle   = "Ready."
    statusNeedCfg= "Missing launcher-config.json — copy launcher-config.example.json and set the bundle URL."
    statusDl     = "Downloading bundle..."
    statusVerify = "Verifying files..."
    statusDone   = "Done. Mods are in place, ready to play."
    statusPlay   = "Launching Factorio..."
    statusNoExe  = "factorio.exe not found — set the path in launcher-config.json."
    statusBadZip = "Bundle is broken or incomplete: "
    statusNoMods = "No mods found in the bundle."
    lang         = "Language:"
    optional     = "Optional:"
  }
}

$Script:Lang = "ru"
function Tr($key) { return $Strings[$Script:Lang][$key] }

# --- Manifest: single source of truth for pack identity ---------------------

function Read-Manifest {
  $m = Get-Content (Join-Path $ScriptDir "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  return $m
}

# --- Mod identity comes from info.json inside the zip, never the filename ---

function Get-ModNameFromZip($zipPath) {
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entry = $zip.Entries | Where-Object { $_.FullName -match '(?i)/info\.json$' } | Select-Object -First 1
    if (-not $entry) { return $null }
    $sr = New-Object IO.StreamReader($entry.Open())
    try {
      $info = $sr.ReadToEnd() | ConvertFrom-Json
      return $info.name
    } finally { $sr.Close() }
  } finally { $zip.Dispose() }
}

# --- Config and game lookup --------------------------------------------------

function Read-Config {
  $p = Join-Path $ScriptDir "launcher-config.json"
  if (-not (Test-Path $p)) { return $null }
  return (Get-Content $p -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Find-FactorioExe($cfg) {
  if ($cfg -and $cfg.factorio_exe -and (Test-Path $cfg.factorio_exe)) { return $cfg.factorio_exe }
  $candidates = @(
    "C:\Program Files (x86)\Steam\steamapps\common\Factorio\bin\x64\factorio.exe",
    (Join-Path $env:ProgramFiles "Factorio\bin\x64\factorio.exe")
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  return $null
}

function Get-ModsDir {
  $d = Join-Path $env:APPDATA "Factorio\mods"
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  return $d
}

# --- Install: extract verified zips, enable them in mod-list.json ------------

function Install-Bundle($bundleZip, $manifest, $wantOptionalNames, $onProgress) {
  $zip = [System.IO.Compression.ZipFile]::OpenRead($bundleZip)
  try {
    $modsDir = Get-ModsDir
    $mlPath = Join-Path $modsDir "mod-list.json"
    $modList = @{ mods = @() }
    if (Test-Path $mlPath) { $modList = Get-Content $mlPath -Raw -Encoding UTF8 | ConvertFrom-Json }
    $known = @($modList.mods | ForEach-Object { $_.name })

    $wanted = @($manifest.files | Where-Object { -not $_.optional -or ($wantOptionalNames -contains $_.name) })
    if ($wanted.Count -eq 0) { throw (Tr "statusNoMods") }

    $i = 0
    foreach ($f in $wanted) {
      $i++
      &$onProgress ($i / $wanted.Count)
      $entry = $zip.Entries | Where-Object { $_.FullName -eq $f.name -or $_.FullName -match ([regex]::Escape("/" + $f.name) + "$") } | Select-Object -First 1
      if (-not $entry) { throw ((Tr "statusBadZip") + $f.name) }
      $dest = Join-Path $modsDir ([IO.Path]::GetFileName($f.name))
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
      $hash = (Get-FileHash $dest -Algorithm SHA1).Hash.ToLower()
      if ($hash -ne $f.sha1.ToLower()) { throw ("SHA1 mismatch: " + $f.name) }
      $modName = Get-ModNameFromZip $dest
      if ($modName -and ($known -notcontains $modName)) {
        $modList.mods += @{ name = $modName; enabled = $true }
        $known += $modName
      }
    }
    ($modList | ConvertTo-Json -Depth 5) | Set-Content $mlPath -Encoding UTF8
  } finally { $zip.Dispose() }
}

# --- Window ------------------------------------------------------------------

$Manifest = Read-Manifest

[xml]$Xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Spaced Breakout" Height="470" Width="480"
        WindowStartupLocation="CenterScreen" ResizeMode="NoResize">
  <StackPanel Margin="20">
    <Image Name="LogoImg" Height="140" Stretch="Uniform" Margin="0,0,0,10"/>
    <TextBlock Name="TitleBlock" FontSize="28" FontWeight="Bold" Text="Spaced Breakout"/>
    <TextBlock Name="SubtitleBlock" FontSize="12" Opacity="0.7" Margin="0,0,0,15" Text=""/>
    <StackPanel Orientation="Horizontal" Margin="0,0,0,10">
      <TextBlock Name="LangLabel" VerticalAlignment="Center" Margin="0,0,10,0" Text=""/>
      <ComboBox Name="LangBox" Width="120" SelectedIndex="0">
        <ComboBoxItem>RU</ComboBoxItem>
        <ComboBoxItem>EN</ComboBoxItem>
      </ComboBox>
    </StackPanel>
    <StackPanel Name="OptionalPanel" Margin="0,0,0,10"/>
    <Button Name="DlButton" Height="36" Margin="0,0,0,10" Content=""/>
    <Button Name="PlayButton" Height="36" Margin="0,0,0,10" Content=""/>
    <Button Name="CloseButton" Height="28" Content=""/>
    <ProgressBar Name="ProgBar" Height="14" Minimum="0" Maximum="1" Value="0" Margin="0,5,0,0"/>
    <TextBlock Name="StatusBlock" Margin="0,5,0,0" TextWrapping="Wrap" Text=""/>
  </StackPanel>
</Window>
"@

$Window = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $Xaml))
$LogoImg = $Window.FindName("LogoImg")
$TitleBlock = $Window.FindName("TitleBlock")
$SubtitleBlock = $Window.FindName("SubtitleBlock")
$LangLabel = $Window.FindName("LangLabel")
$LangBox = $Window.FindName("LangBox")
$OptionalPanel = $Window.FindName("OptionalPanel")
$DlButton = $Window.FindName("DlButton")
$PlayButton = $Window.FindName("PlayButton")
$CloseButton = $Window.FindName("CloseButton")
$ProgBar = $Window.FindName("ProgBar")
$StatusBlock = $Window.FindName("StatusBlock")

$logoPath = Join-Path $ScriptDir "assets\logo.png"
if (Test-Path $logoPath) {
  $LogoImg.Source = New-Object Windows.Media.Imaging.BitmapImage([Uri]$logoPath)
}

$OptionalChecks = @{}
function Refresh-Texts {
  $Window.Title = $Manifest.name
  $TitleBlock.Text = $Manifest.name
  $fmt = Tr "subtitle"
  $SubtitleBlock.Text = ($fmt -f $Manifest.factorio_version, $Manifest.version, $Manifest.files.Count)
  $LangLabel.Text = Tr "lang"
  $DlButton.Content = Tr "download"
  $PlayButton.Content = Tr "play"
  $CloseButton.Content = Tr "close"
  if ([string]::IsNullOrWhiteSpace($StatusBlock.Text)) { $StatusBlock.Text = Tr "statusIdle" }
}

function Set-Busy($busy) {
  $DlButton.IsEnabled = -not $busy
  $PlayButton.IsEnabled = -not $busy
  if (-not $busy) { $ProgBar.Value = 0 }
}

# Optional mods from the manifest get one checkbox each.
$OptionalPanel.Children.Clear()
$OptionalChecks = @{}
$optionalFiles = @($Manifest.files | Where-Object { $_.optional })
if ($optionalFiles.Count -gt 0) {
  $lbl = New-Object Windows.Controls.TextBlock
  $lbl.Text = Tr "optional"
  $lbl.Opacity = 0.7
  $OptionalPanel.Children.Add($lbl) | Out-Null
  foreach ($f in $optionalFiles) {
    $cb = New-Object Windows.Controls.CheckBox
    $cb.Content = ($f.name -replace '_[\d.]+\.zip$', '')
    $cb.Tag = $f.name
    $cb.IsChecked = $false
    $OptionalPanel.Children.Add($cb) | Out-Null
    $OptionalChecks[$f.name] = $cb
  }
}

$LangBox.Add_SelectionChanged({
  if ($LangBox.SelectedIndex -eq 1) { $Script:Lang = "en" } else { $Script:Lang = "ru" }
  Refresh-Texts
})

$DlButton.Add_Click({
  $cfg = Read-Config
  if (-not $cfg) { $StatusBlock.Text = Tr "statusNeedCfg"; return }
  Set-Busy $true
  try {
    $StatusBlock.Text = Tr "statusDl"
    $tmp = Join-Path ([IO.Path]::GetTempPath()) "spaced-breakout-bundle.zip"
    $wc = New-Object Net.WebClient
    $progressSub = Register-ObjectEvent -InputObject $wc -EventName DownloadProgressChanged -Action {
      $pct = $EventArgs.ProgressPercentage / 100.0
      $ProgBar.Dispatcher.Invoke([action]{ $ProgBar.Value = $pct }.GetNewClosure())
    }
    try {
      $dlDone = $wc.DownloadFileTaskAsync([Uri]$cfg.bundle_url, $tmp)
      $bg = [Windows.Threading.DispatcherPriority]::Background
      while (-not $dlDone.IsCompleted) {
        [Windows.Threading.Dispatcher]::CurrentDispatcher.Invoke($bg, [action]{}) | Out-Null
        Start-Sleep -Milliseconds 100
      }
      if ($dlDone.Exception) { throw $dlDone.Exception.InnerException }
    } finally {
      Unregister-Event -SubscriptionId $progressSub.Id -ErrorAction SilentlyContinue
      $wc.Dispose()
    }
    $StatusBlock.Text = Tr "statusVerify"
    $checked = @($OptionalChecks.Keys | Where-Object { $OptionalChecks[$_].IsChecked })
    $progress = { param($v) $ProgBar.Value = $v }.GetNewClosure()
    Install-Bundle $tmp $Manifest $checked $progress
    $StatusBlock.Text = Tr "statusDone"
  } catch {
    $StatusBlock.Text = $_.Exception.Message
  } finally {
    Set-Busy $false
  }
})

$PlayButton.Add_Click({
  $exe = Find-FactorioExe (Read-Config)
  if (-not $exe) { $StatusBlock.Text = Tr "statusNoExe"; return }
  $StatusBlock.Text = Tr "statusPlay"
  Start-Process $exe
})

$CloseButton.Add_Click({ $Window.Close() })

Refresh-Texts
$StatusBlock.Text = Tr "statusIdle"
[void]$Window.ShowDialog()
