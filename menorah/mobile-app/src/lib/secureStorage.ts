/**
 * Secure token storage — wraps expo-secure-store.
 *
 * expo-secure-store uses iOS Keychain and Android Keystore, both encrypted
 * at rest. AsyncStorage is plaintext and readable by any app with moderate
 * privileges; it must NOT be used for auth tokens.
 */
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';
const PENDING_LOGOUT_TOKENS_KEY = 'pending_logout_tokens';
const MAX_PENDING_LOGOUT_TOKENS = 5;

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

  async getPendingLogoutTokens(): Promise<string[]> {
    try {
      const value = await SecureStore.getItemAsync(PENDING_LOGOUT_TOKENS_KEY);
      if (!value) return [];
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((token): token is string => typeof token === 'string' && token.length > 0)
        : [];
    } catch {
      return [];
    }
  },

  async queuePendingLogoutToken(token: string): Promise<void> {
    if (!token) return;
    const existing = await this.getPendingLogoutTokens();
    const next = [token, ...existing.filter((candidate) => candidate !== token)]
      .slice(0, MAX_PENDING_LOGOUT_TOKENS);
    await SecureStore.setItemAsync(PENDING_LOGOUT_TOKENS_KEY, JSON.stringify(next), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  },

  async setPendingLogoutTokens(tokens: string[]): Promise<void> {
    const next = Array.from(new Set(tokens.filter(Boolean))).slice(0, MAX_PENDING_LOGOUT_TOKENS);
    if (!next.length) {
      try {
        await SecureStore.deleteItemAsync(PENDING_LOGOUT_TOKENS_KEY);
      } catch {
        // Already deleted.
      }
      return;
    }
    await SecureStore.setItemAsync(PENDING_LOGOUT_TOKENS_KEY, JSON.stringify(next), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  },
};
