'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            ux_mode?: 'popup' | 'redirect';
            auto_select?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: string;
            }
          ) => void;
        };
      };
    };
  }
}

const SCRIPT_ID = 'google-identity-services';

interface GoogleAuthButtonProps {
  mode: 'signin' | 'signup';
  onError: (message: string) => void;
}

const loadGoogleScript = () =>
  new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if (window.google?.accounts?.id) return resolve();

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google sign-in could not load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google sign-in could not load.'));
    document.head.appendChild(script);
  });

export function GoogleAuthButton({ mode, onError }: GoogleAuthButtonProps) {
  const router = useRouter();
  const { loginWithGoogle } = useAuth();
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const renderId = useId();
  const [isReady, setIsReady] = useState(false);
  const [isConfigured] = useState(() => Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID));

  useEffect(() => {
    let cancelled = false;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId || !buttonRef.current) return;

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

            onError('');
            const result = await loginWithGoogle(credential);
            if (result.success) {
              router.push('/discover');
              return;
            }
            onError(result.message || 'Google sign-in failed. Please try again.');
          }
        });

        buttonRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: mode === 'signup' ? 'signup_with' : 'signin_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: '360'
        });
        setIsReady(true);
      })
      .catch((error) => {
        onError(error instanceof Error ? error.message : 'Google sign-in could not load.');
      });

    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle, mode, onError, router]);

  if (!isConfigured) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        Google sign-in is ready in the UI, but the public Google client ID still needs to be configured.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={buttonRef}
        id={`google-auth-${renderId}`}
        className="flex min-h-12 w-full items-center justify-center overflow-hidden rounded-full"
        aria-busy={!isReady}
      />
      {!isReady && (
        <div className="h-12 animate-pulse rounded-full border border-gray-200 bg-white dark:border-primary-800 dark:bg-primary-900" />
      )}
    </div>
  );
}
