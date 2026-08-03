'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { loadGoogleScript } from '@/components/auth/GoogleAuthButton';

interface GoogleLinkButtonProps {
  currentPassword: string;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export function GoogleLinkButton({
  currentPassword,
  onError,
  onSuccess,
}: GoogleLinkButtonProps) {
  const { linkSocialProvider } = useAuth();
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const passwordRef = useRef(currentPassword);
  const renderId = useId();
  const [isReady, setIsReady] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const canLink = currentPassword.length > 0;
  passwordRef.current = currentPassword;

  useEffect(() => {
    let cancelled = false;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!canLink || !clientId || !buttonRef.current) return;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          auto_select: false,
          callback: async ({ credential }) => {
            if (!credential) {
              onError('Google did not return a sign-in credential. Please try again.');
              return;
            }

            setIsLinking(true);
            onError('');
            const result = await linkSocialProvider('google', credential, passwordRef.current);
            setIsLinking(false);
            if (result.success) {
              onSuccess(result.message || 'Google sign-in linked successfully.');
              return;
            }
            onError(result.message || 'Google sign-in could not be linked.');
          },
        });

        buttonRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: '360',
        });
        setIsReady(true);
      })
      .catch((error) => {
        onError(error instanceof Error ? error.message : 'Google sign-in could not load.');
      });

    return () => {
      cancelled = true;
    };
  }, [canLink, linkSocialProvider, onError, onSuccess]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        Google account linking is unavailable because the Google client ID is not configured.
      </div>
    );
  }

  if (!canLink) {
    return (
      <button
        type="button"
        disabled
        className="min-h-12 w-full cursor-not-allowed rounded-full border border-gray-200 bg-gray-50 px-5 text-sm font-semibold text-gray-400 dark:border-primary-800 dark:bg-primary-950 dark:text-primary-100/45"
      >
        Enter your current password to continue with Google
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={buttonRef}
        id={`google-link-${renderId}`}
        className="flex min-h-12 w-full items-center justify-center overflow-hidden rounded-full"
        aria-busy={!isReady || isLinking}
      />
      {(!isReady || isLinking) && (
        <div className="h-12 animate-pulse rounded-full border border-gray-200 bg-white dark:border-primary-800 dark:bg-primary-900" />
      )}
    </div>
  );
}
