import os from 'os';
import { ExpoConfig, ConfigContext } from 'expo/config';

const DEFAULT_API_BASE_URL = 'https://api.menorah.me/api';
const DEFAULT_CHECKOUT_RETURN_URL = 'https://menorah.me/checkout/return';
const DEFAULT_JITSI_BASE_URL = 'https://meet.jit.si';

const detectLocalIp = () => {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];

  for (const [, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      const isIPv4 = address.family === 'IPv4' || (address.family as unknown) === 4;
      if (isIPv4 && !address.internal) {
        candidates.push(address.address);
      }
    }
  }

  return candidates.find(a => a.startsWith('192.168.'))
    || candidates.find(a => a.startsWith('10.'))
    || candidates.find(a => /^172\.(1[6-9]|2\d|3[0-1])\./.test(a));
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const isDev = process.env.NODE_ENV !== 'production';
  const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const configuredLocalIp = process.env.EXPO_PUBLIC_LOCAL_IP?.trim();
  const detectedLocalIp = detectLocalIp();
  const devApiBaseUrl = configuredApiBaseUrl
    ? configuredApiBaseUrl.replace(/\/+$/, '')
    : configuredLocalIp
      ? `http://${configuredLocalIp}:3000/api`
      : detectedLocalIp
        ? `http://${detectedLocalIp}:3000/api`
        : 'http://localhost:3000/api';
  const devApiUrl = new URL(devApiBaseUrl);
  const devApiHost = devApiUrl.hostname;
  const devApiProtocol = devApiUrl.protocol;
  const apiBaseUrl = (configuredApiBaseUrl || (isDev ? devApiBaseUrl : DEFAULT_API_BASE_URL)).replace(/\/+$/, '');
  
  const EAS_PROJECT_ID = 'd7fb6e65-3440-4a79-b4b2-6746d2582fa7';

  return {
    ...config,
    name: 'Menorah Health',
    slug: 'menorah-health-app',
    owner: 'menorahsoftware',
    version: '2.5.0',
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
    userInterfaceStyle: 'automatic',
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
      bundleIdentifier: 'com.menorah.health.app',
      infoPlist: {
        NSCameraUsageDescription: 'Menorah Health uses camera access when you join video support sessions.',
        NSMicrophoneUsageDescription: 'Menorah Health uses microphone access when you join audio or video support sessions.',
        NSPhotoLibraryUsageDescription: 'Menorah Health uses photo library access only when you update your profile picture.',
      },
    },
    android: ({
      adaptiveIcon: {
        foregroundImage: './assets/brand/menorah_logo.png',
        backgroundColor: '#f0f9f4'
      },
      package: 'com.menorah.healthmobile',
      versionCode: 13,
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
        || (isDev ? `${devApiProtocol}//${devApiHost}:8081/checkout/return` : DEFAULT_CHECKOUT_RETURN_URL),

      // Jitsi Base URL
      JITSI_BASE_URL: process.env.EXPO_PUBLIC_JITSI_BASE_URL?.trim()
        || (isDev ? `${devApiProtocol}//${devApiHost}:8080` : DEFAULT_JITSI_BASE_URL),
      
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
