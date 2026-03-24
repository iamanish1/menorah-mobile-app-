'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Button, Input, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
type FormValues = z.infer<typeof schema>;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token        = searchParams.get('token') || '';
  const { resetPassword } = useAuth();
  const router = useRouter();
  const [showPwd, setShowPwd]     = useState(false);
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
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
        <h1 className="text-2xl font-bold text-gray-900">Set new password</h1>
        <p className="text-gray-500 mt-1">Choose a strong password for your account.</p>
      </div>

      {serverError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="New password"
          type={showPwd ? 'text' : 'password'}
          placeholder="Min 8 characters"
          leftIcon={<Lock className="w-4 h-4" />}
          rightIcon={
            <button type="button" onClick={() => setShowPwd((p) => !p)} className="hover:text-gray-600">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm password"
          type={showPwd ? 'text' : 'password'}
          placeholder="Repeat your new password"
          leftIcon={<Lock className="w-4 h-4" />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Reset Password
        </Button>
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
