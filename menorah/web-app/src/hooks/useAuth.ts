'use client';

import { useEffect, useState } from 'react';
import { authStore, auth, AuthContextType } from '@/lib/auth';
import { COUNSELLOR_UNAUTHORIZED_EVENT } from '@/lib/api';

export function useAuth(): AuthContextType {
  const [state, setState] = useState(authStore.getState());

  useEffect(() => {
    const unsubscribe = authStore.subscribe(() => {
      setState(authStore.getState());
    });
    const handleUnauthorized = () => {
      authStore.setState({ user: null, isLoading: false });
    };
    window.addEventListener(COUNSELLOR_UNAUTHORIZED_EVENT, handleUnauthorized);

    // Check auth on mount
    if (state.isLoading) {
      auth.checkAuth();
    }

    return () => {
      unsubscribe();
      window.removeEventListener(COUNSELLOR_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  return {
    user: state.user,
    isLoading: state.isLoading,
    isAuthenticated: !!state.user && state.user.role === 'counsellor',
    login: auth.login,
    logout: auth.logout,
    logoutAll: auth.logoutAll,
    checkAuth: auth.checkAuth,
  };
}
