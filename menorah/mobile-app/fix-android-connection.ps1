# Android Device Connection Troubleshooting Script
# This script helps diagnose and fix Android device connection issues

Write-Host "=== Android Device Connection Troubleshooting ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check ADB location
$adbPath = "C:\Users\user\AppData\Local\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adbPath)) {
    Write-Host "ERROR: ADB not found at: $adbPath" -ForegroundColor Red
    Write-Host "Please install Android Studio or Android SDK Platform Tools" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] ADB found at: $adbPath" -ForegroundColor Green
Write-Host ""

# Step 2: Check if ADB server is running
Write-Host "Checking ADB server status..." -ForegroundColor Yellow
& $adbPath kill-server 2>$null
Start-Sleep -Seconds 2
& $adbPath start-server
Start-Sleep -Seconds 2

# Step 3: Check connected devices
Write-Host ""
Write-Host "Checking for connected devices..." -ForegroundColor Yellow
$devices = & $adbPath devices
Write-Host $devices

if ($devices -match "device$") {
    Write-Host ""
    Write-Host "[OK] Device detected!" -ForegroundColor Green
    Write-Host "You can now run: npm run android" -ForegroundColor Cyan
    exit 0
}

Write-Host ""
Write-Host "WARNING: No devices detected. Follow these steps:" -ForegroundColor Yellow
Write-Host ""

Write-Host "1. ENABLE USB DEBUGGING on your phone:" -ForegroundColor Cyan
Write-Host "   - Go to Settings > About Phone"
Write-Host "   - Tap 'Build Number' 7 times to enable Developer Options"
Write-Host "   - Go back to Settings > Developer Options"
Write-Host "   - Enable 'USB Debugging'"
Write-Host ""

Write-Host "2. CHANGE USB CONNECTION MODE:" -ForegroundColor Cyan
Write-Host "   - When you connect your phone, select 'File Transfer' or 'MTP' mode"
Write-Host "   - NOT 'Charging Only' mode"
Write-Host ""

Write-Host "3. AUTHORIZE USB DEBUGGING:" -ForegroundColor Cyan
Write-Host "   - When you connect, your phone will show a popup: 'Allow USB Debugging?'"
Write-Host "   - Check 'Always allow from this computer' and tap 'OK'"
Write-Host ""

Write-Host "4. INSTALL USB DRIVERS (if needed):" -ForegroundColor Cyan
Write-Host "   - For Samsung: Install Samsung USB Drivers"
Write-Host "   - For Xiaomi: Install Mi USB Drivers"
Write-Host "   - For OnePlus: Install OnePlus USB Drivers"
Write-Host "   - For Google Pixel: Usually works automatically"
Write-Host "   - Generic: Install Universal ADB Drivers"
Write-Host ""

Write-Host "5. TRY THESE COMMANDS:" -ForegroundColor Cyan
Write-Host "   - Unplug and replug your USB cable"
Write-Host "   - Run: & '$adbPath' kill-server"
Write-Host "   - Run: & '$adbPath' start-server"
Write-Host "   - Run: & '$adbPath' devices"
Write-Host ""

Write-Host "6. CHECK DEVICE MANAGER:" -ForegroundColor Cyan
Write-Host "   - Open Device Manager (Win + X > Device Manager)"
Write-Host "   - Look for your phone under 'Portable Devices' or 'Android Phone'"
Write-Host "   - If it shows a yellow exclamation mark, update the driver"
Write-Host ""

Write-Host "After completing these steps, run this script again to verify." -ForegroundColor Yellow
Write-Host ""

# Try to restart ADB and check again
Write-Host "Attempting to restart ADB server..." -ForegroundColor Yellow
& $adbPath kill-server
Start-Sleep -Seconds 2
& $adbPath start-server
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "Rechecking devices..." -ForegroundColor Yellow
$devices = & $adbPath devices
Write-Host $devices

if ($devices -match "device$") {
    Write-Host ""
    Write-Host "[OK] Device detected after restart!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Still no devices detected. Please follow the steps above." -ForegroundColor Red
}

