'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import styles from '../login/page.module.css';

export default function VerifyEmailPage() {
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

    await auth.checkAuth();
    router.replace('/dashboard');
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
    setNotice('If this account still needs verification, a new code has been sent.');
  };

  return (
    <div className={styles.page}>
      <div className={styles.formPanel}>
        <Link href="/login" className={styles.mobileLogo}>
          <span className={styles.mobileLogoIcon}>M</span>
          <span className={styles.mobileLogoName}>Menorah Health</span>
        </Link>
        <div className={styles.formWrap}>
          <div className={styles.formInner}>
            <h1 className={styles.formHeading}>Verify your email</h1>
            <p className={styles.formSubtitle}>
              Enter the code sent to {email || 'your email address'} before accessing the counsellor portal.
            </p>

            {error ? <div role="alert" className={styles.errorAlert}><p className={styles.errorText}>{error}</p></div> : null}
            {notice ? <p className={styles.formSubtitle} role="status">{notice}</p> : null}

            <form onSubmit={handleVerify}>
              <div className={styles.formGroup}>
                <label htmlFor="verification-code" className={styles.label}>Verification code</label>
                <input
                  id="verification-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={styles.input}
                  placeholder="123456"
                />
              </div>
              <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting} className={styles.fullWidth}>
                Verify email
              </Button>
            </form>

            <div className={styles.formFooter}>
              <button type="button" className={styles.footerLink} onClick={handleResend} disabled={isResending}>
                {isResending ? 'Sending code…' : 'Resend verification code'}
              </button>
              <p className={styles.footerText}>
                <Link href="/login" className={styles.footerLink}>Back to sign in</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
