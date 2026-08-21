'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Lock, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input } from '@/components/ui';

const schema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .refine((value) => /[a-z]/.test(value), 'Password must include a lowercase letter')
    .refine((value) => /[A-Z]/.test(value), 'Password must include an uppercase letter')
    .refine((value) => /\d/.test(value), 'Password must include a number'),
  confirm:         z.string(),
}).refine((d) => d.newPassword === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });

type FormValues = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError]   = useState('');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const onSubmit = async (data: FormValues) => {
    setError('');
    const res = await api.changePassword(data.currentPassword, data.newPassword);
    if (res.success) {
      reset();
      window.location.replace('/login?password=changed');
    } else {
      const validationMessage = res.errors
        ?.map((validationError) => validationError.message || validationError.msg)
        .find(Boolean);
      setError(validationMessage || res.message || 'Failed to change password');
    }
  };

  return (
    <div className="page-container max-w-md">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Change Password</h1>

      {error && <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{error}</div>}

      <form method="post" noValidate onSubmit={handleSubmit(onSubmit)}>
        <fieldset disabled={!isHydrated} aria-busy={!isHydrated || isSubmitting} className="space-y-4">
          <Input
            label="Current password" type={show ? 'text' : 'password'}
            autoComplete="current-password"
            leftIcon={<Lock className="w-4 h-4" />}
            rightIcon={
              <button
                type="button"
                aria-label={show ? 'Hide passwords' : 'Show passwords'}
                onClick={() => setShow((p) => !p)}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />
          <Input
            label="New password" type={show ? 'text' : 'password'}
            autoComplete="new-password"
            leftIcon={<Lock className="w-4 h-4" />}
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <Input
            label="Confirm new password" type={show ? 'text' : 'password'}
            autoComplete="new-password"
            leftIcon={<Lock className="w-4 h-4" />}
            error={errors.confirm?.message}
            {...register('confirm')}
          />
          <Button type="submit" fullWidth size="lg" loading={isSubmitting}>Update Password</Button>
        </fieldset>
      </form>
    </div>
  );
}
