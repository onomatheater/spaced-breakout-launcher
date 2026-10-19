#Requires -Version 5.1
param(
  [string]$BundleUrl = $env:SPACED_BREAKOUT_URL,
  [string]$ManifestUrl = ""
)
$ErrorActionPreference = "Stop"
$modsDir = Join-Path $env:APPDATA "Factorio\mods"
New-Item -ItemType Directory -Force -Path $modsDir | Out-Null

if ([string]::IsNullOrWhiteSpace($BundleUrl)) {
  Write-Host "Set SPACED_BREAKOUT_URL or pass -BundleUrl (private link, do not publish)"
  exit 1
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) "SPACED-BREAKOUT-v1.0.zip"
Write-Host "Downloading bundle..."
Invoke-WebRequest -Uri $BundleUrl -OutFile $tmp -UseBasicParsing

# verify against manifest if provided
if ($ManifestUrl -ne "") {
  $manifest = Invoke-RestMethod -Uri $ManifestUrl
  Write-Host ("Manifest: {0} v{1}, files: {2}" -f $manifest.name, $manifest.version, $manifest.files.Count)
}

Write-Host "Extracting to $modsDir (zips, no unpack of inner content)..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
# clear old pack files listed in manifest to avoid version mix
$zip = [System.IO.Compression.ZipFile]::OpenRead($tmp)
foreach ($e in $zip.Entries) {
  $dest = Join-Path $modsDir $e.Name
  # only top-level zips
  if ($e.FullName -match '\.zip$') {
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $dest, $true)
  }
}
$zip.Dispose()

Write-Host "Done. Disable auto-update in game: Mods -> uncheck auto-update."
Write-Host "Start new game. Old saves not supported."
