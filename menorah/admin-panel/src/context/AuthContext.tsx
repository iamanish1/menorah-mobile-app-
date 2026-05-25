'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { getToken, setToken, clearToken, getStoredUser, setStoredUser } from '@/lib/auth';
import type { AdminUser } from '@/types';

interface AuthContextValue {
  user: AdminUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (token && stored?.role === 'admin') {
      setUser(stored);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    if (!res.success || !res.data) return { success: false, message: res.message || 'Login failed' };

    const { user: u, token } = res.data;
    if (u.role !== 'admin') return { success: false, message: 'Access denied. Admin accounts only.' };

    setToken(token);
    const adminUser = { id: u._id, firstName: u.firstName, lastName: u.lastName, email: u.email, role: 'admin' as const };
    setStoredUser(adminUser);
    setUser(adminUser);
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    window.location.href = '/login';
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
