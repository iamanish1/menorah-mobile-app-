'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';

const schema = z.object({
  email:    z.string().email('Enter a valid email'),
  // Login must not impose a different password policy than the server. This
  // also allows accounts created before the strengthened policy to sign in
  // and change their credentials safely.
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const router    = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [serverError, setServerError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === 'success') {
      setNotice('Your password was reset. Sign in with your new password.');
    } else if (params.get('password') === 'changed') {
      setNotice('Your password was changed and all sessions were signed out. Sign in again.');
    }

    if (params.has('reset') || params.has('password')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    setIsHydrated(true);
  }, []);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setServerError('');
    const res = await login(data.email, data.password);
    if (res.needsVerification) {
      router.push('/verify-otp');
    } else if (res.requiresProfileCompletion) {
      router.replace('/complete-profile');
    } else if (res.success) {
      router.push('/discover');
    } else {
      setServerError(res.message || 'Login failed. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-950 dark:text-primary-50">Welcome back</h1>
        <p className="text-gray-500 dark:text-primary-100/70 mt-1">Your well-being journey continues here</p>
      </div>

      {serverError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-200">
          {serverError}
        </div>
      )}

      {notice ? (
        <div role="status" className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          {notice}
        </div>
      ) : null}

      <GoogleAuthButton mode="signin" onError={setServerError} />

      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-primary-100/45">
        <span className="h-px flex-1 bg-gray-200 dark:bg-primary-800" />
        <span>or use email</span>
        <span className="h-px flex-1 bg-gray-200 dark:bg-primary-800" />
      </div>

      <form method="post" noValidate onSubmit={handleSubmit(onSubmit)}>
        <fieldset disabled={!isHydrated} aria-busy={!isHydrated || isSubmitting} className="space-y-4">
          <Input
            label="Email address"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            leftIcon={<Mail className="w-4 h-4" />}
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label="Password"
            type={showPwd ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            leftIcon={<Lock className="w-4 h-4" />}
            rightIcon={
              <button
                type="button"
                aria-label={showPwd ? 'Hide password' : 'Show password'}
                onClick={() => setShowPwd((p) => !p)}
                className="hover:text-gray-600 dark:hover:text-primary-50"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
            error={errors.password?.message}
            {...register('password')}
          />

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
            Sign In
          </Button>
        </fieldset>
      </form>

      <p className="text-center text-sm text-gray-500 dark:text-primary-100/70">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-primary-600 hover:text-primary-700 font-medium">
          Create account
        </Link>
      </p>
    </div>
  );
}
