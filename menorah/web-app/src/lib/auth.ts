import { api } from './api';
import { User } from '@/types';

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
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
  async login(email: string, password: string): Promise<boolean> {
    try {
      const response = await api.login(email, password);
      if (response.success && response.data) {
        authStore.setState({
          user: response.data.user,
          isLoading: false,
        });
        return true;
      }
      authStore.setState({ isLoading: false });
      return false;
    } catch (error) {
      authStore.setState({ isLoading: false });
      return false;
    }
  },

  async checkAuth(): Promise<void> {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (!token) {
        authStore.setState({ user: null, isLoading: false });
        return;
      }

      const response = await api.getCurrentUser();
      if (response.success && response.data?.user) {
        authStore.setState({
          user: response.data.user,
          isLoading: false,
        });
      } else {
        authStore.setState({ user: null, isLoading: false });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
        }
      }
    } catch (error) {
      authStore.setState({ user: null, isLoading: false });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
      }
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

