'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Video, MessageCircle, Headphones, ChevronRight, ArrowLeft, Calendar, Clock, User, CreditCard, ShieldCheck, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, Button, SegmentedControl, Spinner } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { getCspNonce } from '@/lib/cspNonce';
import type { SessionType } from '@/types';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.nonce = getCspNonce() || '';
    script.src    = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

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

type SlotStatus = 'available' | 'booked' | 'pending' | 'unavailable' | 'past';
interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  status: SlotStatus;
  isSelectable: boolean;
  label: string;
  statusLabel: string;
}

interface AvailabilityDay {
  date: string;
  dayOfWeek: string;
  timezone: string;
  sessionDuration: number;
  isAvailable: boolean;
  workingHours?: { start: string; end: string };
  slots: AvailabilitySlot[];
}

const genderPreferenceOptions: { value: NonNullable<BookingDraft['genderPreference']>; label: string }[] = [
  { value: 'any', label: 'No preference' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const sessionTypes = [
  { type: 'video' as SessionType, label: 'Video Call', icon: Video, desc: 'Face-to-face video session' },
];

const durations = [30, 45, 60, 90];

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
type AvailabilitySchedule = Record<string, { start: string; end: string; isAvailable: boolean }>;
const pad = (n: number) => String(n).padStart(2, '0');

/** Return a datetime-local string that is at least `minMinutes` from now */
function minDateTime(minMinutes = 60): string {
  const d = new Date(Date.now() + minMinutes * 60 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function minutesToTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function formatTimeLabel(time: string): string {
  return new Date(`2000-01-01T${time}`).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildDateOptions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    return {
      value: toDateValue(date),
      eyebrow: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'short' }),
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      day: date.toLocaleDateString(undefined, { weekday: 'long' }),
    };
  });
}

function getScheduleForDate(dateValue: string, availability?: AvailabilitySchedule) {
  if (!availability) return undefined;
  const date = new Date(`${dateValue}T00:00`);
  return availability[DAYS[date.getDay()]];
}

function buildTimeOptions(dateValue: string, availability?: AvailabilitySchedule) {
  const schedule = getScheduleForDate(dateValue, availability);
  if (availability && (!schedule || !schedule.isAvailable)) return [];

  const start = parseTimeToMinutes(schedule?.start ?? '09:00');
  const end = parseTimeToMinutes(schedule?.end ?? '20:00');
  const earliest = Date.now() + 60 * 60 * 1000;

  return Array.from({ length: Math.max(0, Math.floor((end - start) / 30) + 1) }, (_, index) => {
    const value = minutesToTime(start + index * 30);
    return {
      value,
      label: formatTimeLabel(value),
      disabled: new Date(`${dateValue}T${value}`).getTime() < earliest,
    };
  });
}

function fallbackSlotLabel(status: SlotStatus) {
  return {
    available: 'Available',
    booked: 'Booked',
    pending: 'Temporarily held',
    unavailable: 'Unavailable',
    past: 'Past',
  }[status];
}

/** Validate a datetime-local value against the counsellor's availability schedule */
function checkSlotAvailability(scheduledAt: string, availability: AvailabilitySchedule | undefined): string | null {
  if (!scheduledAt || !availability) return null;
  const date = new Date(scheduledAt);
  const day = DAYS[date.getDay()];
  const sched = availability[day];
  if (!sched || !sched.isAvailable) {
    return `Counsellor is not available on ${day.charAt(0).toUpperCase() + day.slice(1)}s. Please pick another day.`;
  }
  if (sched.start && sched.end) {
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    const time = `${hh}:${mm}`;
    if (time < sched.start || time > sched.end) {
      return `Counsellor is available ${sched.start}–${sched.end} on ${day.charAt(0).toUpperCase() + day.slice(1)}s. Please pick a time within those hours.`;
    }
  }
  return null;
}

function NewBookingForm() {
  const searchParams  = useSearchParams();
  const counsellorId  = searchParams.get('counsellorId') ?? undefined;
  const router        = useRouter();

  const [step, setStep]   = useState<Step>('session');
  const [selectedDate, setSelectedDate] = useState(() => minDateTime(60).slice(0, 10));
  const [draft, setDraft] = useState<BookingDraft>({
    counsellorId,
    sessionType:      'video',
    sessionDuration:  60,
    scheduledAt:      '',
    genderPreference: 'any',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);

  const { data: counsellorData } = useQuery({
    queryKey: ['counsellor', counsellorId],
    queryFn:  () => api.getCounsellor(counsellorId!),
    enabled:  !!counsellorId,
  });
  const counsellor = counsellorData?.data?.counsellor;

  const { data: availabilityData, isFetching: availabilityLoading, refetch: refetchAvailability } = useQuery({
    queryKey: ['counsellor-availability', counsellorId, selectedDate, draft.sessionDuration],
    queryFn: () => api.getCounsellorAvailability(counsellorId!, selectedDate, selectedDate, draft.sessionDuration),
    enabled: !!counsellorId,
  });
  const availabilityDay = availabilityData?.data?.availability?.[0] as AvailabilityDay | undefined;

  const set = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dateOptions = useMemo(() => buildDateOptions(), []);
  const timeOptions = useMemo(() => {
    if (counsellorId && availabilityDay) return availabilityDay.slots;
    return buildTimeOptions(selectedDate, counsellor?.availability).map((option) => ({
      startTime: option.value,
      endTime: '',
      startsAt: `${selectedDate}T${option.value}`,
      endsAt: '',
      status: option.disabled ? 'past' as SlotStatus : 'available' as SlotStatus,
      isSelectable: !option.disabled,
      label: option.label,
      statusLabel: option.disabled ? 'Past' : 'Available',
    }));
  }, [availabilityDay, counsellor?.availability, counsellorId, selectedDate]);
  const selectedTime = timeOptions.find((slot) => slot.startsAt === draft.scheduledAt)?.startTime
    || (draft.scheduledAt.startsWith(`${selectedDate}T`) ? draft.scheduledAt.slice(11, 16) : '');
  const selectedDateOption = dateOptions.find((option) => option.value === selectedDate);
  const selectedSlot = timeOptions.find((slot) => slot.startsAt === draft.scheduledAt);
  const selectedDateTimeLabel = draft.scheduledAt
    ? new Date(draft.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;
  const estimatedTotal = counsellor ? (counsellor.hourlyRate / 60) * draft.sessionDuration : null;

  const selectDate = (dateValue: string) => {
    setSelectedDate(dateValue);
    set('scheduledAt', '');
  };

  const selectTime = (slot: AvailabilitySlot) => {
    if (!slot.isSelectable) return;
    set('scheduledAt', counsellorId ? slot.startsAt : `${selectedDate}T${slot.startTime}`);
  };

  const handleBook = async () => {
    if (!draft.scheduledAt) {
      setError('Please select a date and time for your session.');
      return;
    }
    setLoading(true);
    setError('');

    if (counsellorId) {
      const freshAvailability = await refetchAvailability();
      const freshDay = freshAvailability.data?.data?.availability?.[0] as AvailabilityDay | undefined;
      const freshSlot = freshDay?.slots.find((slot) => slot.startsAt === draft.scheduledAt);
      if (!freshSlot?.isSelectable) {
        setLoading(false);
        setStep('session');
        setError('This time slot was just booked by someone else. Please choose another available slot.');
        return;
      }
    }

    // Step 1: Create the booking record
    const bookingRes = await api.createBooking({
      counsellorId:    draft.counsellorId,
      sessionType:     draft.sessionType,
      sessionDuration: draft.sessionDuration,
      scheduledAt:     new Date(draft.scheduledAt).toISOString(),
      serviceCode:     draft.counsellorId ? undefined : `unassigned-${draft.sessionDuration}`,
      preferences:     { gender: draft.genderPreference, sessionType: draft.sessionType },
      concerns:        draft.concerns,
      goals:           draft.goals ? [draft.goals] : undefined,
    });

    if (!bookingRes.success || !bookingRes.data?.booking) {
      setLoading(false);
      const friendlySlotError = /slot|booked|pending/i.test(bookingRes.message || '')
        ? 'This time slot was just booked by someone else. Please choose another available slot.'
        : bookingRes.message || 'Failed to create booking. Please try again.';
      setStep('session');
      setError(friendlySlotError);
      await refetchAvailability();
      return;
    }

    const booking = bookingRes.data.booking;

    // Subscription and promo bookings are already paid, no Razorpay needed.
    if (booking.isSubscriptionBooking || booking.paymentMethod === 'promo' || booking.paymentStatus === 'paid') {
      setLoading(false);
      setSuccess(true);
      return;
    }

    // Step 2: Load Razorpay SDK
    const loaded = await loadRazorpay();
    if (!loaded) {
      setLoading(false);
      setError('Failed to load the payment gateway. The unpaid hold will expire automatically.');
      return;
    }

    // Step 3: Create Razorpay order for this booking
    const sessionRes = await api.createCheckoutSession(booking.id);
    if (!sessionRes.success || !sessionRes.data?.orderId) {
      setLoading(false);
      if (/expired|slot/i.test(sessionRes.message || '')) {
        setStep('session');
        setError('This slot expired while waiting for payment. Please choose another available time.');
        await refetchAvailability();
      } else {
        setError(sessionRes.message || 'Failed to initialise payment. Please try again.');
      }
      return;
    }

    const { orderId, amount, currency } = sessionRes.data;
    setLoading(false);

    // Step 4: Open Razorpay modal — payment happens here
    const rzp = new window.Razorpay({
      key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
      amount:      amount ?? 0,
      currency:    currency ?? 'INR',
      order_id:    orderId,
      name:        'Menorah Health',
      description: 'Counselling Session',
      theme:       { color: '#3d9470' },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        setLoading(true);
        const verify = await api.verifyRazorpayPayment({ ...response, bookingId: booking.id });
        setLoading(false);
        if (verify.success) {
          setSuccess(true);
        } else {
          if (/expired|slot/i.test(verify.message || '')) {
            setStep('session');
            setError('This slot expired while waiting for payment. Please choose another available time.');
            await refetchAvailability();
          } else {
            setError(verify.message || 'Payment verification failed. Please contact support.');
          }
        }
      },
      modal: {
        ondismiss: () => {
          setError('Payment was not completed. The unpaid booking hold will expire automatically.');
        },
      },
    });
    rzp.open();
  };

  const steps: { id: Step; label: string }[] = [
    { id: 'session',     label: 'Session Type' },
    { id: 'preferences', label: 'Preferences'  },
    { id: 'review',      label: 'Review'        },
  ];
  const stepIdx = steps.findIndex((s) => s.id === step);

  const availabilityWarning = counsellor?.availability
    ? checkSlotAvailability(draft.scheduledAt, counsellor.availability)
    : null;

  // Validate step 1 before proceeding
  const canProceedFromSession = !!draft.scheduledAt && !availabilityWarning && (!counsellorId || selectedSlot?.isSelectable);

  if (success) {
    return (
      <div className="page-container max-w-md text-center space-y-6 pt-16">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mx-auto">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Booking Confirmed!</h1>
          <p className="text-gray-500 mt-2">Your session has been booked and confirmed. A counsellor will be assigned shortly.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Button fullWidth onClick={() => router.push('/bookings')}>View My Bookings</Button>
          <Button variant="secondary" fullWidth onClick={() => router.push('/discover')}>Discover More</Button>
        </div>
      </div>
    );
  }

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
          <div className="card p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shrink-0">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Video Call</p>
              <p className="text-sm text-gray-500">Face-to-face video session</p>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Session duration</h2>
            <SegmentedControl
              ariaLabel="Session duration"
              value={String(draft.sessionDuration)}
              options={durations.map((duration) => ({ value: String(duration), label: `${duration} min` }))}
              onChange={(value) => {
                set('sessionDuration', Number(value));
                set('scheduledAt', '');
              }}
            />
          </div>

          {/* Counsellor availability summary */}
          {counsellor?.availability && (
            <div className="card p-5 space-y-2">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary-600" />
                Counsellor's available hours
              </h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1">
                {DAYS.map((day) => {
                  const sched = counsellor.availability?.[day];
                  return (
                    <div key={day} className="flex items-center justify-between text-xs py-0.5">
                      <span className={`capitalize font-medium ${sched?.isAvailable ? 'text-gray-700' : 'text-gray-400'}`}>
                        {day}
                      </span>
                      <span className={sched?.isAvailable ? 'text-gray-600' : 'text-gray-400'}>
                        {sched?.isAvailable ? `${sched.start} – ${sched.end}` : 'Unavailable'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary-600" />
              Date &amp; Time <span className="text-red-500 text-sm font-normal">*required</span>
            </h2>
            <p className="text-xs text-gray-500">Select when you'd like your session (minimum 1 hour from now)</p>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-primary-100/55">Choose day</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {dateOptions.map((option) => {
                    const optionTimes = buildTimeOptions(option.value, counsellor?.availability);
                    const disabled = optionTimes.every((time) => time.disabled);
                    const active = selectedDate === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={disabled}
                        aria-pressed={active}
                        onClick={() => selectDate(option.value)}
                        className={`min-h-[4.75rem] rounded-2xl border px-3 py-3 text-left transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45
                          ${active
                            ? 'border-primary-500 bg-primary-50 text-primary-800 shadow-sm dark:border-primary-300 dark:bg-primary-300 dark:text-[#06110b]'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50/50 dark:border-primary-800 dark:bg-[#07110b] dark:text-primary-100 dark:hover:border-primary-500 dark:hover:bg-[#102016]'}`}
                      >
                        <span className="block text-[11px] font-black uppercase tracking-wide opacity-70">{option.eyebrow}</span>
                        <span className="mt-1 block text-base font-black">{option.label}</span>
                        <span className="mt-0.5 block text-xs font-semibold opacity-65">{option.day}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-primary-100/55">Choose time</p>
                  {selectedDateOption && (
                    <span className="text-xs font-semibold text-gray-500 dark:text-primary-100/65">{selectedDateOption.label}</span>
                  )}
                </div>
                {timeOptions.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {timeOptions.map((option) => {
                      const active = selectedTime === option.startTime && draft.scheduledAt === option.startsAt;
                      const disabled = !option.isSelectable;

                      return (
                        <button
                          key={option.startsAt}
                          type="button"
                          disabled={disabled}
                          aria-pressed={active}
                          title={option.statusLabel || fallbackSlotLabel(option.status)}
                          onClick={() => selectTime(option)}
                          className={`min-h-[3.75rem] rounded-2xl border px-3 py-2 text-sm font-black transition-all duration-150 disabled:cursor-not-allowed
                            ${active
                              ? 'border-primary-500 bg-primary-600 text-white shadow-sm dark:border-primary-300 dark:bg-primary-300 dark:text-[#06110b]'
                              : option.status === 'booked'
                                ? 'border-red-100 bg-red-50 text-red-400 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
                              : option.status === 'pending'
                                ? 'border-amber-100 bg-amber-50 text-amber-500 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
                              : option.status === 'past' || option.status === 'unavailable'
                                ? 'border-gray-200 bg-gray-50 text-gray-400 dark:border-primary-900 dark:bg-[#07110b] dark:text-primary-100/35'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50/50 dark:border-primary-800 dark:bg-[#07110b] dark:text-primary-100 dark:hover:border-primary-500 dark:hover:bg-[#102016]'}`}
                        >
                          <span className="block">{option.label}</span>
                          {option.status !== 'available' && (
                            <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide opacity-80">
                              {option.statusLabel || fallbackSlotLabel(option.status)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : availabilityLoading ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-sm font-semibold text-gray-500 dark:border-primary-800 dark:bg-[#07110b] dark:text-primary-100/65">
                    Loading available times...
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-sm font-semibold text-gray-500 dark:border-primary-800 dark:bg-[#07110b] dark:text-primary-100/65">
                    No available times for this day. Choose another day.
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 dark:border-primary-800 dark:bg-[#102016]">
                <Clock className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-200" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500 dark:text-primary-100/65">Selected session time</p>
                  <p className="truncate text-sm font-black text-gray-950 dark:text-primary-50">
                    {selectedDateTimeLabel ?? 'Pick a day and time'}
                  </p>
                </div>
              </div>
            </div>
            {!draft.scheduledAt && (
              <p className="text-xs text-amber-600">Please choose a date and time to continue.</p>
            )}
            {availabilityWarning && (
              <p className="text-xs text-red-600 font-medium">{availabilityWarning}</p>
            )}
            {draft.scheduledAt && counsellorId && !selectedSlot?.isSelectable && (
              <p className="text-xs text-red-600 font-medium">
                This selected time is no longer available. Please choose another slot.
              </p>
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
                <SegmentedControl
                  ariaLabel="Counsellor gender preference"
                  value={draft.genderPreference ?? 'any'}
                  options={genderPreferenceOptions}
                  onChange={(value) => set('genderPreference', value as NonNullable<BookingDraft['genderPreference']>)}
                />
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
                  <span>{formatCurrency(estimatedTotal || 0, counsellor.currency)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700">Total due</span>
                </div>
                <span className="text-lg font-bold text-primary-700">
                  {estimatedTotal !== null
                    ? formatCurrency(estimatedTotal, counsellor?.currency || 'INR')
                    : 'Confirmed by server at checkout'}
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
              <CreditCard className="w-4 h-4" /> Confirm &amp; Pay
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
