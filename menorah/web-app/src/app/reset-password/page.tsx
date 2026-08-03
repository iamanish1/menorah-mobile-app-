'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import CounsellorAuthShell from '@/components/auth/CounsellorAuthShell';
import Button from '@/components/ui/Button';
import { api } from '@/lib/api';
import styles from '@/app/login/page.module.css';

const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .refine((value) => /[a-z]/.test(value), 'Password must include a lowercase letter')
    .refine((value) => /[A-Z]/.test(value), 'Password must include an uppercase letter')
    .refine((value) => /\d/.test(value), 'Password must include a number'),
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const resetTokenRef = useRef('');
  const tokenCapturedRef = useRef(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  });

  useEffect(() => {
    if (tokenCapturedRef.current) return;
    tokenCapturedRef.current = true;

    const queryToken = searchParams.get('token') || '';
    const fragmentToken = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') || '';
    const resetToken = fragmentToken || queryToken;
    resetTokenRef.current = resetToken;
    setHasToken(Boolean(resetToken));
    setIsHydrated(true);

    if (resetToken) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [searchParams]);

  const onSubmit = async (data: ResetPasswordForm) => {
    const token = resetTokenRef.current;
    if (!token) {
      setServerError('This reset link is invalid or missing. Request a new link and try again.');
      return;
    }

    setServerError('');
    const result = await api.resetPassword(token, data.password);
    if (result.success) {
      window.location.replace('/login?reset=success');
      return;
    }
    setServerError(result.message || 'Could not reset your password. The link may have expired.');
  };

  return (
    <CounsellorAuthShell>
      <h2 className={styles.formHeading}>Set a new password</h2>
      <p className={styles.formSubtitle}>
        Choose a strong password for your counsellor account.
      </p>

      {serverError ? (
        <div className={styles.errorAlert} role="alert">
          <svg className={styles.errorIcon} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293 1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p className={styles.errorText}>{serverError}</p>
        </div>
      ) : null}

      {isHydrated && !hasToken ? (
        <div className={styles.noticeAlert} role="status">
          Request a fresh reset email to continue securely.
        </div>
      ) : null}

      <form
        method="post"
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        aria-busy={isSubmitting}
      >
        <div className={styles.formGroup}>
          <label htmlFor="new-password" className={styles.label}>New password</label>
          <div className={styles.inputWrapper}>
            <svg className={styles.inputIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <input
              {...register('password')}
              id="new-password"
              type="password"
              autoComplete="new-password"
              className={styles.input}
              placeholder="At least 8 characters"
              disabled={!isHydrated || !hasToken || isSubmitting}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'new-password-error' : 'password-requirements'}
            />
          </div>
          {errors.password ? (
            <p id="new-password-error" className={styles.errorMessage}>
              {errors.password.message}
            </p>
          ) : (
            <p id="password-requirements" className={styles.fieldHint}>
              Use uppercase, lowercase, and at least one number.
            </p>
          )}
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="confirm-new-password" className={styles.label}>Confirm new password</label>
          <div className={styles.inputWrapper}>
            <svg className={styles.inputIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <input
              {...register('confirmPassword')}
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              className={styles.input}
              placeholder="Repeat your new password"
              disabled={!isHydrated || !hasToken || isSubmitting}
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={errors.confirmPassword ? 'confirm-new-password-error' : undefined}
            />
          </div>
          {errors.confirmPassword ? (
            <p id="confirm-new-password-error" className={styles.errorMessage}>
              {errors.confirmPassword.message}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isSubmitting}
          disabled={!isHydrated || !hasToken}
          className={styles.fullWidth}
        >
          Reset password
        </Button>
      </form>

      <div className={styles.formFooter}>
        <p className={styles.footerText}>
          Need another link?{' '}
          <Link href="/forgot-password" className={styles.footerLink}>
            Request a new reset email
          </Link>
        </p>
      </div>
    </CounsellorAuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={(
        <div className={`${styles.page} ${styles.loadingPage}`}>
          <div className={styles.loadingSpinner} />
        </div>
      )}
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
