# Android Device Connection Fix Guide

## Quick Fix Steps

Your phone is connected via USB but not being detected by ADB. Follow these steps:

### 1. Enable USB Debugging on Your Phone

1. Go to **Settings** > **About Phone**
2. Find **Build Number** and tap it **7 times** (you'll see a message saying "You are now a developer!")
3. Go back to **Settings** > **Developer Options** (or **System** > **Developer Options**)
4. Enable **USB Debugging**
5. Also enable **Stay Awake** (keeps screen on while charging) - optional but helpful

### 2. Change USB Connection Mode

When you connect your phone:
- **Pull down the notification panel** on your phone
- Tap the USB notification
- Select **File Transfer** or **MTP** mode
- **NOT** "Charging Only" or "USB for charging"

### 3. Authorize USB Debugging

When you connect your phone:
- Your phone will show a popup: **"Allow USB Debugging?"**
- Check the box: **"Always allow from this computer"**
- Tap **OK** or **Allow**

### 4. Install USB Drivers (If Needed)

**Check Device Manager first:**
- Press `Win + X` and select **Device Manager**
- Look for your phone under:
  - **Portable Devices**
  - **Android Phone**
  - **Other Devices** (if driver is missing)
- If you see a **yellow exclamation mark**, you need drivers

**Install drivers based on your phone brand:**
- **Samsung**: [Samsung USB Drivers](https://developer.samsung.com/mobile/android-usb-driver.html)
- **Xiaomi**: [Mi USB Drivers](https://www.xiaomi.com/en/support/download/driver)
- **OnePlus**: [OnePlus USB Drivers](https://www.oneplus.com/support/softwareupgrade/details)
- **Google Pixel**: Usually works automatically
- **Generic/Other**: [Universal ADB Drivers](https://adb.clockworkmod.com/)

### 5. Restart ADB Server

After enabling USB debugging and changing connection mode:

```powershell
# Navigate to your project
cd Menorah\mobile-app

# Restart ADB
& "C:\Users\user\AppData\Local\Android\Sdk\platform-tools\adb.exe" kill-server
& "C:\Users\user\AppData\Local\Android\Sdk\platform-tools\adb.exe" start-server
& "C:\Users\user\AppData\Local\Android\Sdk\platform-tools\adb.exe" devices
```

You should see your device listed. If it shows `unauthorized`, check your phone for the authorization popup.

### 6. Add ADB to PATH (Optional but Recommended)

This makes ADB available system-wide:

1. Press `Win + X` and select **System**
2. Click **Advanced system settings**
3. Click **Environment Variables**
4. Under **User variables**, find **Path** and click **Edit**
5. Click **New** and add: `C:\Users\user\AppData\Local\Android\Sdk\platform-tools`
6. Click **OK** on all dialogs
7. **Restart PowerShell/Terminal**

### 7. Try Running Your App Again

```powershell
npm run android
```

## Troubleshooting Script

Run the automated troubleshooting script:

```powershell
cd Menorah\mobile-app
.\fix-android-connection.ps1
```

## Common Issues

### Device shows as "unauthorized"
- Check your phone for the USB debugging authorization popup
- Tap "Allow" and check "Always allow from this computer"

### Device shows as "offline"
- Unplug and replug your USB cable
- Restart ADB server (see step 5)
- Try a different USB cable (some cables are charge-only)

### Device not showing at all
- Make sure USB debugging is enabled
- Make sure USB mode is "File Transfer" not "Charging Only"
- Check Device Manager for driver issues
- Try a different USB port (prefer USB 2.0 ports)
- Try a different USB cable

### "ADB not found" error
- Make sure Android SDK Platform Tools are installed
- Add ADB to PATH (see step 6)
- Or use the full path: `C:\Users\user\AppData\Local\Android\Sdk\platform-tools\adb.exe`

## Still Having Issues?

1. Make sure your phone is unlocked when connecting
2. Try enabling "USB Debugging (Security settings)" in Developer Options
3. Some phones require "Allow USB debugging in charge only mode" to be enabled
4. Check if your phone manufacturer has specific USB debugging requirements

