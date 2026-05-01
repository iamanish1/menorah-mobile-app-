'use client';

import { useEffect, useState } from 'react';
import { authStore, auth, AuthContextType } from '@/lib/auth';
import { User } from '@/types';

export function useAuth(): AuthContextType {
  const [state, setState] = useState(authStore.getState());

  useEffect(() => {
    const unsubscribe = authStore.subscribe(() => {
      setState(authStore.getState());
    });

    // Check auth on mount
    if (state.isLoading) {
      auth.checkAuth();
    }

    return unsubscribe;
  }, []);

  return {
    user: state.user,
    isLoading: state.isLoading,
    isAuthenticated: !!state.user && state.user.role === 'counsellor',
    login: auth.login,
    logout: auth.logout,
    checkAuth: auth.checkAuth,
  };
}

