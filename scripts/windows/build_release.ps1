[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string]$PythonExe = "python",
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"

Set-Location $ProjectRoot

$env:PYINSTALLER_CONFIG_DIR = Join-Path $env:TEMP "brake-trainer-pro-pyinstaller"
$env:XDG_CACHE_HOME = Join-Path $env:TEMP "brake-trainer-pro-cache"
New-Item -ItemType Directory -Force -Path $env:PYINSTALLER_CONFIG_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $env:XDG_CACHE_HOME | Out-Null

Write-Host "Updating pip and installing project dependencies..."
& $PythonExe -m pip install -U pip
& $PythonExe -m pip install -e .
& $PythonExe -m pip install pyinstaller

Write-Host "Cleaning previous build output..."
if (Test-Path ".\build\brake_trainer_pro") {
    Remove-Item ".\build\brake_trainer_pro" -Recurse -Force
}
if (Test-Path ".\dist") {
    Remove-Item ".\dist" -Recurse -Force
}

Write-Host "Building PyInstaller bundle..."
& $PythonExe -m PyInstaller -y ".\build\brake_trainer_pro.spec"

if ($SkipInstaller) {
    Write-Host "Installer step skipped."
    exit 0
}

$iscc = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
if (-not $iscc) {
    throw "ISCC.exe not found. Install Inno Setup 6 and ensure ISCC.exe is available in PATH."
}

Write-Host "Building Inno Setup installer..."
& $iscc.Source ".\installer\windows\BrakeTrainerPro.iss"

Write-Host "Windows build complete."

