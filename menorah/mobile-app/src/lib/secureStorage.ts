/**
 * Secure token storage — wraps expo-secure-store.
 *
 * expo-secure-store uses iOS Keychain and Android Keystore, both encrypted
 * at rest. AsyncStorage is plaintext and readable by any app with moderate
 * privileges; it must NOT be used for auth tokens.
 */
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';

export const secureStorage = {
  async getToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  },

  async clearToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // Already deleted — not an error
    }
  },
};
