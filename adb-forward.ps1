$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")

Write-Host "Checking connected devices..." -ForegroundColor Cyan
$devices = adb devices | Select-String "device$"

if (-not $devices) {
    Write-Host "No device found! Make sure USB Debugging is ON and cable is connected." -ForegroundColor Red
    pause
    exit
}

Write-Host "Device found!" -ForegroundColor Green
adb reverse tcp:8000 tcp:8000 | Out-Null
adb reverse tcp:5173 tcp:5173 | Out-Null
Write-Host "Port forwarding active!" -ForegroundColor Green
Write-Host ""
Write-Host "Open this on your phone's Chrome:" -ForegroundColor Yellow
Write-Host "  http://localhost:5173" -ForegroundColor White
Write-Host ""
pause
