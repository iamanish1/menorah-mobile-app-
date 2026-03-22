import React, { useState, useEffect, createContext, useContext } from 'react';
import { api, User } from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { socketService } from '@/lib/socket';
import { ENV } from '@/lib/env';

interface AuthContextType {
  user: User | null;
  isAuthed: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (userData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
    dateOfBirth: string;
    gender: string;
  }) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  verifyEmail: (code: string) => Promise<{ success: boolean; message?: string }>;
  resendEmailVerification: (email: string) => Promise<{ success: boolean; message?: string }>;
  verifyPhone: (token: string) => Promise<{ success: boolean; message?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; message?: string }>;
  updateUser: (userData: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthed = !!user;

  // Check for existing token on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      console.log('[Auth] Checking auth status, token exists:', !!token);
      
      if (token) {
        const response = await api.getCurrentUser();
        console.log('[Auth] getCurrentUser response:', { 
          success: response.success, 
          hasUser: !!response.data?.user,
          message: response.message 
        });
        
        if (response.success && response.data?.user) {
          console.log('[Auth] User authenticated:', response.data.user.email);
          setUser(response.data.user);
        } else {
          // Check if it's a network error - if so, keep the token (user might still be valid)
          const isNetworkError = response.message?.includes('Network error') || 
                                 response.message?.includes('Unable to connect to server');
          
          if (isNetworkError) {
            console.warn('[Auth] Network error during auth check - keeping token for retry');
            // On network error, keep the token but set user to null so app shows Onboarding
            // User can retry login when network is available
            setUser(null);
          } else {
            // Token is invalid or expired - clear it
            console.log('[Auth] Auth failed (not network error), clearing token. Response:', response);
            await api.clearToken();
            setUser(null);
          }
        }
      } else {
        // No token, ensure user is null
        console.log('[Auth] No token found, setting user to null');
        setUser(null);
      }
    } catch (error: any) {
      console.error('[Auth] Error checking auth status:', error);
      
      // Don't clear token on network errors, just log them
      // Axios uses 'ERR_NETWORK' for network errors, not 'NETWORK_ERROR'
      if (error.code === 'ERR_NETWORK' || error.code === 'NETWORK_ERROR' || error.message?.includes('Network Error')) {
        console.warn('[Auth] Network error during auth check - keeping existing token');
        // Keep token, set user to null so app shows Onboarding
        setUser(null);
      } else {
        // Clear token for other types of errors
        await api.clearToken();
        setUser(null);
      }
    } finally {
      console.log('[Auth] Auth check complete, setting isLoading to false');
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      console.log('[Auth] Attempting login for:', email);
      const response = await api.login({ email, password });
      console.log('[Auth] Login response:', { 
        success: response.success, 
        hasData: !!response.data,
        message: response.message 
      });
      
      if (response.success && response.data) {
        console.log('[Auth] Login successful, setting token and user');
        api.setToken(response.data.token);
        setUser(response.data.user);
        console.log('[Auth] User authenticated:', response.data.user.email);
        return { success: true };
      } else {
        console.log('[Auth] Login failed:', response.message);
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
          message: response.message || 'Login failed' 
        };
      }
    } catch (error: any) {
      console.error('[Auth] Login error:', error);
      
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
        message: error.response?.data?.message || error.message || 'Login failed' 
      };
    } finally {
      setIsLoading(false);
    }
  };

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
      setIsLoading(true);
      const response = await api.register(userData);
      
      if (response.success && response.data) {
        api.setToken(response.data.token);
        setUser(response.data.user);
        return { success: true };
      } else {
        return { 
          success: false, 
          message: response.message || 'Registration failed' 
        };
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Registration failed' 
      };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Disconnect socket first
      socketService.disconnect();
      // Call API logout
      await api.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear token and user state, even if API call fails
      api.clearToken();
      setUser(null);
    }
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
      console.error('Email verification error:', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Email verification failed' 
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
      console.error('Resend email verification error:', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to resend verification code' 
      };
    }
  };

  const verifyPhone = async (token: string) => {
    try {
      const response = await api.verifyPhone(token);
      
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
      console.error('Phone verification error:', error);
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
      console.error('Forgot password error:', error);
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
        return { success: true };
      } else {
        return { 
          success: false, 
          message: response.message || 'Password reset failed' 
        };
      }
    } catch (error: any) {
      console.error('Reset password error:', error);
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
    register,
    logout,
    verifyEmail,
    verifyPhone,
    forgotPassword,
    resetPassword,
    resendEmailVerification,
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
