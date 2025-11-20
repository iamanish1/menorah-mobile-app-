import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Get IP from config, fallback to localhost for web, but should use IP for mobile
const configIP = (Constants.expoConfig?.extra as any)?.API_BASE_URL?.match(/http:\/\/([^:]+)/)?.[1];
const isWeb = Platform.OS === 'web';

// Default to IP from config or localhost for web
const DEFAULT_API_BASE_URL = configIP 
  ? `http://${configIP}:3000/api`
  : (isWeb ? 'http://localhost:3000/api' : 'https://app-api.menorahhealth.app/api');

// Get base URL from config
const configBaseURL = (Constants.expoConfig?.extra as any)?.API_BASE_URL as string;

const normalizeBaseURL = (url?: string) => {
  const candidate = (url ?? DEFAULT_API_BASE_URL).trim();
  return candidate.replace(/\/+$/, '');
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

// Feature flag for Razorpay SDK integration
// Set to false to fallback to WebView approach
const USE_RAZORPAY_SDK = true;

export const ENV = {
  API_BASE_URL,
  API_ORIGIN,
  CHECKOUT_RETURN_URL: (Constants.expoConfig?.extra as any)?.CHECKOUT_RETURN_URL as string,
  JITSI_BASE_URL: (Constants.expoConfig?.extra as any)?.JITSI_BASE_URL as string,
  USE_RAZORPAY_SDK,
};

// Debug logging
console.log('Environment Configuration:', {
  Platform: Platform.OS,
  __DEV__,
  configIP,
  API_BASE_URL: ENV.API_BASE_URL,
  API_ORIGIN: ENV.API_ORIGIN,
  CHECKOUT_RETURN_URL: ENV.CHECKOUT_RETURN_URL,
  JITSI_BASE_URL: ENV.JITSI_BASE_URL,
});
