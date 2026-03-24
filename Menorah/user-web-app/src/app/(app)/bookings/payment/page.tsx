'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Shield, CheckCircle, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src    = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function PaymentForm() {
  const searchParams = useSearchParams();
  const bookingId    = searchParams.get('bookingId') ?? '';
  const router       = useRouter();

  const [method, setMethod]   = useState<'razorpay' | 'stripe'>('razorpay');
  const [paying, setPaying]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn:  () => api.getBooking(bookingId),
    enabled:  !!bookingId,
  });

  const booking = data?.data?.booking;

  const handleRazorpay = async () => {
    if (!bookingId) { setError('Invalid booking. Please go back and try again.'); return; }
    setPaying(true);
    setError('');

    const loaded = await loadRazorpay();
    if (!loaded) { setError('Failed to load payment gateway. Please try again.'); setPaying(false); return; }

    const sessionRes = await api.createCheckoutSession(bookingId, 'razorpay');
    if (!sessionRes.success || !sessionRes.data?.orderId) {
      setError(sessionRes.message || 'Failed to create payment session');
      setPaying(false);
      return;
    }

    const { orderId, amount, currency } = sessionRes.data;

    const rzp = new window.Razorpay({
      key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
      amount:      amount ?? 0,   // backend already returns smallest currency unit (paise)
      currency:    currency ?? 'INR',
      order_id:    orderId,
      name:        'Menorah Health',
      description: 'Counselling Session',
      theme:       { color: '#3d9470' },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verify = await api.verifyRazorpayPayment({ ...response, bookingId });
        setPaying(false);
        if (verify.success) {
          setSuccess(true);
        } else {
          setError(verify.message || 'Payment verification failed');
        }
      },
      modal: { ondismiss: () => setPaying(false) },
    });
    rzp.open();
  };

  const handleStripe = async () => {
    if (!bookingId) { setError('Invalid booking.'); return; }
    setPaying(true);
    setError('');
    const res = await api.createCheckoutSession(bookingId, 'stripe');
    if (res.success && res.data?.sessionUrl) {
      window.location.href = res.data.sessionUrl;
    } else {
      setError(res.message || 'Failed to create Stripe session');
      setPaying(false);
    }
  };

  if (success) {
    return (
      <div className="page-container max-w-md text-center space-y-6 pt-16">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mx-auto">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Booking Confirmed!</h1>
          <p className="text-gray-500 mt-2">Your session has been booked. A counsellor will be assigned shortly.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Button fullWidth onClick={() => router.push('/bookings')}>View My Bookings</Button>
          <Button variant="secondary" fullWidth onClick={() => router.push('/discover')}>Discover More</Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="page-container max-w-md">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Complete Payment</h1>

      {booking && (
        <div className="card p-5 mb-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Order Summary</h2>
          {[
            { label: 'Session type',  value: booking.sessionType },
            { label: 'Duration',      value: `${booking.sessionDuration} min` },
            { label: 'Counsellor',    value: booking.counsellorName ?? 'To be assigned' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="font-medium capitalize">{value}</span>
            </div>
          ))}
          <div className="border-t border-gray-100 pt-3 flex justify-between">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-bold text-lg text-primary-600">
              {booking.amount ? formatCurrency(booking.amount, booking.currency) : 'TBD'}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      <div className="card p-5 mb-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Payment method</h2>
        {[
          { id: 'razorpay' as const, label: 'Razorpay',  desc: 'UPI, Cards, Net Banking, Wallets', flag: '🇮🇳' },
          { id: 'stripe'   as const, label: 'Stripe',    desc: 'International cards (Visa, Mastercard)', flag: '🌍' },
        ].map(({ id, label, desc, flag }) => (
          <button
            key={id}
            onClick={() => setMethod(id)}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors
              ${method === id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <span className="text-2xl">{flag}</span>
            <div className="flex-1">
              <p className="font-medium text-gray-900">{label}</p>
              <p className="text-sm text-gray-500">{desc}</p>
            </div>
            {method === id && (
              <div className="ml-auto w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
            )}
          </button>
        ))}
      </div>

      <Button
        fullWidth size="lg" loading={paying}
        onClick={method === 'razorpay' ? handleRazorpay : handleStripe}
      >
        <CreditCard className="w-5 h-5" />
        Pay Now
      </Button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-4">
        <Shield className="w-3.5 h-3.5" />
        Secured by {method === 'razorpay' ? 'Razorpay' : 'Stripe'}. Your payment is safe.
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>}>
      <PaymentForm />
    </Suspense>
  );
}
