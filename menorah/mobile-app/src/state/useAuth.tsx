import React, { useState, useEffect, createContext, useContext } from 'react';
import { api, User } from '@/lib/api';
import { secureStorage } from '@/lib/secureStorage';
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
  verifyPhone: (phone: string, otp: string) => Promise<{ success: boolean; message?: string }>;
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
      const token = await secureStorage.getToken();

      if (token) {
        const response = await api.getCurrentUser();
        if (response.success && response.data?.user) {
          setUser(response.data.user);
        } else {
          const isNetworkError = response.message?.includes('Network error') ||
                                 response.message?.includes('Unable to connect to server');
          if (!isNetworkError) {
            await api.clearToken();
          }
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (error: any) {
      const isNetworkError = error.code === 'ERR_NETWORK' || error.code === 'NETWORK_ERROR' ||
                             error.message?.includes('Network Error');
      if (!isNetworkError) {
        await api.clearToken();
      }
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await api.login({ email, password });

      if (response.success && response.data) {
        api.setToken(response.data.token);
        setUser(response.data.user);
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
