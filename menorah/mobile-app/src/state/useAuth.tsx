import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiResponse,
  ApiValidationError,
  SocialAuthIntent,
  User,
  api,
} from '@/lib/api';
import {
  isPatientRole,
  needsSocialProfileCompletion,
} from '@/lib/authPolicy';
import { secureStorage } from '@/lib/secureStorage';
import { socketService } from '@/lib/socket';
import { ENV } from '@/lib/env';

export interface AuthResult {
  success: boolean;
  message?: string;
  errors?: ApiValidationError[];
  needsVerification?: boolean;
  verificationFlow?: 'account' | 'signup';
  email?: string;
  needsProfileCompletion?: boolean;
  requiresSignIn?: boolean;
  requiresSignUp?: boolean;
}

interface SocialLoginData {
  user?: User;
  token?: string;
  email?: string;
  isNewUser?: boolean;
  needsProfileCompletion?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthed: boolean;
  isLoading: boolean;
  authenticatedEntryRoute: 'Tabs' | 'EditProfile';
  requiresProfileCompletion: boolean;
  sessionRecoveryPending: boolean;
  retrySession: () => Promise<void>;
  refreshUser: () => Promise<AuthResult>;
  login: (email: string, password: string) => Promise<AuthResult>;
  loginWithGoogle: (credential: string, intent: SocialAuthIntent) => Promise<AuthResult>;
  loginWithApple: (data: {
    identityToken: string;
    authorizationCode?: string | null;
    email?: string | null;
    fullName?: string | null;
  }, intent: SocialAuthIntent) => Promise<AuthResult>;
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
  verifyEmail: (email: string, code: string) => Promise<AuthResult>;
  verifyEmailOtp: (email: string, otp: string) => Promise<AuthResult>;
  resendEmailVerification: (email: string) => Promise<AuthResult>;
  resendEmailOtp: (email: string) => Promise<AuthResult>;
  verifyPhone: (phone: string, otp: string) => Promise<AuthResult>;
  forgotPassword: (email: string) => Promise<AuthResult>;
  resetPassword: (token: string, password: string) => Promise<AuthResult>;
  updateUser: (userData: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const validationErrorsToMessage = (errors?: ApiValidationError[]) => {
  if (!errors?.length) return undefined;

  // Server validation is authoritative. Surface the first actionable error so
  // callers have one clear correction to make instead of an opaque generic
  // failure (or a long, competing list of rules).
  return errors
    .map(error => error.msg || error.message)
    .find((message): message is string => Boolean(message));
};

const responseMessage = (response: ApiResponse<unknown>, fallback: string) =>
  validationErrorsToMessage(response.errors) || response.message || fallback;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionRecoveryPending, setSessionRecoveryPending] = useState(false);
  const [authenticatedEntryRoute, setAuthenticatedEntryRoute] =
    useState<'Tabs' | 'EditProfile'>('Tabs');
  const sessionRecoveryPendingRef = useRef(false);
  const sessionRetryInFlightRef = useRef(false);

  const setRecoveryPending = useCallback((pending: boolean) => {
    sessionRecoveryPendingRef.current = pending;
    setSessionRecoveryPending(pending);
  }, []);

  const isAuthed = Boolean(user && isPatientRole(user.role) && user.isEmailVerified);
  const requiresProfileCompletion = Boolean(
    isAuthed && user?.profileCompleted === false,
  );

  const clearPrivateState = useCallback(async () => {
    socketService.disconnect();
    await queryClient.cancelQueries();
    queryClient.clear();
    setUser(null);
    setAuthenticatedEntryRoute('Tabs');
  }, [queryClient]);

  const terminateLocalSession = useCallback(async () => {
    await api.clearToken();
    await clearPrivateState();
    setRecoveryPending(false);
  }, [clearPrivateState, setRecoveryPending]);

  const rejectCandidateToken = useCallback(async (token?: string) => {
    if (!token) return;
    const response = await api.logoutToken(token);
    if (!response.success && response.httpStatus !== 401) {
      await secureStorage.queuePendingLogoutToken(token);
    }
  }, []);

  const acceptSession = useCallback(async (
    candidateUser: User,
    token: string,
    options?: { socialProfileRequirement?: boolean },
  ): Promise<AuthResult> => {
    if (!isPatientRole(candidateUser.role)) {
      await rejectCandidateToken(token);
      return {
        success: false,
        message: 'This app is only available for patient accounts.',
      };
    }

    if (!candidateUser.isEmailVerified) {
      await rejectCandidateToken(token);
      return {
        success: true,
        needsVerification: true,
        verificationFlow: 'account',
        email: candidateUser.email,
        message: 'Please verify your email address before signing in.',
      };
    }

    const profileCompletionRequired = needsSocialProfileCompletion(
      candidateUser,
      options?.socialProfileRequirement,
    );
    await clearPrivateState();
    await api.setToken(token);
    setAuthenticatedEntryRoute(profileCompletionRequired ? 'EditProfile' : 'Tabs');
    setUser(candidateUser);
    setRecoveryPending(false);

    return {
      success: true,
      needsProfileCompletion: profileCompletionRequired,
    };
  }, [clearPrivateState, rejectCandidateToken, setRecoveryPending]);

  const loadStoredSession = useCallback(async () => {
    const token = await secureStorage.getToken();
    if (!token) {
      await clearPrivateState();
      setRecoveryPending(false);
      return;
    }

    const response = await api.getCurrentUser();
    if (response.success && response.data?.user) {
      const storedUser = response.data.user;
      if (isPatientRole(storedUser.role) && storedUser.isEmailVerified) {
        setUser(storedUser);
        setRecoveryPending(false);
        return;
      }

      await terminateLocalSession();
      return;
    }

    if (
      response.httpStatus === 401
      || response.code === 'EMAIL_VERIFICATION_REQUIRED'
    ) {
      await terminateLocalSession();
      return;
    }

    // Preserve a potentially valid token during temporary network/server outages.
    setUser(null);
    setRecoveryPending(true);
  }, [clearPrivateState, setRecoveryPending, terminateLocalSession]);

  const retrySession = useCallback(async () => {
    if (sessionRetryInFlightRef.current) return;

    sessionRetryInFlightRef.current = true;
    setIsLoading(true);
    try {
      await loadStoredSession();
    } finally {
      sessionRetryInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [loadStoredSession]);

  useEffect(() => api.onUnauthorized(terminateLocalSession), [terminateLocalSession]);

  useEffect(() => {
    retrySession().catch(error => {
      if (__DEV__) console.error('[Auth] Failed to restore session:', error);
      setRecoveryPending(true);
      setIsLoading(false);
    });
  }, [retrySession, setRecoveryPending]);

  useEffect(() => {
    const retryRecoveredSession = () => {
      if (!sessionRecoveryPendingRef.current || sessionRetryInFlightRef.current) return;

      retrySession().catch(error => {
        if (__DEV__) console.warn('[Auth] Deferred session recovery failed:', error);
      });
    };

    const unsubscribeNetwork = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) {
        retryRecoveredSession();
      }
    });
    const appStateSubscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') retryRecoveredSession();
    });

    return () => {
      unsubscribeNetwork();
      appStateSubscription.remove();
    };
  }, [retrySession]);

  useEffect(() => {
    const retryPendingLogouts = () => {
      api.retryPendingLogouts().catch(error => {
        if (__DEV__) console.warn('[Auth] Pending logout retry failed:', error);
      });
    };

    retryPendingLogouts();
    return NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) {
        retryPendingLogouts();
      }
    });
  }, []);

  const login = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await api.login({ email: normalizedEmail, password });

      if (
        response.code === 'EMAIL_VERIFICATION_REQUIRED'
        || (response.success && response.data?.user && !response.data.user.isEmailVerified)
      ) {
        await rejectCandidateToken(response.data?.token);
        return {
          success: true,
          needsVerification: true,
          verificationFlow: 'account',
          email: response.data?.email || response.data?.user?.email || normalizedEmail,
          message: response.message || 'Please verify your email address.',
        };
      }

      if (response.success && response.data?.user && response.data?.token) {
        return acceptSession(response.data.user, response.data.token);
      }

      return {
        success: false,
        message: response.isNetworkError
          ? `Unable to connect to ${ENV.API_BASE_URL}. Check your connection and try again.`
          : responseMessage(response, 'Login failed'),
        errors: response.errors,
      };
    } catch (error: any) {
      if (__DEV__) console.error('[Auth] Login error:', error);
      return {
        success: false,
        message: error.message?.includes('Network Error')
          ? `Unable to connect to ${ENV.API_BASE_URL}. Check your connection and try again.`
          : error.response?.data?.message || error.message || 'Login failed',
        errors: error.response?.data?.errors,
      };
    }
  };

  const completeSocialLogin = async (
    request: Promise<ApiResponse<SocialLoginData>>,
  ): Promise<AuthResult> => {
    try {
      const response = await request;
      if (response.code === 'ACCOUNT_NOT_FOUND') {
        return {
          success: false,
          requiresSignUp: true,
          message: response.message || 'Create a Menorah account to continue with this sign-in method.',
        };
      }
      if (response.code === 'EMAIL_VERIFICATION_REQUIRED') {
        return {
          success: true,
          needsVerification: true,
          verificationFlow: 'account',
          email: response.data?.email || response.data?.user?.email,
          message: response.message || 'Please verify your email address before signing in.',
        };
      }
      if (response.success && response.data?.user && response.data?.token) {
        return acceptSession(response.data.user, response.data.token, {
          socialProfileRequirement: Boolean(
            response.data.isNewUser || response.data.needsProfileCompletion,
          ),
        });
      }

      return {
        success: false,
        message: responseMessage(response, 'Social sign-in failed'),
        errors: response.errors,
      };
    } catch (error: any) {
      if (__DEV__) console.error('[Auth] Social login error:', error);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Social sign-in failed',
        errors: error.response?.data?.errors,
      };
    }
  };

  const loginWithGoogle = (credential: string, intent: SocialAuthIntent) =>
    completeSocialLogin(api.loginWithGoogle(credential, intent));

  const loginWithApple = (data: {
    identityToken: string;
    authorizationCode?: string | null;
    email?: string | null;
    fullName?: string | null;
  }, intent: SocialAuthIntent) => completeSocialLogin(api.loginWithApple(data, intent));

  const register = async (userData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
    dateOfBirth: string;
    gender: string;
  }): Promise<AuthResult> => {
    const response = await api.register(userData);
    return response.success
      ? {
        success: true,
        message: response.message,
        needsVerification: true,
        verificationFlow: 'signup',
        email: response.data?.email || userData.email.trim().toLowerCase(),
      }
      : {
        success: false,
        message: responseMessage(response, 'Registration failed'),
        errors: response.errors,
      };
  };

  const logout = async () => {
    const token = await secureStorage.getToken();
    try {
      if (token) {
        const response = await api.logoutToken(token);
        if (!response.success && response.httpStatus !== 401) {
          await secureStorage.queuePendingLogoutToken(token);
        }
      }
    } catch (error) {
      if (token) await secureStorage.queuePendingLogoutToken(token);
      if (__DEV__) console.warn('[Auth] Server logout deferred:', error);
    } finally {
      await terminateLocalSession();
    }
  };

  const verifyEmail = async (email: string, code: string): Promise<AuthResult> => {
    const response = await api.verifyEmail(email, code);
    if (!response.success) {
      return {
        success: false,
        message: responseMessage(response, 'Email verification failed'),
      };
    }

    const token = response.data?.token;
    let verifiedUser = response.data?.user;
    if (token && !verifiedUser) {
      const profileResponse = await api.getCurrentUserWithToken(token);
      verifiedUser = profileResponse.data?.user;
    }

    if (token && verifiedUser) {
      return acceptSession(verifiedUser, token);
    }

    return {
      success: true,
      requiresSignIn: true,
      message: response.message || 'Email verified. Please sign in.',
    };
  };

  const verifyEmailOtp = async (email: string, otp: string): Promise<AuthResult> => {
    const response = await api.verifyEmailOtp(email, otp);
    if (response.success && response.data?.user && response.data?.token) {
      return acceptSession(response.data.user, response.data.token);
    }
    return {
      success: false,
      message: responseMessage(response, 'Email verification failed'),
    };
  };

  const resendEmailOtp = async (email: string): Promise<AuthResult> => {
    const response = await api.resendEmailOtp(email);
    return response.success
      ? { success: true }
      : { success: false, message: responseMessage(response, 'Failed to resend code') };
  };

  const resendEmailVerification = async (email: string): Promise<AuthResult> => {
    const response = await api.resendEmailVerification(email);
    return response.success
      ? { success: true }
      : { success: false, message: responseMessage(response, 'Failed to resend verification code') };
  };

  const verifyPhone = async (phone: string, otp: string): Promise<AuthResult> => {
    const response = await api.verifyPhone(phone, otp);
    if (response.success) {
      setUser(current => current ? { ...current, isPhoneVerified: true } : current);
      return { success: true };
    }
    return { success: false, message: responseMessage(response, 'Phone verification failed') };
  };

  const forgotPassword = async (email: string): Promise<AuthResult> => {
    const response = await api.forgotPassword(email);
    return response.success
      ? { success: true }
      : { success: false, message: responseMessage(response, 'Failed to send reset email') };
  };

  const resetPassword = async (token: string, password: string): Promise<AuthResult> => {
    const response = await api.resetPassword(token, password);
    if (response.success) {
      // Password reset revokes all sessions on the server.
      if (await secureStorage.getToken()) {
        await terminateLocalSession();
      }
      return { success: true };
    }
    return { success: false, message: responseMessage(response, 'Password reset failed') };
  };

  const refreshUser = async (): Promise<AuthResult> => {
    const response = await api.getCurrentUser();
    if (
      response.success
      && response.data?.user
      && isPatientRole(response.data.user.role)
      && response.data.user.isEmailVerified
    ) {
      setUser(response.data.user);
      return { success: true };
    }
    return { success: false, message: responseMessage(response, 'Failed to refresh profile') };
  };

  const updateUser = (userData: User) => {
    setUser(current => current ? { ...current, ...userData } : userData);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthed,
      isLoading,
      authenticatedEntryRoute,
      requiresProfileCompletion,
      sessionRecoveryPending,
      retrySession,
      refreshUser,
      login,
      loginWithGoogle,
      loginWithApple,
      register,
      logout,
      verifyEmail,
      verifyEmailOtp,
      resendEmailVerification,
      resendEmailOtp,
      verifyPhone,
      forgotPassword,
      resetPassword,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
