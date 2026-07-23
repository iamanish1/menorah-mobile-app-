/**
 * Secure token storage wraps the platform Keychain/Keystore.
 *
 * AsyncStorage only carries a non-secret deletion tombstone. Bearer tokens
 * must never be written outside expo-secure-store.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createSecureTokenStorage } from './secureTokenPolicy';

const TOKEN_KEY = 'auth_token';
const TOKEN_CLEAR_PENDING_KEY = 'auth_token_clear_pending';
const TOKEN_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

export const secureStorage = createSecureTokenStorage({
  readSecureToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  writeSecureToken: (token) => SecureStore.setItemAsync(TOKEN_KEY, token, TOKEN_OPTIONS),
  deleteSecureToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
  getClearPending: async () =>
    (await AsyncStorage.getItem(TOKEN_CLEAR_PENDING_KEY)) === 'true',
  setClearPending: () => AsyncStorage.setItem(TOKEN_CLEAR_PENDING_KEY, 'true'),
  deleteClearPending: () => AsyncStorage.removeItem(TOKEN_CLEAR_PENDING_KEY),
});
