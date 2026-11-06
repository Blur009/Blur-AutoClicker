# Stages Windows runtime dependencies into src-tauri/resources so the NSIS
# installer bundles them next to the exe:
#   - Visual C++ redistributable DLLs (vcruntime140, msvcp140, ...)
#   - crashpad_handler.exe (produced by crashpad-rs prebuilt during cargo build)
#
# tauri.conf.json maps `resources/*` to the resource root via:
#   "resources": { "resources/*": "" }
# On Windows the resource dir is the exe's directory, so both the DLLs (found by
# the OS loader) and the handler (resolved by crash_handler.rs) land where the
# app expects them.
#
# Runs as `build.beforeBundleCommand`, i.e. after the release binary is built
# and immediately before Tauri collects `bundle.resources`.

param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$resourcesDir = Join-Path $RepoRoot 'src-tauri/resources'
New-Item -ItemType Directory -Force -Path $resourcesDir | Out-Null

# -- 1. Locate the newest Visual C++ redistributable CRT folder -------------
$crtDir = $null

$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path $vswhere) {
  $installPath = & $vswhere -latest -products * `
    -requires Microsoft.VisualStudio.Component.VC.Redist.14.Latest `
    -property installationPath 2>$null
  if ($installPath) {
    $crtDir = Get-ChildItem -Path $installPath -Recurse -Directory `
      -Filter 'Microsoft.VC*.CRT' -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '\\x64\\' } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
  }
}

if (-not $crtDir) {
  # Fallback: glob common VS install roots
  $crtDir = Get-ChildItem -Path @(
      'C:\Program Files\Microsoft Visual Studio',
      'C:\Program Files (x86)\Microsoft Visual Studio'
    ) -Recurse -Directory -Filter 'Microsoft.VC*.CRT' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\' } |
    Sort-Object FullName -Descending |
    Select-Object -First 1
}

if (-not $crtDir) {
  Write-Error 'Visual C++ redistributable CRT directory not found.'
}

Write-Host "[prepare-windows-redist] VC CRT dir: $($crtDir.FullName)"

Get-ChildItem -Path $crtDir.FullName -Filter '*.dll' -File |
  Copy-Item -Destination $resourcesDir -Force

# -- 2. Copy crashpad_handler.exe next to the exe ---------------------------
$handlerCandidates = @(
  (Join-Path $RepoRoot 'src-tauri/target/release/crashpad_handler.exe'),
  (Join-Path $RepoRoot 'src-tauri/target/x86_64-pc-windows-msvc/release/crashpad_handler.exe')
)
$handler = $handlerCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $handler) {
  $cacheRoot = Join-Path $env:LOCALAPPDATA 'crashpad-rs/prebuilt'
  if ($env:LOCALAPPDATA -and (Test-Path $cacheRoot)) {
    $handler = Get-ChildItem -Path $cacheRoot -Recurse -Filter 'crashpad_handler.exe' -File |
      Select-Object -First 1 -ExpandProperty FullName
  }
}
if (-not $handler) {
  $targetRoot = Join-Path $RepoRoot 'src-tauri/target'
  if (Test-Path $targetRoot) {
    $handler = Get-ChildItem -Path $targetRoot -Recurse -Filter 'crashpad_handler.exe' -File -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
  }
}
if (-not $handler) {
  Write-Error 'crashpad_handler.exe not found in target dirs or the crashpad-rs cache. Build must run before bundling; this usually means the crashpad "prebuilt" feature did not produce the handler.'
}
Copy-Item -Path $handler -Destination (Join-Path $resourcesDir 'crashpad_handler.exe') -Force
Write-Host "[prepare-windows-redist] crashpad handler: $handler"

Write-Host '[prepare-windows-redist] Staged resources:'
Get-ChildItem -Path $resourcesDir | Select-Object -ExpandProperty Name