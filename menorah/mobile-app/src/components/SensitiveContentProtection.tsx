import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

const APP_CONTENT_KEY = 'menorah-sensitive-app-content';

export default function SensitiveContentProtection() {
  useEffect(() => {
    // Authentication, reset, OTP, profile, booking, and clinical screens all
    // carry sensitive data. Keep capture blocked for the entire app lifecycle.
    ScreenCapture.preventScreenCaptureAsync(APP_CONTENT_KEY).catch(() => {});

    return () => {
      ScreenCapture.allowScreenCaptureAsync(APP_CONTENT_KEY).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    ScreenCapture.enableAppSwitcherProtectionAsync(1).catch(() => {});
    return () => {
      ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
    };
  }, []);

  return null;
}
