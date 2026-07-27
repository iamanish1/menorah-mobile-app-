import { api } from './api';
import { User } from '@/types';

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{
    success: boolean;
    needsVerification?: boolean;
    email?: string;
    message?: string;
  }>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
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
  async login(email: string, password: string): Promise<{
    success: boolean;
    needsVerification?: boolean;
    email?: string;
    message?: string;
  }> {
    try {
      const response = await api.login(email, password);
      if (response.code === 'EMAIL_VERIFICATION_REQUIRED') {
        authStore.setState({ user: null, isLoading: false });
        return {
          success: false,
          needsVerification: true,
          email: response.data?.email || email,
          message: response.message || 'Please verify your email address before signing in.',
        };
      }
      if (response.success && response.data?.user?.role === 'counsellor') {
        authStore.setState({
          user: response.data.user,
          isLoading: false,
        });
        return { success: true };
      }
      authStore.setState({ user: null, isLoading: false });
      return { success: false, message: response.message };
    } catch {
      authStore.setState({ user: null, isLoading: false });
      return { success: false, message: 'Login failed' };
    }
  },

  async checkAuth(): Promise<void> {
    try {
      const response = await api.getCurrentUser();
      if (response.success && response.data?.user?.role === 'counsellor') {
        authStore.setState({
          user: response.data.user,
          isLoading: false,
        });
      } else {
        authStore.setState({ user: null, isLoading: false });
      }
    } catch {
      authStore.setState({ user: null, isLoading: false });
    }
  },

  async logout(): Promise<void> {
    await api.logout().catch(() => {});
    authStore.setState({ user: null, isLoading: false });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },

  async logoutAll(): Promise<void> {
    await api.logoutAll().catch(() => {});
    authStore.setState({ user: null, isLoading: false });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
};
