'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, RefreshCw } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

function maskEmail(email?: string) {
  if (!email) return 'your email address';
  const [user, domain] = email.split('@');
  const masked = user.slice(0, 2) + '•'.repeat(Math.max(0, user.length - 2));
  return `${masked}@${domain}`;
}

function VerifyOtpForm() {
  const router = useRouter();
  const { verifyEmailOTP, user, isLoading } = useAuth();

  const [pendingEmail, setPendingEmail] = useState('');
  const [otp, setOtp]             = useState(['', '', '', '', '', '']);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Load pending email from sessionStorage on mount
  useEffect(() => {
    const email = sessionStorage.getItem('pendingEmail') || '';
    if (!email) {
      // No pending registration — redirect to register
      router.replace('/register');
      return;
    }
    setPendingEmail(email);
    inputRefs.current[0]?.focus();
  }, [router]);

  // Already verified and logged in — skip to app
  useEffect(() => {
    if (!isLoading && user?.isEmailVerified) router.replace('/discover');
  }, [user, isLoading, router]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleChange = (idx: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[idx] = value;
    setOtp(next);
    if (value && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (digits.length === 6) {
      setOtp(digits.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  const handleSubmit = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError('Enter the complete 6-digit code'); return; }
    if (!pendingEmail) { setError('Email not found. Please register again.'); return; }
    setLoading(true);
    setError('');
    const res = await verifyEmailOTP(pendingEmail, code);
    setLoading(false);
    if (!res.success) {
      setError(res.message || 'Invalid code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
    // on success — useEffect watching user.isEmailVerified handles the redirect
  };

  const handleResend = async () => {
    if (countdown > 0 || !pendingEmail) return;
    setResending(true);
    setError('');
    await api.resendEmailOTP(pendingEmail);
    setResending(false);
    setCountdown(60);
    setOtp(['', '', '', '', '', '']);
    inputRefs.current[0]?.focus();
  };

  const displayEmail = maskEmail(pendingEmail);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-2xl mx-auto">
        <Mail className="w-8 h-8 text-primary-600" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Verify your email</h1>
        <p className="text-gray-500 mt-2 text-sm leading-relaxed">
          We sent a 6-digit code to<br />
          <span className="font-semibold text-gray-800">{displayEmail}</span>
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* OTP inputs */}
      <div className="flex gap-2 justify-center" onPaste={handlePaste}>
        {otp.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => { inputRefs.current[idx] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            className="w-12 h-14 text-center text-xl font-semibold border border-gray-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                       bg-white transition-all"
          />
        ))}
      </div>

      <Button fullWidth size="lg" loading={loading} onClick={handleSubmit}>
        Verify Email
      </Button>

      <div className="space-y-1">
        <button
          onClick={handleResend}
          disabled={countdown > 0 || resending || !user?.email}
          className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-primary-600
                     disabled:opacity-50 disabled:cursor-not-allowed mx-auto transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} />
          {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend code'}
        </button>
        <p className="text-xs text-gray-400">
          Didn&apos;t receive it? Check your spam folder or tap resend.
        </p>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    }>
      <VerifyOtpForm />
    </Suspense>
  );
}
