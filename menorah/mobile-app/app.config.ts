import { ExpoConfig, ConfigContext } from 'expo/config';

const DEFAULT_API_BASE_URL = 'https://api.menorah.me/api';
const DEFAULT_CHECKOUT_RETURN_URL = 'https://menorah.me/checkout/return';
const DEFAULT_JITSI_BASE_URL = 'https://meet.jit.si';

export default ({ config }: ConfigContext): ExpoConfig => {
  const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const apiBaseUrl = (configuredApiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  
  const EAS_PROJECT_ID = 'd7fb6e65-3440-4a79-b4b2-6746d2582fa7';

  return {
    ...config,
    name: 'Menorah Health',
    slug: 'menorah-health-app',
    owner: 'menorahsoftware',
    version: '2.4.0',
    orientation: 'portrait',
    // ─── OTA Updates via EAS Update ──────────────────────────────────────────
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: '1.0.0',
    // ─────────────────────────────────────────────────────────────────────────
    icon: './assets/brand/menorah_logo.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/brand/menorah_logo.png',
      resizeMode: 'contain',
      backgroundColor: '#f0f9f4'
    },
    assetBundlePatterns: [
      '**/*'
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.menorah.health.app'
    },
    android: ({
      adaptiveIcon: {
        foregroundImage: './assets/brand/menorah_logo.png',
        backgroundColor: '#f0f9f4'
      },
      package: 'com.menorah.healthmobile',
      versionCode: 12,
      permissions: [
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE'
      ],
      statusBar: {
        barStyle: 'light-content',
        backgroundColor: '#314830',
        translucent: false
      },
      navigationBar: {
        visible: 'leanback',
        backgroundColor: '#ffffff',
        barStyle: 'dark-content'
      }
    } as any),
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro'
    },
    plugins: [
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow Menorah Health to access your photos so you can update your profile picture.',
        }
      ],
      [
        'expo-updates',
        {
          username: 'menorahsoftware'
        }
      ]
    ],
    scheme: 'menorah-health',
    extra: {
      // Default to the deployed Cloudflare gateway, which routes to VPS/Cloud Run.
      // Set EXPO_PUBLIC_API_BASE_URL only when intentionally targeting another API.
      API_BASE_URL: apiBaseUrl,

      // Checkout Return URL
      CHECKOUT_RETURN_URL: process.env.EXPO_PUBLIC_CHECKOUT_RETURN_URL?.trim()
        || DEFAULT_CHECKOUT_RETURN_URL,

      // Jitsi Base URL
      JITSI_BASE_URL: process.env.EXPO_PUBLIC_JITSI_BASE_URL?.trim()
        || DEFAULT_JITSI_BASE_URL,
      
      // EAS project configuration
      eas: {
        projectId: EAS_PROJECT_ID
      }
    },
    experiments: {
      tsconfigPaths: true
    }
  };
};
