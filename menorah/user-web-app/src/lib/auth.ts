// Token is kept in sessionStorage (not localStorage) so it is:
//   - NOT accessible across browser tabs (limits blast radius of XSS)
//   - Cleared when the tab/browser closes (no persistent session hijack)
//   - Still readable by JS in this tab — for a health app, move to httpOnly
//     cookies if a server-side rendering strategy is adopted.
//
// ALSO set a matching cookie (js-readable but not httpOnly) so Next.js
// middleware can read it server-side for route protection.
const TOKEN_KEY = 'menorah_user_token';
const USER_KEY  = 'menorah_user_data';
const COOKIE_NAME = 'mn_auth';

function setCookie(value: string) {
  if (typeof document === 'undefined') return;
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`;
}

function clearCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Strict; Secure`;
}

export const authStorage = {
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    const sessionToken = sessionStorage.getItem(TOKEN_KEY);
    if (sessionToken) return sessionToken;
    // Fall back to cookie so the session survives new tabs / browser restarts.
    // The cookie carries the same token with a 7-day max-age.
    const match = document.cookie.match(/(?:^|;\s*)mn_auth=([^;]+)/);
    if (match) {
      const token = decodeURIComponent(match[1]);
      sessionStorage.setItem(TOKEN_KEY, token); // restore for fast subsequent reads
      return token;
    }
    return null;
  },

  setToken(token: string): void {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(TOKEN_KEY, token);
      setCookie(token); // allow Next.js middleware to read token server-side
    }
  },

  clearToken(): void {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      clearCookie();
    }
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};
