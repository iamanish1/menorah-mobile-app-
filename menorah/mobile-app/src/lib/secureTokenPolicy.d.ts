interface SecureTokenAdapter {
  readSecureToken(): Promise<string | null>;
  writeSecureToken(token: string): Promise<void>;
  deleteSecureToken(): Promise<void>;
  getClearPending(): Promise<boolean>;
  setClearPending(): Promise<void>;
  deleteClearPending(): Promise<void>;
}

interface SecureTokenStorage {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

export function createSecureTokenStorage(
  adapter: SecureTokenAdapter,
): SecureTokenStorage;
