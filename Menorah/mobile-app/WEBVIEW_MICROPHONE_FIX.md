# WebView Microphone Permission Fix

## Problem
Users on mobile phones are seeing "permission required" when trying to use the microphone in video calls. The microphone icon shows as muted even though permissions should be granted.

## Root Cause Analysis
1. **WebView Permission Handler**: The `onPermissionRequest` handler might not be called correctly
2. **Timing Issue**: WebView might load before permissions are fully granted
3. **Permission State**: Android permissions might be granted at app level but not propagated to WebView
4. **Jitsi Permission Request**: Jitsi might be requesting permissions before WebView handler is ready

## Fixes Applied

### 1. Enhanced Permission Request Flow (`CallJoin.tsx`)
- **Check existing permissions first** before requesting
- **Wait for permissions** before loading WebView
- **Show loading state** while permissions are being requested
- **Better error messages** with instructions to enable permissions

### 2. Improved WebView Configuration
- **Injected JavaScript**: Added JavaScript to request permissions when page loads
- **Enhanced `onPermissionRequest` handler**: Added logging and proper permission granting
- **Permission state management**: Only render WebView after permissions are confirmed

### 3. User Feedback
- **Loading screen**: Shows while permissions are being requested
- **Clear error messages**: Explains what permissions are needed
- **Settings instructions**: Guides users to enable permissions manually if needed

## Code Changes

### Key Changes in `CallJoin.tsx`:

1. **Permission State Management**:
   ```typescript
   const [permissionsGranted, setPermissionsGranted] = useState(false);
   ```

2. **Permission Check Before Request**:
   ```typescript
   const audioCheck = await PermissionsAndroid.check(...);
   const cameraCheck = await PermissionsAndroid.check(...);
   ```

3. **Wait for Permissions Before Rendering WebView**:
   ```typescript
   if (!permissionsGranted && Platform.OS === 'android') {
     return <LoadingScreen />;
   }
   ```

4. **Injected JavaScript**:
   ```javascript
   navigator.mediaDevices.getUserMedia({ audio: true, video: true })
   ```

5. **Enhanced Permission Handler**:
   ```typescript
   onPermissionRequest={(request) => {
     // Grant AUDIO_CAPTURE and VIDEO_CAPTURE
   }}
   ```

## Testing Steps

1. **Uninstall and Reinstall App** (important for permission testing):
   ```bash
   adb uninstall com.menorah.health.app
   npm run android
   ```

2. **Test Permission Flow**:
   - Open app and navigate to video call
   - Should see permission request dialogs
   - Grant permissions
   - WebView should load after permissions granted

3. **Test Microphone**:
   - Join video call
   - Microphone icon should NOT show as muted
   - Speak and verify other party can hear

4. **Test Permission Denial**:
   - Deny microphone permission
   - Should see clear error message
   - Should be able to retry or go to settings

## Troubleshooting

### If Microphone Still Shows as Muted:

1. **Check App Permissions**:
   ```bash
   adb shell dumpsys package com.menorah.health.app | grep permission
   ```

2. **Check WebView Logs**:
   ```bash
   adb logcat | grep -i "webview\|permission\|audio"
   ```

3. **Verify Permissions in Settings**:
   - Settings → Apps → Menorah Health → Permissions
   - Microphone should be enabled
   - Camera should be enabled

4. **Test in Chrome**:
   - Open Jitsi URL in Chrome on Android
   - If microphone works in Chrome but not in app, it's a WebView issue
   - If it doesn't work in Chrome either, it's a device/permission issue

5. **Clear App Data**:
   ```bash
   adb shell pm clear com.menorah.health.app
   ```

### Common Issues:

1. **"Permission already granted but WebView still asks"**:
   - This is normal - WebView needs its own permission grant
   - The `onPermissionRequest` handler should grant it automatically

2. **"Permissions granted but microphone still muted"**:
   - Check if Jitsi is requesting permissions correctly
   - Check WebView logs for permission errors
   - Try refreshing the WebView

3. **"Permission dialog doesn't appear"**:
   - Check if permissions are already granted
   - Check AndroidManifest.xml has RECORD_AUDIO permission
   - Rebuild the app

## Additional Debugging

### Enable WebView Debugging:
Add to `CallJoin.tsx`:
```typescript
if (__DEV__) {
  WebView.setWebContentsDebuggingEnabled(true);
}
```

### Check Permission Status:
```typescript
const checkPermissions = async () => {
  const audio = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  const camera = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
  console.log('Audio permission:', audio);
  console.log('Camera permission:', camera);
};
```

## Next Steps

1. **Rebuild the app**:
   ```bash
   cd Menorah/mobile-app
   npm run android
   ```

2. **Test on a real device** (not emulator)

3. **Monitor logs** during video call:
   ```bash
   adb logcat | grep -i "permission\|audio\|webview"
   ```

4. **If issues persist**, check:
   - Android version (some older versions have WebView permission issues)
   - WebView version (should be updated via Play Store)
   - Device-specific permission handling

## Files Modified

1. `src/screens/call/CallJoin.tsx` - Enhanced permission handling and WebView configuration

