'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, UNAUTHORIZED_EVENT } from '@/lib/api';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  isAuthed: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string; needsVerification?: boolean }>;
  loginWithGoogle: (credential: string, intent: 'signin' | 'signup') => Promise<{ success: boolean; message?: string; isNewUser?: boolean; needsVerification?: boolean; requiresSignUp?: boolean }>;
  linkSocialProvider: (provider: 'google' | 'apple', providerToken: string, currentPassword: string) => Promise<{ success: boolean; message?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<{ success: boolean; message?: string }>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const res = await api.getCurrentUser();
    if (res.success && res.data?.user) {
      setUser(res.data.user);
    } else {
      setUser(null);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setIsLoading(false);
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    refreshUser();

    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    if (res.code === 'EMAIL_VERIFICATION_REQUIRED') {
      const pendingEmail = res.data?.email || email;
      setUser(null);
      sessionStorage.setItem('pending_verify_email', pendingEmail);
      sessionStorage.setItem('pending_verification_mode', 'account');
      // Login deliberately does not create a session for an unverified
      // account. Start (or safely coalesce with) the verification-code
      // delivery before taking the user to the OTP page; otherwise a legacy
      // account with no outstanding code would be shown a 60-second resend
      // countdown without having received anything.
      void api.resendEmailVerification(pendingEmail);
      return {
        success: false,
        needsVerification: true,
        message: res.message || 'Please verify your email address.',
      };
    }
    if (res.success && res.data?.user) {
      const u = res.data.user;
      if (u.role !== 'user') {
        setUser(null);
        return {
          success: false,
          message: u.role === 'admin'
            ? 'Use the dedicated admin portal for this account.'
            : 'Use the dedicated counsellor portal for this account.',
        };
      }
      setUser(u);
      if (!u.isEmailVerified) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('pending_verify_email', email);
          sessionStorage.setItem('pending_verification_mode', 'account');
        }
        return { success: true, needsVerification: true, message: 'Please verify your email address.' };
      }
      return { success: true };
    }
    return { success: false, message: res.message };
  };

  const loginWithGoogle = async (credential: string, intent: 'signin' | 'signup') => {
    const res = await api.loginWithGoogle(credential, intent);
    // Signing in must never silently create an account. When the backend
    // confirms that this Google identity is new, let the login view take the
    // person to the explicit sign-up flow instead of leaving them at an error.
    if (res.code === 'ACCOUNT_NOT_FOUND' && intent === 'signin') {
      setUser(null);
      return {
        success: false,
        requiresSignUp: true,
        message: res.message || 'Create a Menorah account to continue with Google.',
      };
    }
    if (res.code === 'EMAIL_VERIFICATION_REQUIRED') {
      const pendingEmail = res.data?.email;
      setUser(null);
      if (pendingEmail) {
        sessionStorage.setItem('pending_verify_email', pendingEmail);
        sessionStorage.setItem('pending_verification_mode', 'account');
        void api.resendEmailVerification(pendingEmail);
      }
      return {
        success: false,
        needsVerification: true,
        message: res.message || 'Please verify your email address before signing in.',
      };
    }
    if (res.success && res.data?.user) {
      if (res.data.user.role !== 'user') {
        setUser(null);
        return {
          success: false,
          message: res.data.user.role === 'admin'
            ? 'Use the dedicated admin portal for this account.'
            : 'Use the dedicated counsellor portal for this account.',
        };
      }
      setUser(res.data.user);
      return { success: true, isNewUser: res.data.isNewUser };
    }
    return { success: false, message: res.message };
  };

  const linkSocialProvider = async (
    provider: 'google' | 'apple',
    providerToken: string,
    currentPassword: string
  ) => {
    const res = await api.linkSocialProvider(provider, providerToken, currentPassword);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      return { success: true, message: res.message };
    }
    const firstValidationMessage = res.errors?.map((error) => error.message || error.msg).find(Boolean);
    return { success: false, message: firstValidationMessage || res.message };
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

  const logoutAll = async () => {
    await api.logoutAll();
    setUser(null);
    window.location.replace('/login');
  };

  const verifyEmail = async (email: string, code: string) => {
    const res = await api.verifyEmail(email, code);
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
    const firstValidationMessage = res.errors?.map((error) => error.message || error.msg).find(Boolean);
    return { success: res.success, message: firstValidationMessage || res.message };
  };

  const updateUser = (updated: User) => setUser(updated);

  return (
    <AuthContext.Provider value={{
      user, isAuthed: user?.role === 'user', isLoading,
      login, loginWithGoogle, linkSocialProvider, register, logout, logoutAll,
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
