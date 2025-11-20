// Keep these FIRST — before any other imports
import 'react-native-gesture-handler';
import 'react-native-get-random-values';

// Polyfills for socket.io-client - must be done before any socket.io imports
const setupPolyfills = () => {
  try {
    const BufferPolyfill = require('buffer').Buffer;
    const processPolyfill = require('process');
    
    if (typeof global.Buffer === 'undefined') {
      global.Buffer = BufferPolyfill;
    }
    if (typeof global.process === 'undefined') {
      global.process = processPolyfill;
    }
  } catch (e) {
    console.warn('Polyfill setup warning:', e);
  }
};

setupPolyfills();

import { registerRootComponent } from 'expo';
import { enableScreens } from 'react-native-screens';
import { LogBox } from 'react-native';
import App from './App';

// Improve navigation performance with native screens
enableScreens(true);

// Ignore specific warnings that might be causing issues
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'ViewPropTypes will be removed from React Native',
  'AsyncStorage has been extracted from react-native',
  'Require cycle:',
  'Warning: Cannot update a component',
  'Warning: React.createElement: type is invalid',
]);

// Performance optimizations
if (__DEV__) {
  // Disable yellow box warnings in development for better performance
  LogBox.ignoreAllLogs();
}

// Register the root component for Expo Go & dev builds
registerRootComponent(App);
