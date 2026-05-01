# Interactive Phone Connection Verification Script

Write-Host "=== Phone Connection Verification ===" -ForegroundColor Cyan
Write-Host ""

$adbPath = "C:\Users\user\AppData\Local\Android\Sdk\platform-tools\adb.exe"

# Restart ADB
Write-Host "Restarting ADB server..." -ForegroundColor Yellow
& $adbPath kill-server 2>$null
Start-Sleep -Seconds 2
& $adbPath start-server
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "Checking for devices..." -ForegroundColor Yellow
$devicesOutput = & $adbPath devices 2>&1
Write-Host $devicesOutput

Write-Host ""
Write-Host "=== CHECKLIST - Please verify each step ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Is your phone UNLOCKED right now?" -ForegroundColor Yellow
Write-Host "   → Your phone screen should be ON and UNLOCKED" -ForegroundColor White
Write-Host ""

Write-Host "2. Is USB Debugging ENABLED?" -ForegroundColor Yellow
Write-Host "   → Settings > Developer Options > USB Debugging (should be ON)" -ForegroundColor White
Write-Host ""

Write-Host "3. What USB mode is selected?" -ForegroundColor Yellow
Write-Host "   → Pull down notifications on your phone" -ForegroundColor White
Write-Host "   → Tap the USB notification" -ForegroundColor White
Write-Host "   → Is it set to 'File Transfer' or 'MTP'?" -ForegroundColor White
Write-Host "   → NOT 'Charging Only' or 'USB for charging'" -ForegroundColor Red
Write-Host ""

Write-Host "4. Did you see an authorization popup?" -ForegroundColor Yellow
Write-Host "   → When you connected, did your phone show 'Allow USB Debugging?'" -ForegroundColor White
Write-Host "   → Did you tap 'Allow' or 'OK'?" -ForegroundColor White
Write-Host "   → Did you check 'Always allow from this computer'?" -ForegroundColor White
Write-Host ""

Write-Host "5. Check Device Manager:" -ForegroundColor Yellow
Write-Host "   → Press Win + X, select 'Device Manager'" -ForegroundColor White
Write-Host "   → Look for your phone name under:" -ForegroundColor White
Write-Host "     - 'Portable Devices' (good!)" -ForegroundColor Green
Write-Host "     - 'Android Phone' (good!)" -ForegroundColor Green
Write-Host "     - 'Other Devices' with yellow warning (needs driver)" -ForegroundColor Red
Write-Host ""

Write-Host "Press Enter after checking these items..." -ForegroundColor Cyan
Read-Host

Write-Host ""
Write-Host "Rechecking devices..." -ForegroundColor Yellow
& $adbPath kill-server 2>$null
Start-Sleep -Seconds 2
& $adbPath start-server
Start-Sleep -Seconds 3

$finalCheck = & $adbPath devices
Write-Host $finalCheck

if ($finalCheck -match "device\s+device$") {
    Write-Host ""
    Write-Host "[SUCCESS] Device detected! You can now run: npm run android" -ForegroundColor Green
} elseif ($finalCheck -match "unauthorized") {
    Write-Host ""
    Write-Host "[ACTION NEEDED] Device is unauthorized!" -ForegroundColor Red
    Write-Host "→ Check your phone for 'Allow USB Debugging?' popup" -ForegroundColor Yellow
    Write-Host "→ Tap 'Allow' and check 'Always allow from this computer'" -ForegroundColor Yellow
} elseif ($finalCheck -match "offline") {
    Write-Host ""
    Write-Host "[ACTION NEEDED] Device is offline!" -ForegroundColor Red
    Write-Host "→ Unplug and replug your USB cable" -ForegroundColor Yellow
    Write-Host "→ Make sure USB mode is 'File Transfer' not 'Charging Only'" -ForegroundColor Yellow
    Write-Host "→ Try a different USB cable or USB port" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "[ISSUE] Device still not detected" -ForegroundColor Red
    Write-Host ""
    Write-Host "Try these steps:" -ForegroundColor Yellow
    Write-Host "1. Unplug and replug your USB cable" -ForegroundColor White
    Write-Host "2. Make sure USB mode is 'File Transfer' (not Charging Only)" -ForegroundColor White
    Write-Host "3. Check Device Manager for driver issues" -ForegroundColor White
    Write-Host "4. Try a different USB cable (some are charge-only)" -ForegroundColor White
    Write-Host "5. Try a different USB port (prefer USB 2.0)" -ForegroundColor White
    Write-Host "6. Restart your phone" -ForegroundColor White
    Write-Host ""
    Write-Host "If Device Manager shows a yellow warning, install USB drivers:" -ForegroundColor Yellow
    Write-Host "→ Samsung: https://developer.samsung.com/mobile/android-usb-driver.html" -ForegroundColor White
    Write-Host "→ Xiaomi: https://www.xiaomi.com/en/support/download/driver" -ForegroundColor White
    Write-Host "→ Generic: https://adb.clockworkmod.com/" -ForegroundColor White
}

