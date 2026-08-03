'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Button, Input, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

const schema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .refine((value) => /[a-z]/.test(value), 'Password must include a lowercase letter')
    .refine((value) => /[A-Z]/.test(value), 'Password must include an uppercase letter')
    .refine((value) => /\d/.test(value), 'Password must include a number'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
type FormValues = z.infer<typeof schema>;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const resetTokenRef = useRef('');
  const tokenCapturedRef = useRef(false);
  const { resetPassword } = useAuth();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [showPwd, setShowPwd]     = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (tokenCapturedRef.current) return;
    tokenCapturedRef.current = true;

    const queryToken = searchParams.get('token') || '';
    const fragmentToken = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') || '';
    const resetToken = fragmentToken || queryToken;
    resetTokenRef.current = resetToken;
    setIsHydrated(true);

    // Do not leave a reset capability in history after the page has read it.
    if (resetToken) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [searchParams]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    const token = resetTokenRef.current;
    if (!token) { setServerError('Invalid or missing reset token. Please request a new link.'); return; }
    setServerError('');
    const res = await resetPassword(token, data.password);
    if (res.success) {
      router.push('/login?reset=success');
    } else {
      setServerError(res.message || 'Failed to reset password. The link may have expired.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-950 dark:text-primary-50">Set new password</h1>
        <p className="text-gray-500 dark:text-primary-100/70 mt-1">Choose a strong password for your account.</p>
      </div>

      {serverError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-200">
          {serverError}
        </div>
      )}

      <form method="post" noValidate onSubmit={handleSubmit(onSubmit)}>
        <fieldset disabled={!isHydrated} aria-busy={!isHydrated || isSubmitting} className="space-y-4">
          <Input
            label="New password"
            type={showPwd ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="8+ chars with uppercase, lowercase, and a number"
            leftIcon={<Lock className="w-4 h-4" />}
            rightIcon={
              <button
                type="button"
                aria-label={showPwd ? 'Hide passwords' : 'Show passwords'}
                onClick={() => setShowPwd((p) => !p)}
                className="hover:text-gray-600 dark:hover:text-primary-50"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
            error={errors.password?.message}
            {...register('password')}
          />
          <Input
            label="Confirm password"
            type={showPwd ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Repeat your new password"
            leftIcon={<Lock className="w-4 h-4" />}
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
            Reset Password
          </Button>
        </fieldset>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
