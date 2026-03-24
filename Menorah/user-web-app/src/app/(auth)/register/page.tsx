'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, User, Phone, Calendar } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

// Backend validation rules:
// - phone must match /^\+[1-9]\d{1,14}$/ (E.164 format with country code, no spaces)
// - dateOfBirth must be ISO8601 (required)
// - gender must be exactly: 'male' | 'female' | 'other' | 'prefer-not-to-say' (hyphens)

const schema = z.object({
  firstName:       z.string().min(2, 'First name must be at least 2 characters'),
  lastName:        z.string().min(2, 'Last name must be at least 2 characters'),
  email:           z.string().email('Enter a valid email address'),
  phone:           z.string().regex(/^\+[1-9]\d{1,14}$/, 'Use E.164 format e.g. +971501234567'),
  dateOfBirth:     z.string().min(1, 'Date of birth is required'),
  gender:          z.enum(['male', 'female', 'other', 'prefer-not-to-say'], {
    errorMap: () => ({ message: 'Please select a gender' }),
  }),
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const router    = useRouter();
  const [showPwd, setShowPwd]         = useState(false);
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setServerError('');
    const { confirmPassword, ...payload } = data;
    const res = await registerUser(payload);
    if (res.success) {
      router.push(`/verify-otp?email=${encodeURIComponent(data.email)}`);
    } else {
      setServerError(res.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create account</h1>
        <p className="text-gray-500 mt-1">Start your mental well-being journey today</p>
      </div>

      {serverError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            placeholder="John"
            leftIcon={<User className="w-4 h-4" />}
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <Input
            label="Last name"
            placeholder="Doe"
            leftIcon={<User className="w-4 h-4" />}
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>

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
          label="Phone number"
          type="tel"
          placeholder="+971501234567"
          hint="Include country code, no spaces (e.g. +971501234567)"
          leftIcon={<Phone className="w-4 h-4" />}
          error={errors.phone?.message}
          {...register('phone')}
        />

        <Input
          label="Date of birth"
          type="date"
          required
          leftIcon={<Calendar className="w-4 h-4" />}
          error={errors.dateOfBirth?.message}
          {...register('dateOfBirth')}
        />

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">
            Gender <span className="text-red-500">*</span>
          </label>
          <select className="input-field" {...register('gender')}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer-not-to-say">Prefer not to say</option>
          </select>
          {errors.gender && <p className="text-sm text-red-500">{errors.gender.message}</p>}
        </div>

        <Input
          label="Password"
          type={showPwd ? 'text' : 'password'}
          placeholder="Min 8 characters"
          autoComplete="new-password"
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
          placeholder="Repeat your password"
          leftIcon={<Lock className="w-4 h-4" />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Create Account
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
