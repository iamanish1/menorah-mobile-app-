# Development Build Guide for Razorpay SDK Testing

This guide will help you create a development build to test the Razorpay React Native SDK integration.

## Prerequisites

### 1. Install Android Studio
- Download and install [Android Studio](https://developer.android.com/studio)
- During installation, make sure to install:
  - Android SDK
  - Android SDK Platform
  - Android Virtual Device (AVD) - Optional, if using emulator

### 2. Set Up Android Environment
- Set `ANDROID_HOME` environment variable:
  - Windows: `C:\Users\YourUsername\AppData\Local\Android\Sdk`
  - Add to PATH: `%ANDROID_HOME%\platform-tools` and `%ANDROID_HOME%\tools`

### 3. Enable USB Debugging (For Physical Device)
- On your Android device:
  1. Go to Settings → About Phone
  2. Tap "Build Number" 7 times to enable Developer Options
  3. Go back to Settings → Developer Options
  4. Enable "USB Debugging"
  5. Connect device via USB

### 4. Verify Java Installation
- Android Studio includes JDK, but verify:
```bash
java -version
```
- Should show Java 17 or higher

## Step-by-Step Build Instructions

### Step 1: Update Local IP (if needed)
Check your `app.config.ts` and update `LOCAL_IP` if your IP address has changed:
```typescript
const LOCAL_IP = '192.168.1.3'; // Replace with your actual IP
```

To find your IP:
- Windows: Open PowerShell and run `ipconfig`
- Look for "IPv4 Address" under your active network adapter

### Step 2: Ensure Backend is Running
Make sure your backend server is running on port 3000:
```bash
cd Menorah/backend
npm start
```

### Step 3: Clean Previous Builds (Optional but Recommended)
```bash
cd Menorah/mobile-app
# Clean Android build
cd android
./gradlew clean
cd ..
```

### Step 4: Build Development App
From the `Menorah/mobile-app` directory:

**Option A: Build and Install on Connected Device**
```bash
npx expo run:android
```

**Option B: Build for Specific Device**
```bash
# List connected devices
adb devices

# Build for specific device
npx expo run:android --device
```

**Option C: Build for Emulator**
```bash
# Start emulator first (from Android Studio)
# Then run:
npx expo run:android
```

### Step 5: Wait for Build to Complete
- First build can take 10-20 minutes (downloads dependencies)
- Subsequent builds are faster (2-5 minutes)
- You'll see progress in the terminal

### Step 6: App Installation
- The app will automatically install on your connected device/emulator
- Look for "Menorah Health" app icon
- First launch may take 30-60 seconds to initialize

## Testing the Razorpay SDK

### 1. Start Development Server
After the app is installed, start the Expo development server:
```bash
cd Menorah/mobile-app
npx expo start --dev-client
```

### 2. Test Payment Flow
1. Open the app on your device
2. Log in to your account
3. Create a booking
4. Proceed to payment
5. The Razorpay SDK should open natively (not in WebView)
6. Complete test payment with Razorpay test credentials

### 3. Verify SDK Integration
- ✅ Payment screen opens natively (not blank)
- ✅ User data (email, phone, name) is pre-filled
- ✅ Payment completion navigates to success screen
- ✅ Payment cancellation returns to previous screen

## Troubleshooting

### Issue: "No Android connected device found"
**Solution:**
1. Check USB connection
2. Enable USB debugging on device
3. Run `adb devices` to verify device is detected
4. Try `adb kill-server && adb start-server`

### Issue: "Command failed: gradlew.bat"
**Solution:**
1. Navigate to `android` folder
2. Run `gradlew.bat clean` manually
3. Try building again

### Issue: Build fails with "SDK not found"
**Solution:**
1. Open Android Studio
2. Go to Tools → SDK Manager
3. Install Android SDK Platform 33 or 34
4. Install Android SDK Build-Tools

### Issue: "Metro bundler connection failed"
**Solution:**
1. Make sure device and computer are on same network
2. Check firewall settings
3. Update `LOCAL_IP` in `app.config.ts`
4. Try tunnel mode: `npx expo start --dev-client --tunnel`

### Issue: App crashes on payment screen
**Solution:**
1. Check logs: `adb logcat | grep -i razorpay`
2. Verify `USE_RAZORPAY_SDK` is `true` in `env.ts`
3. Ensure backend returns `keyId` in response
4. Check Razorpay test keys are correct

### Issue: Payment screen still shows blank/WebView
**Solution:**
1. Verify feature flag: Check `src/lib/env.ts` - `USE_RAZORPAY_SDK` should be `true`
2. Rebuild app: `npx expo run:android` (native modules need rebuild)
3. Check console logs for SDK initialization errors

## Quick Commands Reference

```bash
# Build and install on device
npx expo run:android

# Start dev server
npx expo start --dev-client

# Check connected devices
adb devices

# View device logs
adb logcat

# Clear app data (if needed)
adb shell pm clear com.menorah.health.app

# Uninstall app
adb uninstall com.menorah.health.app
```

## Next Steps After Successful Build

1. ✅ Test payment success flow
2. ✅ Test payment cancellation
3. ✅ Test payment failure handling
4. ✅ Verify user data prefill
5. ✅ Test payment verification with backend

## Notes

- **First build takes longer**: Be patient, it downloads all Android dependencies
- **Subsequent builds are faster**: Only changed code is rebuilt
- **Keep device connected**: For hot reloading and debugging
- **Development build is different from Expo Go**: This is a custom build with native modules

## Need Help?

If you encounter issues:
1. Check the error message in terminal
2. Review Android Studio logs
3. Check `adb logcat` for runtime errors
4. Verify all prerequisites are installed

