const TOKEN_KEY = 'menorah_admin_token';
const USER_KEY  = 'menorah_admin_user';
const COOKIE_NAME = 'mn_admin_auth';

function setCookie(value: string) {
  if (typeof document === 'undefined') return;
  // Admin sessions are shorter — 8 hours
  const maxAge = 8 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`;
}

function clearCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Strict; Secure`;
}

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string): void => {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(TOKEN_KEY, token);
    setCookie(token); // allow Next.js middleware to verify server-side
  }
};

export const clearToken = (): void => {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    clearCookie();
  }
};

export const getStoredUser = () => {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

export const setStoredUser = (user: unknown): void => {
  if (typeof window !== 'undefined') sessionStorage.setItem(USER_KEY, JSON.stringify(user));
};
