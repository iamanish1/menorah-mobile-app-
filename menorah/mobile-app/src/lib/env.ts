import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Get base URL from app config (set via EXPO_PUBLIC_API_BASE_URL in eas.json)
const configBaseURL = (Constants.expoConfig?.extra as any)?.API_BASE_URL as string | undefined;

const normalizeBaseURL = (url?: string) => {
  const candidate = (url ?? 'http://localhost:3000/api').trim().replace(/\/+$/, '');

  // Only remap localhost for Android emulator (emulator can't reach host via localhost)
  if (Platform.OS === 'android' && candidate.includes('localhost')) {
    return candidate.replace('http://localhost', 'http://10.0.2.2');
  }

  return candidate;
};

const buildAPIBaseURL = () => normalizeBaseURL(configBaseURL);

const deriveAPIOrigin = (baseUrl: string) => {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl.replace(/\/api$/, '').replace(/\/+$/, '');
  }
};

const API_BASE_URL = buildAPIBaseURL();
const API_ORIGIN = deriveAPIOrigin(API_BASE_URL);
const IS_EXPO_GO = (Constants.executionEnvironment as string) === 'expo';

// Feature flag for Razorpay SDK integration
// Expo Go cannot load the native Razorpay module, so force WebView fallback there.
const USE_RAZORPAY_SDK = !IS_EXPO_GO;

export const ENV = {
  API_BASE_URL,
  API_ORIGIN,
  CHECKOUT_RETURN_URL: (Constants.expoConfig?.extra as any)?.CHECKOUT_RETURN_URL as string,
  JITSI_BASE_URL: (Constants.expoConfig?.extra as any)?.JITSI_BASE_URL as string,
  IS_EXPO_GO,
  USE_RAZORPAY_SDK,
};

// Debug logging
console.log('Environment Configuration:', {
  Platform: Platform.OS,
  __DEV__,
  IS_EXPO_GO: ENV.IS_EXPO_GO,
  API_BASE_URL: ENV.API_BASE_URL,
  API_ORIGIN: ENV.API_ORIGIN,
  CHECKOUT_RETURN_URL: ENV.CHECKOUT_RETURN_URL,
  JITSI_BASE_URL: ENV.JITSI_BASE_URL,
});
