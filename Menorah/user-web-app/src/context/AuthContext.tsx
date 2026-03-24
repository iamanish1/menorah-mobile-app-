'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { authStorage } from '@/lib/auth';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  isAuthed: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string; needsVerification?: boolean }>;
  register: (data: RegisterData) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  verifyEmail: (code: string) => Promise<{ success: boolean; message?: string }>;
  verifyPhone: (token: string) => Promise<{ success: boolean; message?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; message?: string }>;
  updateUser: (user: User) => void;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  dateOfBirth: string;
  gender: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    if (!authStorage.getToken()) {
      setIsLoading(false);
      return;
    }
    const res = await api.getCurrentUser();
    if (res.success && res.data?.user) {
      setUser(res.data.user);
    } else {
      authStorage.clearToken();
      setUser(null);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      const u = res.data.user;
      if (!u.isPhoneVerified) {
        return { success: true, needsVerification: true, message: 'Please verify your phone number.' };
      }
      return { success: true };
    }
    return { success: false, message: res.message };
  };

  const register = async (data: RegisterData) => {
    const res = await api.register(data);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      return { success: true };
    }
    return { success: false, message: res.message };
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    router.replace('/login');
  };

  const verifyEmail = async (code: string) => {
    const res = await api.verifyEmail(code);
    if (res.success) {
      await refreshUser();
      return { success: true };
    }
    return { success: false, message: res.message };
  };

  const verifyPhone = async (token: string) => {
    const res = await api.verifyPhone(token);
    if (res.success) {
      await refreshUser();
      return { success: true };
    }
    return { success: false, message: res.message };
  };

  const forgotPassword = async (email: string) => {
    const res = await api.forgotPassword(email);
    return { success: res.success, message: res.message };
  };

  const resetPassword = async (token: string, password: string) => {
    const res = await api.resetPassword(token, password);
    return { success: res.success, message: res.message };
  };

  const updateUser = (updated: User) => setUser(updated);

  return (
    <AuthContext.Provider value={{
      user, isAuthed: !!user, isLoading,
      login, register, logout,
      verifyEmail, verifyPhone,
      forgotPassword, resetPassword,
      updateUser, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
