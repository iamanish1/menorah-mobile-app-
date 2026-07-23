import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { reportEvent } from './safeDiagnostics';

// Priority: process.env (bundled by Metro at OTA-update time) → app config extra (baked into binary)
const configBaseURL: string | undefined =
  (process.env.EXPO_PUBLIC_API_BASE_URL?.trim()) ||
  ((Constants.expoConfig?.extra as any)?.API_BASE_URL as string | undefined);

const configWebBaseURL: string | undefined =
  (process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim()) ||
  (process.env.PUBLIC_WEB_BASE_URL?.trim()) ||
  ((Constants.expoConfig?.extra as any)?.WEB_BASE_URL as string | undefined) ||
  ((Constants.expoConfig?.extra as any)?.PUBLIC_WEB_BASE_URL as string | undefined);

const configGoogleWebClientId =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ||
  ((Constants.expoConfig?.extra as any)?.GOOGLE_WEB_CLIENT_ID as string | undefined);

const configGoogleIosClientId =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ||
  ((Constants.expoConfig?.extra as any)?.GOOGLE_IOS_CLIENT_ID as string | undefined);

const configGoogleAndroidClientId =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ||
  ((Constants.expoConfig?.extra as any)?.GOOGLE_ANDROID_CLIENT_ID as string | undefined);

const configGoogleIosUrlScheme =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim() ||
  ((Constants.expoConfig?.extra as any)?.GOOGLE_IOS_URL_SCHEME as string | undefined);

const normalizeBaseURL = (url?: string) => {
  if (!url && !__DEV__) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required for production builds');
  }

  const fallbackUrl = 'http://localhost:3000/api';
  const candidate = (url ?? fallbackUrl).trim().replace(/\/+$/, '');

  // Only remap localhost for Android emulator (emulator can't reach host via localhost)
  if (Platform.OS === 'android' && candidate.includes('localhost')) {
    return candidate.replace('http://localhost', 'http://10.0.2.2');
  }

  return candidate;
};

const buildAPIBaseURL = () => normalizeBaseURL(configBaseURL);
const buildWebBaseURL = () => (configWebBaseURL ?? 'https://app.menorah.me').trim().replace(/\/+$/, '');

const deriveAPIOrigin = (baseUrl: string) => {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl.replace(/\/api$/, '').replace(/\/+$/, '');
  }
};

const API_BASE_URL = buildAPIBaseURL();
const API_ORIGIN = deriveAPIOrigin(API_BASE_URL);
const WEB_BASE_URL = buildWebBaseURL();
const IS_EXPO_GO = (Constants.executionEnvironment as string) === 'expo';

// Feature flag for Razorpay SDK integration
// Expo Go cannot load the native Razorpay module, so force WebView fallback there.
const USE_RAZORPAY_SDK = !IS_EXPO_GO;

export const ENV = {
  API_BASE_URL,
  API_ORIGIN,
  WEB_BASE_URL,
  CHECKOUT_RETURN_URL: (Constants.expoConfig?.extra as any)?.CHECKOUT_RETURN_URL as string,
  JITSI_BASE_URL: (Constants.expoConfig?.extra as any)?.JITSI_BASE_URL as string,
  GOOGLE_WEB_CLIENT_ID: configGoogleWebClientId,
  GOOGLE_IOS_CLIENT_ID: configGoogleIosClientId,
  GOOGLE_ANDROID_CLIENT_ID: configGoogleAndroidClientId,
  GOOGLE_IOS_URL_SCHEME: configGoogleIosUrlScheme,
  SOCIAL_GOOGLE_CONFIGURED: Boolean(configGoogleWebClientId && (
    Platform.OS === 'ios'
      ? configGoogleIosClientId
      : Platform.OS === 'android'
        ? configGoogleAndroidClientId
        : true
  )),
  IS_EXPO_GO,
  USE_RAZORPAY_SDK,
};

reportEvent('environment.loaded');
