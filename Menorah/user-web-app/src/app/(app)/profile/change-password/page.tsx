'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input } from '@/components/ui';

const schema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword:     z.string().min(8, 'New password must be at least 8 characters'),
  confirm:         z.string(),
}).refine((d) => d.newPassword === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });

type FormValues = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]   = useState('');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setError('');
    const res = await api.changePassword(data.currentPassword, data.newPassword);
    if (res.success) {
      setSuccess(true);
      reset();
    } else {
      setError(res.message || 'Failed to change password');
    }
  };

  if (success) {
    return (
      <div className="page-container max-w-md text-center pt-16 space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mx-auto">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Password changed!</h2>
        <p className="text-gray-500 text-sm">Your password has been updated successfully.</p>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="page-container max-w-md">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Change Password</h1>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{error}</div>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Current password" type={show ? 'text' : 'password'}
          leftIcon={<Lock className="w-4 h-4" />}
          rightIcon={<button type="button" onClick={() => setShow((p) => !p)}>{show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>}
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
        <Input
          label="New password" type={show ? 'text' : 'password'}
          leftIcon={<Lock className="w-4 h-4" />}
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <Input
          label="Confirm new password" type={show ? 'text' : 'password'}
          leftIcon={<Lock className="w-4 h-4" />}
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>Update Password</Button>
      </form>
    </div>
  );
}
