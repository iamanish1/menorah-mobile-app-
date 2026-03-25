'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Video, MessageCircle, Headphones, ChevronRight, ArrowLeft, Calendar, Clock, User, CreditCard, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, Button, Spinner } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import type { SessionType } from '@/types';

type Step = 'session' | 'preferences' | 'review';

interface BookingDraft {
  counsellorId?: string;
  sessionType: SessionType;
  sessionDuration: number;
  scheduledAt: string;        // ISO8601 – required by backend
  genderPreference?: 'male' | 'female' | 'any';
  concerns?: string;
  goals?: string;
}

const sessionTypes = [
  { type: 'video' as SessionType,  label: 'Video Call',   icon: Video,         desc: 'Face-to-face video session' },
  { type: 'audio' as SessionType,  label: 'Audio Call',   icon: Headphones,    desc: 'Voice-only session' },
  { type: 'chat'  as SessionType,  label: 'Chat Session', icon: MessageCircle, desc: 'Text-based messaging' },
];

const durations = [30, 45, 60, 90];

/** Return a datetime-local string that is at least `minMinutes` from now */
function minDateTime(minMinutes = 60): string {
  const d = new Date(Date.now() + minMinutes * 60 * 1000);
  // datetime-local value format: "YYYY-MM-DDTHH:MM"
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function NewBookingForm() {
  const searchParams  = useSearchParams();
  const counsellorId  = searchParams.get('counsellorId') ?? undefined;
  const router        = useRouter();

  const [step, setStep]   = useState<Step>('session');
  const [draft, setDraft] = useState<BookingDraft>({
    counsellorId,
    sessionType:      'video',
    sessionDuration:  60,
    scheduledAt:      '',
    genderPreference: 'any',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const { data: counsellorData } = useQuery({
    queryKey: ['counsellor', counsellorId],
    queryFn:  () => api.getCounsellor(counsellorId!),
    enabled:  !!counsellorId,
  });
  const counsellor = counsellorData?.data?.counsellor;

  const set = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleBook = async () => {
    if (!draft.scheduledAt) {
      setError('Please select a date and time for your session.');
      return;
    }
    setLoading(true);
    setError('');
    const res = await api.createBooking({
      counsellorId:    draft.counsellorId,
      sessionType:     draft.sessionType,
      sessionDuration: draft.sessionDuration,
      scheduledAt:     new Date(draft.scheduledAt).toISOString(),
      preferences:     { gender: draft.genderPreference, sessionType: draft.sessionType },
      concerns:        draft.concerns,
      goals:           draft.goals ? [draft.goals] : undefined,
    });
    setLoading(false);
    if (res.success && res.data?.booking) {
      router.push(`/bookings/payment?bookingId=${res.data.booking.id}`);
    } else {
      setError(res.message || 'Failed to create booking. Please try again.');
    }
  };

  const steps: { id: Step; label: string }[] = [
    { id: 'session',     label: 'Session Type' },
    { id: 'preferences', label: 'Preferences'  },
    { id: 'review',      label: 'Review'        },
  ];
  const stepIdx = steps.findIndex((s) => s.id === step);

  // Validate step 1 before proceeding
  const canProceedFromSession = !!draft.scheduledAt;

  return (
    <div className="page-container max-w-2xl">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Book a Session</h1>

      {/* Step indicator */}
      <div className="flex items-center mb-8">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
              ${i < stepIdx ? 'bg-primary-600 text-white'
                : i === stepIdx ? 'bg-primary-600 text-white ring-4 ring-primary-100'
                : 'bg-gray-200 text-gray-500'}`}>
              {i + 1}
            </div>
            <span className={`ml-2 text-xs font-medium ${i <= stepIdx ? 'text-primary-600' : 'text-gray-400'}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-3 ${i < stepIdx ? 'bg-primary-600' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Counsellor banner */}
      {counsellor && (
        <div className="card p-4 flex items-center gap-3 mb-6">
          <Avatar src={counsellor.profileImage} name={counsellor.name} size="md" />
          <div className="flex-1">
            <p className="font-medium text-gray-900">{counsellor.name}</p>
            <p className="text-sm text-primary-600">{counsellor.specialization}</p>
          </div>
          <p className="font-semibold text-gray-900 shrink-0">
            {formatCurrency(counsellor.hourlyRate, counsellor.currency)}/hr
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* ── Step 1: Session type, duration & date/time ── */}
      {step === 'session' && (
        <div className="space-y-6">
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Choose session type</h2>
            {sessionTypes.map(({ type, label, icon: Icon, desc }) => (
              <button
                key={type}
                onClick={() => set('sessionType', type)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors text-left
                  ${draft.sessionType === type
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                  ${draft.sessionType === type ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{label}</p>
                  <p className="text-sm text-gray-500">{desc}</p>
                </div>
                {draft.sessionType === type && <ChevronRight className="w-5 h-5 text-primary-500" />}
              </button>
            ))}
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Session duration</h2>
            <div className="grid grid-cols-4 gap-2">
              {durations.map((d) => (
                <button
                  key={d}
                  onClick={() => set('sessionDuration', d)}
                  className={`py-3 rounded-xl text-sm font-medium border-2 transition-colors
                    ${draft.sessionDuration === d
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary-600" />
              Date &amp; Time <span className="text-red-500 text-sm font-normal">*required</span>
            </h2>
            <p className="text-xs text-gray-500">Select when you'd like your session (minimum 1 hour from now)</p>
            <input
              type="datetime-local"
              min={minDateTime(60)}
              value={draft.scheduledAt}
              onChange={(e) => set('scheduledAt', e.target.value)}
              className="input-field"
            />
            {!draft.scheduledAt && (
              <p className="text-xs text-amber-600">Please choose a date and time to continue.</p>
            )}
          </div>

          <Button
            fullWidth size="lg"
            disabled={!canProceedFromSession}
            onClick={() => setStep('preferences')}
          >
            Continue <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* ── Step 2: Preferences ── */}
      {step === 'preferences' && (
        <div className="space-y-6">
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Your preferences</h2>

            {!counsellorId && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Counsellor gender preference</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['any', 'male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => set('genderPreference', g)}
                      className={`py-2.5 rounded-xl text-sm font-medium border-2 capitalize transition-colors
                        ${draft.genderPreference === g
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                    >
                      {g === 'any' ? 'No preference' : g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">What brings you here? (optional)</label>
              <textarea
                value={draft.concerns ?? ''}
                onChange={(e) => set('concerns', e.target.value)}
                rows={3}
                placeholder="Briefly describe what you'd like to work on…"
                className="input-field resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Your goals (optional)</label>
              <input
                value={draft.goals ?? ''}
                onChange={(e) => set('goals', e.target.value)}
                placeholder="e.g., Reduce anxiety, improve relationships…"
                className="input-field"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setStep('session')}>Back</Button>
            <Button fullWidth onClick={() => setStep('review')}>
              Continue <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review ── */}
      {step === 'review' && (
        <div className="space-y-4">
          {/* Session details card */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Session summary</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {/* Session type */}
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                  {draft.sessionType === 'video' ? <Video className="w-4 h-4 text-primary-600" />
                    : draft.sessionType === 'audio' ? <Headphones className="w-4 h-4 text-primary-600" />
                    : <MessageCircle className="w-4 h-4 text-primary-600" />}
                </div>
                <span className="text-sm text-gray-500 flex-1">Session type</span>
                <span className="text-sm font-medium text-gray-900 capitalize">{draft.sessionType}</span>
              </div>
              {/* Duration */}
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-primary-600" />
                </div>
                <span className="text-sm text-gray-500 flex-1">Duration</span>
                <span className="text-sm font-medium text-gray-900">{draft.sessionDuration} minutes</span>
              </div>
              {/* Date & Time */}
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-primary-600" />
                </div>
                <span className="text-sm text-gray-500 flex-1">Date &amp; Time</span>
                <span className="text-sm font-medium text-gray-900">
                  {draft.scheduledAt
                    ? new Date(draft.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                    : 'Not set'}
                </span>
              </div>
              {/* Counsellor */}
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary-600" />
                </div>
                <span className="text-sm text-gray-500 flex-1">Counsellor</span>
                <span className="text-sm font-medium text-gray-900">{counsellor?.name ?? 'Any available'}</span>
              </div>
            </div>

            {/* Price breakdown */}
            <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-2">
              {counsellor && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{formatCurrency(counsellor.hourlyRate, counsellor.currency)}/hr × {draft.sessionDuration} min</span>
                  <span>{formatCurrency((counsellor.hourlyRate / 60) * draft.sessionDuration, counsellor.currency)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700">Total due</span>
                </div>
                <span className="text-lg font-bold text-primary-700">
                  {counsellor
                    ? formatCurrency((counsellor.hourlyRate / 60) * draft.sessionDuration, counsellor.currency)
                    : 'TBD'}
                </span>
              </div>
            </div>
          </div>

          {/* Trust / cancellation note */}
          <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <ShieldCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <p className="text-sm text-green-700">
              Payment is collected on the next step. Cancel for free up to 24 hours before your session.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setStep('preferences')}>Back</Button>
            <Button fullWidth size="lg" loading={loading} onClick={handleBook}>
              Confirm &amp; Pay
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewBookingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>}>
      <NewBookingForm />
    </Suspense>
  );
}
