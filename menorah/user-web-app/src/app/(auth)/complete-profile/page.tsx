'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { consumeProfileCompletionReturnPath } from '@/lib/profileCompletion';
import { Button, CountryPhoneInput, Spinner } from '@/components/ui';

const firstApiError = (
  response: {
    message?: string;
    errors?: Array<{ message?: string; msg?: string }>;
  },
  fallback: string
) => response.errors?.map((item) => item.message || item.msg).find(Boolean)
  || response.message
  || fallback;

export default function CompleteProfilePage() {
  const { isAuthed, isLoading, logout, updateUser, user } = useAuth();
  const router = useRouter();
  const didSubmit = useRef(false);
  const [phone, setPhone] = useState(user?.phone || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isLoading || didSubmit.current) return;

    if (!isAuthed || !user) {
      router.replace('/login');
      return;
    }

    if (user.profileCompleted !== false) {
      router.replace(consumeProfileCompletionReturnPath());
    }
  }, [isAuthed, isLoading, router, user]);

  useEffect(() => {
    setPhone(user?.phone || '');
  }, [user?.phone]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const normalizedPhone = phone.trim();
    if (!/^\+[1-9]\d{1,14}$/.test(normalizedPhone)) {
      setError('Choose a country code and enter a valid phone number.');
      return;
    }

    setSaving(true);
    try {
      const response = await api.completeProfile(normalizedPhone);
      if (!response.success || !response.data?.user) {
        setError(firstApiError(response, 'Unable to complete your profile. Please try again.'));
        return;
      }

      const returnPath = consumeProfileCompletionReturnPath();
      didSubmit.current = true;
      updateUser(response.data.user);
      router.replace(returnPath);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !isAuthed || !user || user.profileCompleted !== false) {
    return (
      <div className="flex min-h-64 items-center justify-center" aria-label="Loading profile">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary-700 dark:text-primary-200">
            One last step
          </p>
          <h1 className="mt-1 text-2xl font-black text-gray-950 dark:text-primary-50">
            Complete your profile
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-primary-100/70">
            Add your account phone number to enable bookings and payments.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 dark:border-primary-800 dark:bg-primary-950">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary-700 dark:text-primary-200" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-500 dark:text-primary-100/65">Signed in as</p>
          <p className="truncate text-sm font-bold text-gray-900 dark:text-primary-50">{user.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="min-w-0 space-y-5">
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <CountryPhoneInput
            label="Account phone number"
            value={phone}
            onChange={setPhone}
            error={error}
            hint="Choose a country code, then enter your local number."
            required
          />

          <Button type="submit" size="lg" fullWidth loading={saving}>
            Save and continue
          </Button>
        </fieldset>
      </form>

      <p className="text-center text-xs leading-5 text-gray-400 dark:text-primary-100/50">
        This number is used for account and booking support. It is not shown publicly.
      </p>

      <button
        type="button"
        onClick={() => void logout()}
        className="mx-auto flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-900 dark:text-primary-100/65 dark:hover:text-primary-50"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}
