'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Button from '@/components/ui/Button';
import ThemeToggle from '@/components/theme/ThemeToggle';
import styles from './page.module.css';

const loginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;
type RoleRedirect = {
  redirectUrl?: string;
  redirectLabel?: string;
};

const USER_APP_LOGIN_URL = process.env.NEXT_PUBLIC_USER_APP_URL || 'https://app.menorah.me/login';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [error,        setError]        = useState<string | null>(null);
  const [roleRedirect, setRoleRedirect] = useState<RoleRedirect | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const account = params.get('account')?.toLowerCase();
    if (account === 'user') {
      setError('This looks like a regular user account. Please sign in through the user app.');
      setRoleRedirect({
        redirectUrl: USER_APP_LOGIN_URL,
        redirectLabel: 'Open user app',
      });
    }
  }, []);

  const onSubmit = async (data: LoginForm) => {
    try {
      setIsSubmitting(true);
      setError(null);
      setRoleRedirect(null);
      const result = await login(data.email, data.password);
      if (result.success) {
        router.push('/dashboard');
      } else {
        setError(result.message || 'Invalid email or password');
        setRoleRedirect(result.roleRedirect ?? null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.page} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 40, height: 40,
          border: '3px solid var(--color-primary)',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Left editorial panel */}
      <div className={styles.panel}>
        <div className={styles.panelDeco1} />
        <div className={styles.panelDeco2} />

        <span className={styles.panelLogo}>
          <span className={styles.panelLogoIcon}>M</span>
          <span className={styles.panelLogoName}>Menorah Health</span>
        </span>

        <div className={styles.panelBody}>
          <p className={styles.panelEyebrow}>Counselor Portal</p>
          <h1 className={styles.panelHeading}>
            Your practice,<br />managed simply.
          </h1>
          <figure className={styles.panelQuote}>
            <blockquote>
              <p className={styles.panelQuoteText}>
                &ldquo;The dashboard gives me everything I need in one place — scheduling, client chat, and earnings. I spend less time on admin.&rdquo;
              </p>
            </blockquote>
            <figcaption>
              <p className={styles.panelQuoteAuthor}>— Dr. Meera K., Clinical Psychologist</p>
            </figcaption>
          </figure>
        </div>

        <p className={styles.panelFooter}>
          &copy; {new Date().getFullYear()} Menorah Health
        </p>
      </div>

      {/* Right form panel */}
      <div className={styles.formPanel}>
        <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 2 }}>
          <ThemeToggle />
        </div>
        <Link href="/" className={styles.mobileLogo}>
          <span className={styles.mobileLogoIcon}>M</span>
          <span className={styles.mobileLogoName}>Menorah Health</span>
        </Link>

        <div className={styles.formWrap}>
          <div className={styles.formInner}>
            <h2 className={styles.formHeading}>Welcome back</h2>
            <p className={styles.formSubtitle}>Sign in to your counselor account</p>

            {error && (
              <div className={styles.errorAlert}>
                <svg className={styles.errorIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className={styles.errorText}>{error}</p>
                  {roleRedirect?.redirectUrl && (
                    <a href={roleRedirect.redirectUrl} className={styles.portalRedirectButton}>
                      {roleRedirect.redirectLabel || 'Open correct portal'}
                    </a>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)}>
              <div className={styles.formGroup}>
                <label htmlFor="email" className={styles.label}>Email address</label>
                <div className={styles.inputWrapper}>
                  <svg className={styles.inputIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <input
                    {...register('email')}
                    id="email"
                    type="email"
                    autoComplete="email"
                    className={styles.input}
                    placeholder="you@example.com"
                  />
                </div>
                {errors.email && (
                  <p className={styles.errorMessage}>
                    <svg className={styles.errorIconSmall} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="password" className={styles.label}>Password</label>
                <div className={styles.inputWrapper}>
                  <svg className={styles.inputIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <input
                    {...register('password')}
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    className={styles.input}
                    placeholder="Enter your password"
                  />
                </div>
                {errors.password && (
                  <p className={styles.errorMessage}>
                    <svg className={styles.errorIconSmall} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isSubmitting}
                className={styles.fullWidth}
              >
                Sign in
              </Button>
            </form>

            <div className={styles.formFooter}>
              <p className={styles.footerText}>
                Don&apos;t have an account?{' '}
                <Link href="/register" className={styles.footerLink}>
                  Register as Counselor
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
