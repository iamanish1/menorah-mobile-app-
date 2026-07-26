import React, { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiValidationError, api, User } from '@/lib/api';
import { secureStorage } from '@/lib/secureStorage';
import { socketService } from '@/lib/socket';
import { ENV } from '@/lib/env';
import { reportError } from '@/lib/safeDiagnostics';
import { onSessionInvalidated } from '@/lib/authSession';

interface AuthResult {
  success: boolean;
  message?: string;
  errors?: ApiValidationError[];
  needsVerification?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthed: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  loginWithGoogle: (credential: string) => Promise<AuthResult>;
  loginWithApple: (data: {
    identityToken: string;
    authorizationCode: string;
    email?: string | null;
    fullName?: string | null;
  }) => Promise<AuthResult>;
  register: (userData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
    dateOfBirth: string;
    gender: string;
  }) => Promise<AuthResult>;
  logout: () => Promise<void>;
  invalidateSession: () => Promise<void>;
  verifyEmail: (code: string) => Promise<{ success: boolean; message?: string }>;
  verifyEmailOtp: (email: string, otp: string) => Promise<{ success: boolean; message?: string }>;
  resendEmailVerification: (email: string) => Promise<{ success: boolean; message?: string }>;
  resendEmailOtp: (email: string) => Promise<{ success: boolean; message?: string }>;
  verifyPhone: (phone: string, otp: string) => Promise<{ success: boolean; message?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; message?: string }>;
  updateUser: (userData: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const validationErrorsToMessage = (errors?: ApiValidationError[]) => {
  if (!errors?.length) return undefined;

  return errors
    .map(error => error.msg || error.message)
    .filter((message): message is string => Boolean(message))
    .join('\n');
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const activeUserId = useRef<string | null>(null);

  const setSessionUser = useCallback((nextUser: User | null) => {
    const nextUserId = nextUser?.id ?? null;
    if (activeUserId.current !== nextUserId) {
      // Protected React Query data must disappear before another identity is
      // exposed to the component tree.
      queryClient.clear();
      activeUserId.current = nextUserId;
    }
    setUser(nextUser);
  }, [queryClient]);

  const isAuthed = !!user;

  const clearInvalidCredential = useCallback(async () => {
    try {
      await api.clearToken();
    } catch (error) {
      // api.clearToken clears the in-memory bearer first; secureStorage leaves a
      // durable tombstone when physical Keychain/Keystore cleanup must retry.
      reportError('auth.invalid_credential_cleanup_pending', error);
    }
  }, []);

  useEffect(() => onSessionInvalidated(() => {
    socketService.disconnect();
    setSessionUser(null);
  }), [setSessionUser]);

  const checkAuthStatus = useCallback(async () => {
    try {
      const token = await secureStorage.getToken();

      if (token) {
        const response = await api.getCurrentUser();
        if (response.success && response.data?.user) {
          setSessionUser(response.data.user);
        } else {
          const isNetworkError = response.message?.includes('Network error') ||
                                 response.message?.includes('Unable to connect to server');
          if (!isNetworkError) {
            await clearInvalidCredential();
          }
          setSessionUser(null);
        }
      } else {
        setSessionUser(null);
      }
    } catch (error: any) {
      const isNetworkError = error.code === 'ERR_NETWORK' || error.code === 'NETWORK_ERROR' ||
                             error.message?.includes('Network Error');
      if (!isNetworkError) {
        await clearInvalidCredential();
      }
      setSessionUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [clearInvalidCredential, setSessionUser]);

  // Check for an existing credential exactly once for this provider instance.
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.login({ email: email.trim().toLowerCase(), password });

      if (response.success && response.data?.user && response.data?.token) {
        await api.setToken(response.data.token);
        setSessionUser(response.data.user);

        if (!response.data.user.isEmailVerified) {
          return {
            success: true,
            needsVerification: true,
            message: 'Please verify your email address.',
          };
        }

        return { success: true };
      } else {
        // Check if it's a network error
        const isNetworkError = response.message?.includes('Network error') || 
                               response.message?.includes('Unable to connect to server');
        
        if (isNetworkError) {
          return { 
            success: false, 
            message: 'Network error: Unable to connect to server. Please ensure the backend server is running and accessible.' 
          };
        }
        
        return { 
          success: false, 
          message: validationErrorsToMessage(response.errors) || response.message || 'Login failed',
          errors: response.errors,
        };
      }
    } catch (error: any) {
      reportError('auth.login_failed', error);
      
      // Handle network errors specifically
      // Axios uses 'ERR_NETWORK' for network errors
      if (error.code === 'ERR_NETWORK' || error.code === 'NETWORK_ERROR' || error.message?.includes('Network Error')) {
        return { 
          success: false, 
          message: `Network error: Unable to connect to server. Please ensure the backend server is running and reachable at ${ENV.API_BASE_URL}` 
        };
      }
      
      return {
        success: false,
        message: validationErrorsToMessage(error.response?.data?.errors) || error.response?.data?.message || error.message || 'Login failed',
        errors: error.response?.data?.errors,
      };
    }
  };

  const completeSocialLogin = async (
    request: Promise<{ success: boolean; message?: string; data?: { user: User; token: string }; errors?: ApiValidationError[] }>
  ): Promise<AuthResult> => {
    try {
      const response = await request;

      if (response.success && response.data?.user && response.data?.token) {
        await api.setToken(response.data.token);
        setSessionUser(response.data.user);
        return { success: true };
      }

      return {
        success: false,
        message: validationErrorsToMessage(response.errors) || response.message || 'Social sign-in failed',
        errors: response.errors,
      };
    } catch (error: any) {
      reportError('auth.social_login_failed', error);
      return {
        success: false,
        message: validationErrorsToMessage(error.response?.data?.errors) || error.response?.data?.message || error.message || 'Social sign-in failed',
        errors: error.response?.data?.errors,
      };
    }
  };

  const loginWithGoogle = async (credential: string) =>
    completeSocialLogin(api.loginWithGoogle(credential));

  const loginWithApple = async (data: {
    identityToken: string;
    authorizationCode: string;
    email?: string | null;
    fullName?: string | null;
  }) => completeSocialLogin(api.loginWithApple(data));

  const register = async (userData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
    dateOfBirth: string;
    gender: string;
  }) => {
    try {
      const response = await api.register(userData);

      if (response.success) {
        // Registration sends an OTP email — user is not created yet.
        // Token and user will be set after OTP verification via verifyEmailOtp().
        return { success: true, message: response.message };
      } else {
        return {
          success: false,
          message: validationErrorsToMessage(response.errors) || response.message || 'Registration failed',
          errors: response.errors,
        };
      }
    } catch (error: any) {
      reportError('auth.registration_failed', error);
      return {
        success: false,
        message: validationErrorsToMessage(error.response?.data?.errors) || error.response?.data?.message || 'Registration failed',
        errors: error.response?.data?.errors,
      };
    }
  };

  const invalidateSession = useCallback(async () => {
    let credentialCleanupError: unknown;
    socketService.disconnect();

    try {
      await api.clearToken();
    } catch (error) {
      credentialCleanupError = error;
      reportError('auth.credential_cleanup_pending', error);
    }

    // Clearing the identity synchronously purges protected query data and the
    // layout effects in account-scoped providers clear clinical UI state.
    setSessionUser(null);

    if (credentialCleanupError) {
      throw new Error('Secure credential cleanup is pending.');
    }
  }, [setSessionUser]);

  const logout = async () => {
    try {
      // Disconnect socket first
      socketService.disconnect();
      // Call API logout
      await api.logout();
    } catch (error) {
      reportError('auth.logout_failed', error);
    }
    // Local sign-out remains authoritative when the network logout fails.
    await invalidateSession();
  };

  const verifyEmail = async (code: string) => {
    try {
      const response = await api.verifyEmail(code);
      
      if (response.success) {
        // Update user state if logged in
        if (user) {
          setUser({ ...user, isEmailVerified: true });
        }
        return { success: true };
      } else {
        return { 
          success: false, 
          message: response.message || 'Email verification failed' 
        };
      }
    } catch (error: any) {
      reportError('auth.email_verification_failed', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Email verification failed' 
      };
    }
  };

  const verifyEmailOtp = async (email: string, otp: string) => {
    try {
      const response = await api.verifyEmailOtp(email, otp);

      if (response.success && response.data) {
        await api.setToken(response.data.token);
        setSessionUser(response.data.user);
        return { success: true };
      } else {
        return {
          success: false,
          message: response.message || 'Email verification failed'
        };
      }
    } catch (error: any) {
      reportError('auth.email_otp_verification_failed', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Email verification failed'
      };
    }
  };

  const resendEmailOtp = async (email: string) => {
    try {
      const response = await api.resendEmailOtp(email);

      if (response.success) {
        return { success: true };
      } else {
        return {
          success: false,
          message: response.message || 'Failed to resend code'
        };
      }
    } catch (error: any) {
      reportError('auth.email_otp_resend_failed', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to resend code'
      };
    }
  };

  const resendEmailVerification = async (email: string) => {
    try {
      const response = await api.resendEmailVerification(email);
      
      if (response.success) {
        return { success: true };
      } else {
        return { 
          success: false, 
          message: response.message || 'Failed to resend verification code' 
        };
      }
    } catch (error: any) {
      reportError('auth.email_verification_resend_failed', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to resend verification code' 
      };
    }
  };

  const verifyPhone = async (phone: string, otp: string) => {
    try {
      const response = await api.verifyPhone(phone, otp);
      
      if (response.success) {
        // Update user state if logged in
        if (user) {
          setUser({ ...user, isPhoneVerified: true });
        }
        return { success: true };
      } else {
        return { 
          success: false, 
          message: response.message || 'Phone verification failed' 
        };
      }
    } catch (error: any) {
      reportError('auth.phone_verification_failed', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Phone verification failed' 
      };
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      const response = await api.forgotPassword(email);
      
      if (response.success) {
        return { success: true };
      } else {
        return { 
          success: false, 
          message: response.message || 'Failed to send reset email' 
        };
      }
    } catch (error: any) {
      reportError('auth.password_reset_request_failed', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to send reset email' 
      };
    }
  };

  const resetPassword = async (token: string, password: string) => {
    try {
      const response = await api.resetPassword(token, password);
      
      if (response.success) {
        try {
          await invalidateSession();
          return { success: true };
        } catch (error) {
          // The server already reset the password and revoked every session.
          // Local state is cleared and a tombstone blocks any residual bearer.
          reportError('auth.password_reset_cleanup_pending', error);
          return {
            success: true,
            message: 'Password updated. Local credential cleanup will finish before sign-in.',
          };
        }
      } else {
        return { 
          success: false, 
          message: response.message || 'Password reset failed' 
        };
      }
    } catch (error: any) {
      reportError('auth.password_reset_failed', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Password reset failed' 
      };
    }
  };

  const updateUser = (userData: User) => {
    setUser(userData);
  };

  const value: AuthContextType = {
    user,
    isAuthed,
    isLoading,
    login,
    loginWithGoogle,
    loginWithApple,
    register,
    logout,
    invalidateSession,
    verifyEmail,
    verifyEmailOtp,
    verifyPhone,
    forgotPassword,
    resetPassword,
    resendEmailVerification,
    resendEmailOtp,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
