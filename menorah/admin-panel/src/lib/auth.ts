const USER_KEY = 'menorah_admin_user';

export const clearStoredUser = (): void => {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(USER_KEY);
  }
};

export const getStoredUser = () => {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const setStoredUser = (user: unknown): void => {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  }
};
