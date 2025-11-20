import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const isDev = process.env.NODE_ENV !== 'production';
  
  // For mobile devices, use local network IP instead of localhost
  // Replace '192.168.1.2' with your actual local IP address
  const LOCAL_IP = '192.168.1.2'; // CHANGE THIS TO YOUR IP
  
  return {
    ...config,
    name: 'Menorah Health',
    slug: 'menorah-health-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/brand/glyph.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/brand/splash.png',
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
        foregroundImage: './assets/brand/glyph.png',
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
      favicon: './assets/brand/glyph.png',
      bundler: 'metro'
    },
    scheme: 'menorah-health',
    extra: {
      // API Base URL - use IP for mobile, localhost for web
      API_BASE_URL: isDev
        ? `http://${LOCAL_IP}:3000/api`  // Use IP for mobile devices
        : 'https://app-api.menorahhealth.app/api',
      
      // Checkout Return URL
      CHECKOUT_RETURN_URL: isDev
        ? `http://${LOCAL_IP}:8081/checkout/return`
        : 'https://menorahhealth.app/checkout/return',
      
      // Jitsi Base URL
      JITSI_BASE_URL: isDev
        ? `http://${LOCAL_IP}:8080`
        : 'https://meet.menorahhealth.app',
      
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
