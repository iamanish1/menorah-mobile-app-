'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthed, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (user && user.role !== 'user') {
      const portal = user.role === 'admin'
        ? 'https://admin.menorah.me/login'
        : 'https://counsellor.menorah.me/login';
      window.location.replace(portal);
    } else if (!isAuthed) {
      router.replace('/login');
    } else if (user && !user.isEmailVerified) {
      router.replace('/verify-otp');
    }
  }, [isAuthed, isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="menorah-app-shell min-h-screen flex items-center justify-center bg-[var(--app-bg)] dark:text-primary-50">
        <div className="text-center space-y-3">
          <Spinner size="lg" />
          <p className="text-gray-500 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthed || (user && (user.role !== 'user' || !user.isEmailVerified))) return null;
  return <>{children}</>;
}
