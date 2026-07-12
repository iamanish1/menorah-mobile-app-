'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { authStorage } from '@/lib/auth';
import type { User } from '@/types';

type RoleRedirect = {
  actualRole?: string;
  expectedRole?: string;
  redirectUrl?: string;
  redirectLabel?: string;
};

type AuthResult = {
  success: boolean;
  message?: string;
  needsVerification?: boolean;
  isNewUser?: boolean;
  roleRedirect?: RoleRedirect;
};

interface AuthContextValue {
  user: User | null;
  isAuthed: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  loginWithGoogle: (credential: string) => Promise<AuthResult>;
  register: (data: RegisterData) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  verifyEmail: (code: string) => Promise<{ success: boolean; message?: string }>;
  verifyPhone: (phone: string, otp: string) => Promise<{ success: boolean; message?: string }>;
  verifyEmailOTP: (email: string, otp: string) => Promise<{ success: boolean; message?: string }>;
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
const COUNSELLOR_LOGIN_URL = process.env.NEXT_PUBLIC_COUNSELLOR_APP_URL || 'https://counsellor.menorah.me/login';

const isUserRole = (role?: string) => String(role || 'user').toLowerCase() === 'user';

const getRoleRedirect = (res: { code?: string; data?: unknown }): RoleRedirect | undefined => {
  if (res.code !== 'ROLE_MISMATCH') return undefined;
  const data = (res.data || {}) as RoleRedirect;
  return {
    actualRole: data.actualRole,
    expectedRole: data.expectedRole,
    redirectUrl: data.redirectUrl || COUNSELLOR_LOGIN_URL,
    redirectLabel: data.redirectLabel || 'Open counsellor portal',
  };
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!authStorage.getToken()) {
      setIsLoading(false);
      return;
    }
    const res = await api.getCurrentUser();
    if (res.success && res.data?.user) {
      if (!isUserRole(res.data.user.role)) {
        const actualRole = res.data.user.role || 'counsellor';
        authStorage.clearToken();
        setUser(null);
        setIsLoading(false);
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.replace(`/login?account=${encodeURIComponent(actualRole)}`);
        }
        return;
      }
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
      if (!isUserRole(res.data.user.role)) {
        authStorage.clearToken();
        return {
          success: false,
          message: 'This looks like a counsellor account. Please sign in through the counsellor portal.',
          roleRedirect: {
            actualRole: res.data.user.role,
            expectedRole: 'user',
            redirectUrl: COUNSELLOR_LOGIN_URL,
            redirectLabel: 'Open counsellor portal',
          },
        };
      }
      setUser(res.data.user);
      const u = res.data.user;
      if (!u.isEmailVerified) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('pending_verify_email', email);
          sessionStorage.setItem('pending_verification_mode', 'account');
        }
        return { success: true, needsVerification: true, message: 'Please verify your email address.' };
      }
      return { success: true };
    }
    return { success: false, message: res.message, roleRedirect: getRoleRedirect(res) };
  };

  const loginWithGoogle = async (credential: string) => {
    const res = await api.loginWithGoogle(credential);
    if (res.success && res.data?.user) {
      if (!isUserRole(res.data.user.role)) {
        authStorage.clearToken();
        return {
          success: false,
          message: 'This looks like a counsellor account. Please sign in through the counsellor portal.',
          roleRedirect: {
            actualRole: res.data.user.role,
            expectedRole: 'user',
            redirectUrl: COUNSELLOR_LOGIN_URL,
            redirectLabel: 'Open counsellor portal',
          },
        };
      }
      setUser(res.data.user);
      return { success: true, isNewUser: res.data.isNewUser };
    }
    return { success: false, message: res.message, roleRedirect: getRoleRedirect(res) };
  };

  const register = async (data: RegisterData) => {
    const res = await api.register(data);
    if (res.success) {
      // User not created yet — store email so verify-otp page can use it
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('pendingEmail', data.email);
      }
      return { success: true };
    }
    const firstValidationMessage = res.errors?.map((error) => error.message || error.msg).find(Boolean);
    return { success: false, message: firstValidationMessage || res.message };
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    window.location.replace('/');
  };

  const verifyEmail = async (code: string) => {
    const res = await api.verifyEmail(code);
    if (res.success) {
      await refreshUser();
      return { success: true };
    }
    return { success: false, message: res.message };
  };

  const verifyPhone = async (phone: string, otp: string) => {
    const res = await api.verifyPhone(phone, otp);
    if (res.success) {
      await refreshUser();
      return { success: true };
    }
    return { success: false, message: res.message };
  };

  const verifyEmailOTP = async (email: string, otp: string) => {
    const res = await api.verifyEmailOTP(email, otp);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pendingEmail');
        sessionStorage.removeItem('pending_verify_email');
        sessionStorage.removeItem('pending_verification_mode');
      }
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
      login, loginWithGoogle, register, logout,
      verifyEmail, verifyPhone, verifyEmailOTP,
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
