# OnePlus Phone Connection Fix

## Your Device Detected
Your OnePlus phone is detected but showing as "Unknown" in Device Manager. This usually means:

1. **USB Debugging authorization needed** (most common)
2. **USB drivers need updating**

## Quick Fix Steps

### Step 1: Check Your Phone Screen
- **Is your phone unlocked?** (Screen should be ON)
- **Do you see a popup saying "Allow USB Debugging?"**
  - If YES: Tap **"Allow"** and check **"Always allow from this computer"**
  - If NO: Continue to next step

### Step 2: Enable USB Debugging (Double Check)
1. Settings → **Developer Options**
2. Make sure **USB Debugging** is **ON**
3. Also enable **"USB Debugging (Security settings)"** if available
4. Some OnePlus phones also need **"Allow USB debugging in charge only mode"** enabled

### Step 3: Change USB Connection Mode
1. **Pull down notification panel** on your phone
2. Tap the **USB notification** (usually says "USB for charging" or "USB connected")
3. Select **"File Transfer"** or **"Transfer files"** or **"MTP"**
4. **NOT** "Charging only" or "USB for charging"

### Step 4: Authorize Computer
- When you change USB mode, your phone should show:
  - **"Allow USB Debugging?"** popup
- Tap **"Allow"**
- Check **"Always allow from this computer"**
- Tap **"OK"**

### Step 5: Install OnePlus USB Drivers (If Still Not Working)

**Option A: OnePlus USB Drivers**
1. Download: https://www.oneplus.com/support/softwareupgrade/details
2. Or search: "OnePlus USB drivers" on OnePlus support site
3. Install the drivers
4. Restart your computer

**Option B: Universal ADB Drivers**
1. Download: https://adb.clockworkmod.com/
2. Install Universal ADB Drivers
3. Restart your computer

**Option C: Update Driver in Device Manager**
1. Press `Win + X` → **Device Manager**
2. Find **"ADB Interface"** or **"Unknown Device"**
3. Right-click → **Update Driver**
4. Choose **"Browse my computer for drivers"**
5. Point to: `C:\Users\user\AppData\Local\Android\Sdk\extras\google\usb_driver`
6. Or let Windows search online

### Step 6: Verify Connection

Run these commands:

```powershell
cd Menorah\mobile-app
& "C:\Users\user\AppData\Local\Android\Sdk\platform-tools\adb.exe" kill-server
& "C:\Users\user\AppData\Local\Android\Sdk\platform-tools\adb.exe" start-server
& "C:\Users\user\AppData\Local\Android\Sdk\platform-tools\adb.exe" devices
```

You should see your device listed. If it shows:
- **`device`** = Success! ✅
- **`unauthorized`** = Check your phone for authorization popup
- **`offline`** = Change USB mode to "File Transfer"
- **Nothing** = Check USB cable and drivers

### Step 7: OnePlus-Specific Settings

Some OnePlus phones need these additional settings:

1. **Settings → Developer Options:**
   - ✅ USB Debugging
   - ✅ USB Debugging (Security settings) - if available
   - ✅ Allow USB debugging in charge only mode - if available
   - ✅ Stay awake (optional but helpful)

2. **Settings → Additional Settings → Developer Options** (some OnePlus models)

3. **Try USB 2.0 port** instead of USB 3.0 (sometimes works better)

### Step 8: Try Running Your App

Once device is detected:

```powershell
npm run android
```

## Troubleshooting

### Still Not Working?

1. **Try a different USB cable** (some cables are charge-only)
2. **Try a different USB port** (prefer USB 2.0)
3. **Restart your phone**
4. **Restart your computer**
5. **Check if your phone is charging** when connected (if not, cable/port issue)
6. **Disable and re-enable USB Debugging** on your phone
7. **Revoke USB debugging authorizations** (Settings → Developer Options → Revoke USB debugging authorizations) and reconnect

### Common OnePlus Issues

- **OxygenOS/HydrogenOS**: Make sure you're using the latest version
- **USB-C port**: Try cleaning the port or using a different cable
- **Fast charging**: Some OnePlus phones have issues with fast charging cables - try a regular USB-C cable

