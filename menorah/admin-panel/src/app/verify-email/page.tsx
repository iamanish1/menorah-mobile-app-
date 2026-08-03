'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MailCheck, Shield } from 'lucide-react';
import { api } from '@/lib/api';

export default function VerifyAdminEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    const suppliedEmail = new URLSearchParams(window.location.search).get('email')?.trim() || '';
    if (!suppliedEmail) {
      router.replace('/login');
      return;
    }
    setEmail(suppliedEmail);
  }, [router]);

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit verification code.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    const result = await api.verifyEmail(email, code);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.message || 'The verification code is invalid or expired.');
      return;
    }

    // Admin MFA remains a separate gate, so return to login without creating
    // an admin session from the public email-verification endpoint.
    router.replace('/login?verified=1');
  };

  const handleResend = async () => {
    if (!email) return;
    setIsResending(true);
    setError('');
    const result = await api.resendEmailVerification(email);
    setIsResending(false);
    if (!result.success) {
      setError(result.message || 'We could not send a verification code.');
      return;
    }
    setNotice('If this admin account still needs verification, a new code has been sent.');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Shield size={21} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-950">Verify admin email</h1>
            <p className="text-sm text-slate-500">Required before admin sign-in and MFA.</p>
          </div>
        </div>

        <div className="mb-5 flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
          <MailCheck className="mt-0.5 shrink-0" size={17} />
          <span>Enter the code sent to {email || 'your email address'}.</span>
        </div>

        {error ? <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {notice ? <p role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p> : null}

        <form className="space-y-4" onSubmit={handleVerify}>
          <label className="block text-sm font-medium text-slate-700" htmlFor="verification-code">
            Verification code
            <input
              id="verification-code"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-center text-lg tracking-[0.35em] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Verifying…' : 'Verify email'}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <button type="button" disabled={isResending} onClick={handleResend} className="font-semibold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60">
            {isResending ? 'Sending…' : 'Resend code'}
          </button>
          <Link href="/login" className="font-medium text-slate-500 hover:text-slate-800">Back to login</Link>
        </div>
      </section>
    </main>
  );
}
