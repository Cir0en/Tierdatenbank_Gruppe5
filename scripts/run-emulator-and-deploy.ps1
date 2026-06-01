Param(
    [string]$AvdName = "Pixel_8",
    [string]$ProjectPath = "C:\Users\lukas\Desktop\Uni\ImplementierungVonAnwendungssystemen\Tierdatenbank_Gruppe5\App\Tierapp",
    [string]$SdkRoot = $env:ANDROID_SDK_ROOT
)

if (-not $SdkRoot) {
    if ($env:ANDROID_HOME) { $SdkRoot = $env:ANDROID_HOME } else { $SdkRoot = Join-Path $env:USERPROFILE "AppData\Local\Android\Sdk" }
}

$emulator = Join-Path $SdkRoot "emulator\emulator.exe"
$adb = Join-Path $SdkRoot "platform-tools\adb.exe"

if (-not (Test-Path $emulator)) {
    Write-Error "Emulator not found at $emulator"
    exit 1
}
if (-not (Test-Path $adb)) {
    Write-Error "adb not found at $adb"
    exit 1
}

# Start emulator if not running
$devicesOutput = & $adb devices 2>$null
$runningEmu = $devicesOutput | Select-String "^emulator-"
if (-not $runningEmu) {
    Write-Host "Starting AVD $AvdName..."
    Start-Process -FilePath $emulator -ArgumentList "-avd",$AvdName,"-no-snapshot-load","-no-boot-anim" -NoNewWindow
} else {
    Write-Host "Emulator already running."
}

# Wait for emulator device to appear
Write-Host "Waiting for emulator to appear..."
while (-not ((& $adb devices 2>$null) | Select-String "emulator-")) {
    Start-Sleep -Seconds 1
}

$serial = ((& $adb devices 2>$null) | Where-Object { $_ -match "emulator-" } | ForEach-Object { ($_ -split "\t")[0] })[0]
Write-Host "Found device $serial. Waiting for boot completion..."

# Wait for boot completed property
while ($true) {
    $boot = (& $adb -s $serial shell getprop sys.boot_completed 2>$null).Trim()
    if ($boot -eq "1") { break }
    Start-Sleep -Seconds 2
}

Write-Host "Emulator booted." 

# Build and run the MAUI app
Push-Location $ProjectPath
try {
    Write-Host "Building and deploying Tierapp..."
    & dotnet run -f net10.0-android -p:Configuration=Debug
} finally {
    Pop-Location
}
