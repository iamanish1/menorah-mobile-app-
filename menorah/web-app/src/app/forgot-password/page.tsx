'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import CounsellorAuthShell from '@/components/auth/CounsellorAuthShell';
import Button from '@/components/ui/Button';
import { api } from '@/lib/api';
import styles from '@/app/login/page.module.css';

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const onSubmit = async (data: ForgotPasswordForm) => {
    setServerError('');
    const result = await api.forgotPassword(data.email.trim().toLowerCase());
    if (result.success) {
      setSent(true);
      return;
    }
    setServerError(result.message || 'Could not send reset instructions. Please try again.');
  };

  return (
    <CounsellorAuthShell>
      {sent ? (
        <>
          <div className={styles.statusIcon} aria-hidden="true">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className={styles.formHeading}>Check your inbox</h2>
          <p className={styles.formSubtitle}>
            If a counsellor account exists for {getValues('email')}, a secure reset link has been sent.
          </p>
          <div className={styles.noticeAlert} role="status">
            Reset links expire after 10 minutes. Check your spam folder if the email does not arrive.
          </div>
          <div className={styles.formFooter}>
            <p className={styles.footerText}>
              <Link href="/login" className={styles.footerLink}>
                Back to counsellor sign in
              </Link>
            </p>
          </div>
        </>
      ) : (
        <>
          <h2 className={styles.formHeading}>Forgot your password?</h2>
          <p className={styles.formSubtitle}>
            Enter the email used for your counsellor account and we will send a secure reset link.
          </p>

          {serverError ? (
            <div className={styles.errorAlert} role="alert">
              <svg className={styles.errorIcon} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className={styles.errorText}>{serverError}</p>
            </div>
          ) : null}

          <form
            method="post"
            noValidate
            onSubmit={handleSubmit(onSubmit)}
            aria-busy={isSubmitting}
          >
            <div className={styles.formGroup}>
              <label htmlFor="forgot-email" className={styles.label}>Email address</label>
              <div className={styles.inputWrapper}>
                <svg className={styles.inputIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <input
                  {...register('email')}
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  className={styles.input}
                  placeholder="you@example.com"
                  disabled={!isHydrated || isSubmitting}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'forgot-email-error' : undefined}
                />
              </div>
              {errors.email ? (
                <p id="forgot-email-error" className={styles.errorMessage}>
                  {errors.email.message}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              disabled={!isHydrated}
              className={styles.fullWidth}
            >
              Send reset link
            </Button>
          </form>

          <div className={styles.formFooter}>
            <p className={styles.footerText}>
              Remember your password?{' '}
              <Link href="/login" className={styles.footerLink}>
                Back to sign in
              </Link>
            </p>
          </div>
        </>
      )}
    </CounsellorAuthShell>
  );
}
