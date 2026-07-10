'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, User, Calendar } from 'lucide-react';
import { Button, CountryPhoneInput, Input, Select } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';

// Backend validation rules:
// - phone must match /^\+[1-9]\d{1,14}$/ (E.164 format with country code, no spaces)
// - dateOfBirth must be ISO8601 (required)
// - gender must be exactly: 'male' | 'female' | 'other' | 'prefer-not-to-say' (hyphens)

const passwordRuleMessage = 'Password must be at least 8 characters and include uppercase, lowercase, and a number';

const schema = z.object({
  firstName:       z.string().min(2, 'First name must be at least 2 characters'),
  lastName:        z.string().min(2, 'Last name must be at least 2 characters'),
  email:           z.string().email('Enter a valid email address'),
  phone:           z.string().regex(/^\+[1-9]\d{1,14}$/, 'Use E.164 format e.g. +971501234567'),
  dateOfBirth:     z.string().min(1, 'Date of birth is required'),
  gender:          z.literal('male'),
  password:        z.string().min(8, passwordRuleMessage).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, passwordRuleMessage),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormValues = z.infer<typeof schema>;

const getFirstFormError = (errors: FieldErrors<FormValues>) => {
  const fieldOrder: Array<keyof FormValues> = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'dateOfBirth',
    'gender',
    'password',
    'confirmPassword',
  ];

  for (const field of fieldOrder) {
    const message = errors[field]?.message;
    if (typeof message === 'string') return message;
  }

  return 'Please fix the highlighted field and try again.';
};

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const router    = useRouter();
  const [showPwd, setShowPwd]         = useState(false);
  const [serverError, setServerError] = useState('');

  const { control, register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setServerError('');
    const { confirmPassword, ...payload } = data;
    const res = await registerUser(payload);
    if (res.success) {
      // Store email in sessionStorage — not in URL (avoids browser history / server log exposure)
      sessionStorage.setItem('pending_verify_email', data.email);
      router.push('/verify-otp');
    } else {
      setServerError(res.message || 'Registration failed. Please try again.');
    }
  };

  const onInvalid = (formErrors: FieldErrors<FormValues>) => {
    setServerError(getFirstFormError(formErrors));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-950 dark:text-primary-50">Create account</h1>
        <p className="text-gray-500 dark:text-primary-100/70 mt-1">Take the first step — it&apos;s a sign of strength</p>
      </div>

      {serverError && (
        <div role="alert" aria-live="polite" className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-200">
          {serverError}
        </div>
      )}

      <GoogleAuthButton mode="signup" onError={setServerError} />

      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-primary-100/45">
        <span className="h-px flex-1 bg-gray-200 dark:bg-primary-800" />
        <span>or create with email</span>
        <span className="h-px flex-1 bg-gray-200 dark:bg-primary-800" />
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            placeholder="Arjun"
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

        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <CountryPhoneInput
              label="Phone number"
              value={field.value}
              onChange={field.onChange}
              error={errors.phone?.message}
              hint="Choose a country code, then enter the local number."
              required
            />
          )}
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
          <Select label="Gender" required {...register('gender')}>
            <option value="male">Male</option>
          </Select>
          {errors.gender && <p className="text-sm text-red-500">{errors.gender.message}</p>}
        </div>

        <Input
          label="Password"
          type={showPwd ? 'text' : 'password'}
          placeholder="8+ chars with Aa and 1"
          autoComplete="new-password"
          leftIcon={<Lock className="w-4 h-4" />}
          rightIcon={
            <button type="button" onClick={() => setShowPwd((p) => !p)} className="hover:text-gray-600 dark:hover:text-primary-50">
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

      <p className="text-center text-sm text-gray-500 dark:text-primary-100/70">
        Already have an account?{' '}
        <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
