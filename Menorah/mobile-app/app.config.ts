import os from 'os';
import { ExpoConfig, ConfigContext } from 'expo/config';

const detectLocalIp = () => {
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (
        address.family === 'IPv4' &&
        !address.internal &&
        (
          address.address.startsWith('10.') ||
          address.address.startsWith('192.168.') ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(address.address)
        )
      ) {
        return address.address;
      }
    }
  }

  return undefined;
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const isDev = process.env.NODE_ENV !== 'production';
  const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
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
  
  return {
    ...config,
    name: 'Menorah Health',
    slug: 'menorah-health-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#fbf3e4'
    },
    assetBundlePatterns: [
      '**/*'
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.menorah.health.app'
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#fbf3e4'
      },
      package: 'com.menorah.health.app',
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
    },
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
      ]
    ],
    scheme: 'menorah-health',
    extra: {
      // In Expo Go on a phone, localhost points to the phone itself.
      // Set EXPO_PUBLIC_API_BASE_URL or EXPO_PUBLIC_LOCAL_IP before starting Expo.
      // All URLs are driven by env vars — no domain is hardcoded in source.
      // In production, set EXPO_PUBLIC_API_BASE_URL, EXPO_PUBLIC_CHECKOUT_RETURN_URL,
      // and EXPO_PUBLIC_JITSI_BASE_URL before building. Leaving them unset in
      // production will surface the misconfiguration immediately at startup.
      API_BASE_URL: configuredApiBaseUrl
        ? configuredApiBaseUrl.replace(/\/+$/, '')
        : (isDev ? devApiBaseUrl : undefined),

      // Checkout Return URL
      CHECKOUT_RETURN_URL: process.env.EXPO_PUBLIC_CHECKOUT_RETURN_URL?.trim()
        || (isDev ? `${devApiProtocol}//${devApiHost}:8081/checkout/return` : undefined),

      // Jitsi Base URL
      JITSI_BASE_URL: process.env.EXPO_PUBLIC_JITSI_BASE_URL?.trim()
        || (isDev ? `${devApiProtocol}//${devApiHost}:8080` : undefined),
      
      // EAS project configuration
      eas: {
        projectId: 'd2eb3d97-6034-4f64-8c36-8479f5bb658d'
      }
    },
    experiments: {
      tsconfigPaths: true
    }
  };
};
