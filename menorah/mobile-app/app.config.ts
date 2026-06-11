import os from 'os';
import { ExpoConfig, ConfigContext } from 'expo/config';

const detectLocalIp = () => {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];

  for (const [, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      // Node <18 uses string 'IPv4'; Node >=18 uses number 4
      const isIPv4 = address.family === 'IPv4' || (address.family as unknown) === 4;
      if (isIPv4 && !address.internal) {
        candidates.push(address.address);
      }
    }
  }

  // Prefer 192.168.x.x (WiFi) over 10.x.x.x over 172.x.x.x (Hyper-V/Docker/VPN)
  const prefer192 = candidates.find(a => a.startsWith('192.168.'));
  if (prefer192) return prefer192;

  const prefer10 = candidates.find(a => a.startsWith('10.'));
  if (prefer10) return prefer10;

  const prefer172 = candidates.find(a => /^172\.(1[6-9]|2\d|3[0-1])\./.test(a));
  if (prefer172) return prefer172;

  return undefined;
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const isDev = process.env.NODE_ENV !== 'production';
  const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const configuredWebBaseUrl =
    process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim() ||
    process.env.PUBLIC_WEB_BASE_URL?.trim();
  const configuredLocalIp = process.env.EXPO_PUBLIC_LOCAL_IP?.trim();
  const detectedLocalIp = detectLocalIp();

  // Prefer a full API base URL from env. Otherwise build one from a local IP if provided.
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
  
  const EAS_PROJECT_ID = 'd7fb6e65-3440-4a79-b4b2-6746d2582fa7';

  return {
    ...config,
    name: 'Menorah Health',
    slug: 'menorah-health-app',
    owner: 'menorahsoftware',
    version: '2.6.0',
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
      image: './assets/splash.png',
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
        foregroundImage: './assets/brand/menorah-logo-no-bg.png',
        backgroundColor: '#f0f9f4'
      },
      package: 'com.menorah.healthmobile',
      versionCode: 14,
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
        backgroundColor: '#2d7a5c',
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
      // In Expo Go on a phone, localhost points to the phone itself.
      // Set EXPO_PUBLIC_API_BASE_URL or EXPO_PUBLIC_LOCAL_IP before starting Expo.
      // All URLs are driven by env vars — no domain is hardcoded in source.
      // In production, set EXPO_PUBLIC_API_BASE_URL, EXPO_PUBLIC_WEB_BASE_URL,
      // EXPO_PUBLIC_CHECKOUT_RETURN_URL, and EXPO_PUBLIC_JITSI_BASE_URL before building. Leaving them unset in
      // production will surface the misconfiguration immediately at startup.
      API_BASE_URL: configuredApiBaseUrl
        ? configuredApiBaseUrl.replace(/\/+$/, '')
        : (isDev ? devApiBaseUrl : undefined),

      // Public web URL used as the canonical article fallback in native clients.
      WEB_BASE_URL: configuredWebBaseUrl
        ? configuredWebBaseUrl.replace(/\/+$/, '')
        : 'https://menorahhealth.app',

      // Checkout Return URL
      CHECKOUT_RETURN_URL: process.env.EXPO_PUBLIC_CHECKOUT_RETURN_URL?.trim()
        || (isDev ? `${devApiProtocol}//${devApiHost}:8081/checkout/return` : undefined),

      // Jitsi Base URL
      JITSI_BASE_URL: process.env.EXPO_PUBLIC_JITSI_BASE_URL?.trim()
        || (isDev ? `${devApiProtocol}//${devApiHost}:8080` : undefined),
      
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
