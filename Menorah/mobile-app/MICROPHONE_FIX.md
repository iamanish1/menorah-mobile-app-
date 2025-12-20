# Microphone Fix for Video Calls

## Problem
Users who book sessions (clients) were unable to speak during video calls - their microphones were not working, while counsellors could speak fine.

## Root Cause
1. **Missing Android Permissions**: The app was missing `RECORD_AUDIO` and `CAMERA` permissions in `AndroidManifest.xml`
2. **No Permission Requests**: The app wasn't requesting microphone permissions before joining video calls
3. **WebView Configuration**: The WebView wasn't properly configured to handle microphone permissions
4. **Jitsi Configuration**: Audio wasn't explicitly enabled in the Jitsi URL configuration

## Fixes Applied

### 1. Added Android Permissions (`AndroidManifest.xml`)
- Added `RECORD_AUDIO` permission for microphone access
- Added `CAMERA` permission for video access
- Added `MODIFY_AUDIO_SETTINGS` for audio routing
- Enabled hardware acceleration for better performance

### 2. Added Permission Requests (`PreCallCheck.tsx`)
- Added runtime permission requests for microphone and camera
- Added visual indicators showing permission status
- Disabled "Join Session" button if permissions are not granted
- Shows alerts if permissions are denied

### 3. Enhanced WebView Configuration (`CallJoin.tsx`)
- Added `onPermissionRequest` handler to grant microphone/camera permissions to WebView
- Added proper WebView props for media playback
- Enabled hardware acceleration
- Added error handling for HTTP errors

### 4. Jitsi URL Configuration (`CallJoin.tsx`)
- Added Jitsi config parameters to ensure audio is enabled by default:
  - `config.startWithAudioMuted: false` - Audio starts unmuted
  - `config.startWithVideoMuted: false` - Video starts unmuted
  - `config.enableNoAudioDetection: true` - Detects when audio is not working
  - `config.enableNoisyMicDetection: true` - Detects microphone issues

## Testing Steps

1. **Rebuild the app** (permissions require a rebuild):
   ```bash
   npm run android
   ```

2. **Test Permission Flow**:
   - Open the app and navigate to a video session
   - You should see permission requests for microphone and camera
   - Grant permissions when prompted

3. **Test Video Call**:
   - Join a video call session
   - Check that microphone icon shows as active in Jitsi
   - Speak and verify the other party can hear you
   - Check that you can hear the other party

4. **Test Permission Denial**:
   - Deny microphone permission
   - Verify that "Join Session" button is disabled
   - Verify that an alert is shown explaining the need for permissions

## Important Notes

### For Users
- **First Time**: When joining a video call for the first time, you'll be asked to grant microphone and camera permissions
- **Permission Denied**: If you deny permissions, you'll need to enable them in Android Settings:
  - Settings → Apps → Menorah Health → Permissions → Microphone/Camera

### For Developers
- **Rebuild Required**: Android permission changes require a full rebuild, not just a reload
- **Testing**: Test on a real device, as emulators may have different permission behavior
- **Jitsi**: The Jitsi configuration ensures audio starts unmuted, but users can still mute/unmute themselves

## Files Modified

1. `android/app/src/main/AndroidManifest.xml` - Added permissions
2. `src/screens/call/CallJoin.tsx` - Enhanced WebView and Jitsi config
3. `src/screens/call/PreCallCheck.tsx` - Added permission requests

## Next Steps

1. **Rebuild the app**:
   ```bash
   cd Menorah/mobile-app
   npm run android
   ```

2. **Test on a real device** (not emulator) to verify microphone works

3. **If issues persist**:
   - Check Android Settings → Apps → Menorah Health → Permissions
   - Verify microphone permission is granted
   - Try uninstalling and reinstalling the app
   - Check device microphone is working in other apps

## Additional Debugging

If microphone still doesn't work:

1. **Check Logs**:
   ```bash
   adb logcat | grep -i "audio\|microphone\|permission"
   ```

2. **Verify Permissions**:
   ```bash
   adb shell dumpsys package com.menorah.health.app | grep -i permission
   ```

3. **Test Jitsi Directly**:
   - Open Jitsi URL in Chrome on Android
   - Verify microphone works there
   - If it works in Chrome but not in app, it's a WebView permission issue

4. **Check WebView Version**:
   - Ensure `react-native-webview` is up to date
   - Current version: 13.15.0

