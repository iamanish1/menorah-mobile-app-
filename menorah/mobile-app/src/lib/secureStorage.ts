/**
 * Secure token storage wraps the platform Keychain/Keystore.
 *
 * AsyncStorage carries only a non-secret deletion tombstone. Bearer tokens,
 * including deferred logout tokens, remain in expo-secure-store.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createSecureTokenStorage } from './secureTokenPolicy';

const TOKEN_KEY = 'auth_token';
const TOKEN_CLEAR_PENDING_KEY = 'auth_token_clear_pending';
const PENDING_LOGOUT_TOKENS_KEY = 'pending_logout_tokens';
const MAX_PENDING_LOGOUT_TOKENS = 5;
const TOKEN_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

const authTokenStorage = createSecureTokenStorage({
  readSecureToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  writeSecureToken: (token) =>
    SecureStore.setItemAsync(TOKEN_KEY, token, TOKEN_OPTIONS),
  deleteSecureToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
  getClearPending: async () =>
    (await AsyncStorage.getItem(TOKEN_CLEAR_PENDING_KEY)) === 'true',
  setClearPending: () =>
    AsyncStorage.setItem(TOKEN_CLEAR_PENDING_KEY, 'true'),
  deleteClearPending: () =>
    AsyncStorage.removeItem(TOKEN_CLEAR_PENDING_KEY),
});

const readPendingLogoutTokens = async (): Promise<string[]> => {
  try {
    const value = await SecureStore.getItemAsync(PENDING_LOGOUT_TOKENS_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (token): token is string =>
            typeof token === 'string' && token.length > 0,
        )
      : [];
  } catch {
    return [];
  }
};

export const secureStorage = {
  getToken: () => authTokenStorage.getToken(),
  setToken: (token: string) => authTokenStorage.setToken(token),
  clearToken: () => authTokenStorage.clearToken(),

  getPendingLogoutTokens: readPendingLogoutTokens,

  async queuePendingLogoutToken(token: string): Promise<void> {
    if (!token) return;
    const existing = await readPendingLogoutTokens();
    const next = [token, ...existing.filter((candidate) => candidate !== token)]
      .slice(0, MAX_PENDING_LOGOUT_TOKENS);
    await SecureStore.setItemAsync(
      PENDING_LOGOUT_TOKENS_KEY,
      JSON.stringify(next),
      TOKEN_OPTIONS,
    );
  },

  async setPendingLogoutTokens(tokens: string[]): Promise<void> {
    const next = Array.from(new Set(tokens.filter(Boolean)))
      .slice(0, MAX_PENDING_LOGOUT_TOKENS);
    if (!next.length) {
      try {
        await SecureStore.deleteItemAsync(PENDING_LOGOUT_TOKENS_KEY);
      } catch {
        // A later retry can safely attempt the same deletion.
      }
      return;
    }

    await SecureStore.setItemAsync(
      PENDING_LOGOUT_TOKENS_KEY,
      JSON.stringify(next),
      TOKEN_OPTIONS,
    );
  },
};
