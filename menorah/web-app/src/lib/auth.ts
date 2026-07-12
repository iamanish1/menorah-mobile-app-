import { api } from './api';
import { User } from '@/types';

export interface RoleRedirect {
  actualRole?: string;
  expectedRole?: string;
  redirectUrl?: string;
  redirectLabel?: string;
}

export interface AuthLoginResult {
  success: boolean;
  message?: string;
  roleRedirect?: RoleRedirect;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthLoginResult>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

let authState: {
  user: User | null;
  isLoading: boolean;
} = {
  user: null,
  isLoading: true,
};

const listeners: Set<() => void> = new Set();
const USER_APP_LOGIN_URL = process.env.NEXT_PUBLIC_USER_APP_URL || 'https://app.menorah.me/login';

const normalizeRole = (role?: string) => {
  const normalized = String(role || 'user').toLowerCase();
  return normalized === 'counselor' ? 'counsellor' : normalized;
};

const getRoleRedirect = (response: { code?: string; data?: unknown }): RoleRedirect | undefined => {
  if (response.code !== 'ROLE_MISMATCH') return undefined;
  const data = (response.data || {}) as RoleRedirect;
  return {
    actualRole: data.actualRole,
    expectedRole: data.expectedRole,
    redirectUrl: data.redirectUrl || USER_APP_LOGIN_URL,
    redirectLabel: data.redirectLabel || 'Open user app',
  };
};

export const authStore = {
  getState: () => authState,
  
  setState: (newState: Partial<typeof authState>) => {
    authState = { ...authState, ...newState };
    listeners.forEach((listener) => listener());
  },
  
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const auth = {
  async login(email: string, password: string): Promise<AuthLoginResult> {
    try {
      const response = await api.login(email, password);
      if (response.success && response.data) {
        if (normalizeRole(response.data.user?.role) !== 'counsellor') {
          api.clearToken();
          authStore.setState({ user: null, isLoading: false });
          return {
            success: false,
            message: 'This looks like a regular user account. Please sign in through the user app.',
            roleRedirect: {
              actualRole: response.data.user?.role,
              expectedRole: 'counsellor',
              redirectUrl: USER_APP_LOGIN_URL,
              redirectLabel: 'Open user app',
            },
          };
        }
        authStore.setState({
          user: response.data.user,
          isLoading: false,
        });
        return { success: true };
      }
      authStore.setState({ isLoading: false });
      return {
        success: false,
        message: response.message || 'Invalid email or password',
        roleRedirect: getRoleRedirect(response),
      };
    } catch (error) {
      authStore.setState({ isLoading: false });
      return { success: false, message: error instanceof Error ? error.message : 'Login failed' };
    }
  },

  async checkAuth(): Promise<void> {
    try {
      let token: string | null = null;
      if (typeof window !== 'undefined') {
        token = sessionStorage.getItem('auth_token');
        if (!token) {
          // Fall back to cookie (survives new tabs / browser restarts)
          const match = document.cookie.match(/(?:^|;\s*)mn_counsellor_auth=([^;]+)/);
          if (match) {
            token = decodeURIComponent(match[1]);
            sessionStorage.setItem('auth_token', token);
          }
        }
      }
      if (!token) {
        authStore.setState({ user: null, isLoading: false });
        return;
      }

      const response = await api.getCurrentUser();
      if (response.success && response.data?.user) {
        if (normalizeRole(response.data.user.role) !== 'counsellor') {
          api.clearToken();
          authStore.setState({ user: null, isLoading: false });
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.replace(`/login?account=${encodeURIComponent(response.data.user.role || 'user')}`);
          }
          return;
        }
        authStore.setState({
          user: response.data.user,
          isLoading: false,
        });
      } else {
        authStore.setState({ user: null, isLoading: false });
        api.clearToken();
      }
    } catch (error) {
      authStore.setState({ user: null, isLoading: false });
      api.clearToken();
    }
  },

  logout(): void {
    api.clearToken();
    authStore.setState({ user: null, isLoading: false });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
};
