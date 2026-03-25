import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Get IP from config, fallback to localhost for web, but should use IP for mobile
const configIP = (Constants.expoConfig?.extra as any)?.API_BASE_URL?.match(/http:\/\/([^:]+)/)?.[1];
const isWeb = Platform.OS === 'web';

// Default to IP from config or localhost for web
// Fallback to localhost for dev — production URL must come from app.config.ts via EXPO_PUBLIC_API_BASE_URL.
const DEFAULT_API_BASE_URL = configIP
  ? `http://${configIP}:3000/api`
  : 'http://localhost:3000/api';

// Get base URL from config
const configBaseURL = (Constants.expoConfig?.extra as any)?.API_BASE_URL as string;

const normalizeBaseURL = (url?: string) => {
  const candidate = (url ?? DEFAULT_API_BASE_URL).trim();
  const normalized = candidate.replace(/\/+$/, '');

  // Android emulators cannot reach services on the host machine via localhost.
  if (Platform.OS === 'android') {
    return normalized.replace('http://localhost', 'http://10.0.2.2');
  }

  return normalized;
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
const IS_EXPO_GO = Constants.appOwnership === 'expo';

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
  configIP,
  IS_EXPO_GO: ENV.IS_EXPO_GO,
  API_BASE_URL: ENV.API_BASE_URL,
  API_ORIGIN: ENV.API_ORIGIN,
  CHECKOUT_RETURN_URL: ENV.CHECKOUT_RETURN_URL,
  JITSI_BASE_URL: ENV.JITSI_BASE_URL,
});
