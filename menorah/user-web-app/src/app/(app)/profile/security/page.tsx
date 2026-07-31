'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { GoogleLinkButton } from '@/components/auth/GoogleLinkButton';
import { Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

export default function SecurityPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleError = useCallback((message: string) => {
    setSuccess('');
    setError(message);
  }, []);

  const handleSuccess = useCallback((message: string) => {
    setError('');
    setSuccess(message);
    setCurrentPassword('');
  }, []);

  if (!user) return null;

  const googleLinked = Boolean(user.linkedProviders?.google);
  const appleLinked = Boolean(user.linkedProviders?.apple);

  return (
    <div className="page-container max-w-xl">
      <Link
        href="/profile"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-primary-700 dark:text-primary-100/70 dark:hover:text-primary-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to profile
      </Link>

      <div className="card space-y-6 p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-black text-gray-950 dark:text-primary-50">Security &amp; sign-in</h1>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-primary-100/70">
              Link a provider only after confirming your current password. Menorah will never merge accounts based on email alone.
            </p>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        <section className="space-y-4 rounded-2xl border border-primary-100 p-4 dark:border-primary-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-gray-950 dark:text-primary-50">Google</h2>
              <p className="text-sm text-gray-500 dark:text-primary-100/70">
                {googleLinked ? 'Available when you sign in with Google.' : 'Not linked to this account.'}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${googleLinked ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200' : 'bg-gray-100 text-gray-500 dark:bg-primary-800 dark:text-primary-100/70'}`}>
              {googleLinked ? 'Linked' : 'Not linked'}
            </span>
          </div>

          {!googleLinked && (
            <>
              <Input
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                leftIcon={<LockKeyhole className="h-4 w-4" />}
                hint="Required to protect against unauthorized account linking."
              />
              <GoogleLinkButton
                currentPassword={currentPassword}
                onError={handleError}
                onSuccess={handleSuccess}
              />
            </>
          )}
        </section>

        <section className="flex items-center justify-between gap-3 rounded-2xl border border-primary-100 p-4 dark:border-primary-800">
          <div>
            <h2 className="font-black text-gray-950 dark:text-primary-50">Apple</h2>
            <p className="text-sm text-gray-500 dark:text-primary-100/70">
              {appleLinked ? 'Available when you sign in with Apple.' : 'Apple linking is currently available from the mobile app.'}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${appleLinked ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200' : 'bg-gray-100 text-gray-500 dark:bg-primary-800 dark:text-primary-100/70'}`}>
            {appleLinked ? 'Linked' : 'Not linked'}
          </span>
        </section>

        <Link
          href="/forgot-password"
          className="inline-flex items-center gap-2 text-sm font-bold text-primary-700 hover:underline dark:text-primary-100"
        >
          <LockKeyhole className="h-4 w-4" />
          Forgot password
        </Link>
      </div>
    </div>
  );
}
