'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Button, CountryPhoneInput, Input, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { cn } from '@/lib/utils';

// Backend validation rules:
// - phone must match /^\+[1-9]\d{1,14}$/ (E.164 format with country code, no spaces)
// - dateOfBirth must be ISO8601 (required)
// - gender must be exactly: 'male' | 'female' | 'other' | 'prefer-not-to-say' (hyphens)

const schema = z.object({
  firstName:       z.string().min(2, 'First name must be at least 2 characters'),
  lastName:        z.string().min(2, 'Last name must be at least 2 characters'),
  email:           z.string().email('Enter a valid email address'),
  phone:           z.string().regex(/^\+[1-9]\d{1,14}$/, 'Enter a phone number with country code, like +971501234567'),
  dateOfBirth:     z.string().min(1, 'Date of birth is required'),
  gender:          z.enum(['male', 'female', 'other', 'prefer-not-to-say'], {
    required_error: 'Please select a gender option',
    invalid_type_error: 'Please select a gender option',
  }),
  password:        z.string()
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
type StepField = keyof FormValues;

const steps: Array<{
  id: string;
  progress: number;
  label: string;
  title: string;
  subtitle: string;
  fields: StepField[];
  icon: typeof User;
}> = [
  {
    id: 'name',
    progress: 20,
    label: 'Step 1 of 6',
    title: 'What should we call you?',
    subtitle: 'Your counsellor and care team will see this name.',
    fields: ['firstName', 'lastName'],
    icon: User,
  },
  {
    id: 'email',
    progress: 40,
    label: 'Step 2 of 6',
    title: 'Where should we send your code?',
    subtitle: 'We will use this email for OTP verification and account recovery.',
    fields: ['email'],
    icon: Mail,
  },
  {
    id: 'phone',
    progress: 60,
    label: 'Step 3 of 6',
    title: 'Add your phone number',
    subtitle: 'Use your country code so your profile is ready for bookings.',
    fields: ['phone'],
    icon: Phone,
  },
  {
    id: 'basics',
    progress: 80,
    label: 'Step 4 of 6',
    title: 'A few basic details',
    subtitle: 'This helps us keep the experience age-appropriate.',
    fields: ['dateOfBirth', 'gender'],
    icon: Calendar,
  },
  {
    id: 'password',
    progress: 90,
    label: 'Step 5 of 6',
    title: 'Secure your account',
    subtitle: 'Choose a password that only you know.',
    fields: ['password', 'confirmPassword'],
    icon: Lock,
  },
  {
    id: 'review',
    progress: 100,
    label: 'Step 6 of 6',
    title: 'Ready to create your account',
    subtitle: 'We will send an OTP next so you can verify your email.',
    fields: [],
    icon: ShieldCheck,
  },
];

const genderOptions = [
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
  { value: 'other', label: 'Other' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say' },
];

const genderLabels: Record<FormValues['gender'], string> = {
  male: 'Men',
  female: 'Women',
  other: 'Other',
  'prefer-not-to-say': 'Prefer not to say',
};

const progressWidthClasses: Record<number, string> = {
  20: 'w-1/5',
  40: 'w-2/5',
  60: 'w-3/5',
  80: 'w-4/5',
  90: 'w-[90%]',
  100: 'w-full',
};

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
  const [stepIndex, setStepIndex]     = useState(0);
  const [direction, setDirection]     = useState<'forward' | 'back'>('forward');

  const {
    control,
    register,
    handleSubmit,
    trigger,
    getFieldState,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      gender: 'male',
      password: '',
      confirmPassword: '',
    },
    mode: 'onTouched',
  });

  const currentStep = steps[stepIndex];
  const watchedValues = watch();
  const CurrentIcon = currentStep.icon;
  const isReviewStep = currentStep.id === 'review';

  const stepIndexByField = useMemo(() => {
    return steps.reduce<Partial<Record<StepField, number>>>((acc, step, index) => {
      step.fields.forEach((field) => {
        acc[field] = index;
      });
      return acc;
    }, {});
  }, []);

  const goNext = async () => {
    setServerError('');
    const isValid = currentStep.fields.length === 0 || await trigger(currentStep.fields, { shouldFocus: true });

    if (!isValid) {
      const message = currentStep.fields
        .map((field) => getFieldState(field).error?.message)
        .find((value): value is string => typeof value === 'string');
      setServerError(message || 'Please fix the highlighted field before continuing.');
      return;
    }

    setDirection('forward');
    setStepIndex((value) => Math.min(value + 1, steps.length - 1));
  };

  const goBack = () => {
    setServerError('');
    setDirection('back');
    setStepIndex((value) => Math.max(value - 1, 0));
  };

  const onSubmit = async (data: FormValues) => {
    setServerError('');
    const { confirmPassword, ...payload } = data;
    const res = await registerUser(payload);
    if (res.success) {
      // Store email in sessionStorage — not in URL (avoids browser history / server log exposure)
      sessionStorage.setItem('pending_verify_email', data.email);
      sessionStorage.setItem('pending_verification_mode', 'registration');
      router.push('/verify-otp');
    } else {
      setServerError(res.message || 'Registration failed. Please try again.');
    }
  };

  const onInvalid = (formErrors: FieldErrors<FormValues>) => {
    const firstErrorField = (Object.keys(formErrors) as StepField[]).find((field) => formErrors[field]?.message);
    if (firstErrorField && typeof stepIndexByField[firstErrorField] === 'number') {
      setDirection('back');
      setStepIndex(stepIndexByField[firstErrorField] ?? 0);
    }
    setServerError(getFirstFormError(formErrors));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-950 dark:text-primary-50">Create account</h1>
        <p className="text-gray-500 dark:text-primary-100/70 mt-1">Take the first step — it&apos;s a sign of strength</p>
      </div>

      {serverError && (
        <div role="alert" aria-live="polite" className="space-y-1 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-200">
          <p>{serverError}</p>
          {serverError === 'User with this email or phone number already exists' && (
            <p>
              Already registered?{' '}
              <Link href="/login" className="font-bold underline underline-offset-2">
                Sign in instead
              </Link>
            </p>
          )}
        </div>
      )}

      <GoogleAuthButton mode="signup" onError={setServerError} />

      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-primary-100/45">
        <span className="h-px flex-1 bg-gray-200 dark:bg-primary-800" />
        <span>or create with email</span>
        <span className="h-px flex-1 bg-gray-200 dark:bg-primary-800" />
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
        <div className="rounded-[1.4rem] border border-primary-100 bg-primary-50/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-primary-800 dark:bg-primary-950/70">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-primary-700 shadow-sm dark:bg-primary-900 dark:text-primary-100">
                <CurrentIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary-700 dark:text-primary-100/70">
                  {currentStep.label}
                </p>
                <p className="text-sm font-black text-gray-950 dark:text-primary-50">
                  {currentStep.progress}% complete
                </p>
              </div>
            </div>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-white dark:bg-primary-900"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={currentStep.progress}
            aria-label="Create account progress"
          >
            <div
              className={cn(
                'h-full rounded-full bg-gradient-to-r from-primary-700 via-primary-500 to-primary-300 transition-all duration-500 ease-out',
                progressWidthClasses[currentStep.progress]
              )}
            />
          </div>
        </div>

        <section
          key={currentStep.id}
          className={cn(
            'min-h-[22rem] space-y-5 rounded-[1.4rem] border border-gray-100 bg-white p-4 shadow-sm dark:border-primary-800 dark:bg-primary-900/65',
            'animate-in fade-in duration-300',
            direction === 'forward' ? 'slide-in-from-right-4' : 'slide-in-from-left-4'
          )}
        >
          <div>
            <h2 className="text-xl font-black tracking-tight text-gray-950 dark:text-primary-50">{currentStep.title}</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-primary-100/70">{currentStep.subtitle}</p>
          </div>

          {currentStep.id === 'name' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="First name"
                placeholder="John"
                autoComplete="given-name"
                leftIcon={<User className="w-4 h-4" />}
                error={errors.firstName?.message}
                {...register('firstName')}
              />
              <Input
                label="Last name"
                placeholder="Doe"
                autoComplete="family-name"
                leftIcon={<User className="w-4 h-4" />}
                error={errors.lastName?.message}
                {...register('lastName')}
              />
            </div>
          )}

          {currentStep.id === 'email' && (
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              leftIcon={<Mail className="w-4 h-4" />}
              error={errors.email?.message}
              {...register('email')}
            />
          )}

          {currentStep.id === 'phone' && (
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
          )}

          {currentStep.id === 'basics' && (
            <div className="space-y-4">
              <Input
                label="Date of birth"
                type="date"
                required
                leftIcon={<Calendar className="w-4 h-4" />}
                error={errors.dateOfBirth?.message}
                {...register('dateOfBirth')}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-primary-100">
                    Gender <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] font-black uppercase tracking-[0.14em] text-primary-600 dark:text-primary-100/60">
                    Tap one
                  </span>
                </div>
                <Controller
                  name="gender"
                  control={control}
                  render={({ field }) => (
                    <SegmentedControl
                      ariaLabel="Gender"
                      value={field.value}
                      options={genderOptions}
                      onChange={field.onChange}
                      className="flex-wrap rounded-[1.35rem] p-1.5"
                    />
                  )}
                />
                {errors.gender?.message ? (
                  <p className="text-sm text-red-500">{errors.gender.message}</p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-primary-100/65">
                    Choose the option that best describes you.
                  </p>
                )}
              </div>
            </div>
          )}

          {currentStep.id === 'password' && (
            <div className="space-y-4">
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
                autoComplete="new-password"
                leftIcon={<Lock className="w-4 h-4" />}
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />
            </div>
          )}

          {isReviewStep && (
            <div className="space-y-3">
              {[
                { label: 'Name', value: `${watchedValues.firstName} ${watchedValues.lastName}`.trim() || 'Not set' },
                { label: 'Email', value: watchedValues.email || 'Not set' },
                { label: 'Phone', value: watchedValues.phone || 'Not set' },
                { label: 'Date of birth', value: watchedValues.dateOfBirth || 'Not set' },
                { label: 'Gender', value: genderLabels[watchedValues.gender] || 'Not set' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/70 px-4 py-3 dark:border-primary-800 dark:bg-primary-950/55">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-primary-700 dark:text-primary-100/70">{item.label}</span>
                  <span className="min-w-0 truncate text-sm font-bold text-gray-950 dark:text-primary-50">{item.value}</span>
                </div>
              ))}
              <div className="flex items-start gap-3 rounded-2xl bg-primary-600 px-4 py-3 text-white shadow-[0_14px_32px_-22px_rgba(45,122,92,0.8)]">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p className="text-sm font-semibold leading-6">After this, check your email for the OTP verification code.</p>
              </div>
            </div>
          )}
        </section>

        <div className="flex items-center gap-3">
          {stepIndex > 0 && (
            <Button type="button" variant="secondary" size="lg" onClick={goBack} className="shrink-0 px-4">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>
          )}
          {isReviewStep ? (
            <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
              Create Account
            </Button>
          ) : (
            <Button type="button" fullWidth size="lg" onClick={goNext}>
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
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
