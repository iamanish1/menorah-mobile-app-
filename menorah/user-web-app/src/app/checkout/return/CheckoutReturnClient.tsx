'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, CircleAlert, CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button, Spinner } from '@/components/ui';
import type { CheckoutCallbackPayload } from '@/lib/checkoutCallback';

const EMPTY_CALLBACK: CheckoutCallbackPayload = {
  version: 1,
  issuedAt: 0,
  bookingId: null,
  kind: 'booking',
  orderId: null,
  paymentId: null,
  signature: null,
  subscriptionType: null,
};

const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function hasGatewayProof(callback: CheckoutCallbackPayload) {
  return Boolean(callback.orderId && callback.paymentId && callback.signature);
}

export default function CheckoutReturnClient({
  initialCallback,
}: {
  initialCallback: CheckoutCallbackPayload | null;
}) {
  const router = useRouter();
  const { isAuthed, isLoading, refreshUser } = useAuth();
  const [message, setMessage] = useState('Confirming your payment securely…');
  const [failure, setFailure] = useState<string | null>(null);
  const [callback] = useState<CheckoutCallbackPayload>(initialCallback ?? EMPTY_CALLBACK);
  const hasProof = hasGatewayProof(callback);

  // The signed fields are available to this page only through a short-lived,
  // HttpOnly callback cookie. The browser has already received the values in
  // the server-rendered response, so remove the cookie immediately afterwards
  // instead of leaving replayable gateway proof in the browser for its full
  // expiry window.
  useEffect(() => {
    if (!initialCallback) return;
    void fetch('/checkout/return/consume', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    });
  }, [initialCallback]);

  useEffect(() => {
    if (!hasProof || typeof window === 'undefined') return;

    const nativeWebView = (window as Window & {
      ReactNativeWebView?: { postMessage: (message: string) => void };
    }).ReactNativeWebView;

    nativeWebView?.postMessage(JSON.stringify({
      type: 'menorah:razorpay-callback',
      razorpay_order_id: callback.orderId,
      razorpay_payment_id: callback.paymentId,
      razorpay_signature: callback.signature,
    }));
  }, [callback.orderId, callback.paymentId, callback.signature, hasProof]);

  useEffect(() => {
    if (isLoading) return;

    let cancelled = false;
    const finish = (nextMessage: string, error?: string) => {
      if (cancelled) return;
      setMessage(nextMessage);
      setFailure(error ?? null);
    };

    const verifyBooking = async () => {
      if (!callback.bookingId) {
        finish('We could not identify this booking.', 'Return to your bookings and try the payment again.');
        return;
      }

      if (hasProof) {
        const verified = await api.verifyRazorpayPayment({
          bookingId: callback.bookingId,
          razorpay_order_id: callback.orderId!,
          razorpay_payment_id: callback.paymentId!,
          razorpay_signature: callback.signature!,
        });
        if (verified.success) {
          router.replace(`/bookings/${callback.bookingId}?payment=success`);
          return;
        }
      }

      // A webhook may be processing the same successful payment. Poll the
      // booking record briefly rather than treating a gateway redirect as
      // proof of payment.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const status = await api.getPaymentStatus(callback.bookingId);
        if (status.success && status.data?.paymentStatus === 'paid') {
          router.replace(`/bookings/${callback.bookingId}?payment=success`);
          return;
        }
        if (attempt < 4) await delay(1500);
      }

      finish(
        'Your payment is still being confirmed.',
        'Do not pay again yet. Check this booking in a moment, or contact support if it remains pending.'
      );
    };

    const verifySubscription = async () => {
      if (callback.subscriptionType && hasProof) {
        const verified = await api.verifySubscriptionPayment({
          subscriptionType: callback.subscriptionType,
          razorpay_order_id: callback.orderId!,
          razorpay_payment_id: callback.paymentId!,
          razorpay_signature: callback.signature!,
        });
        if (verified.success) {
          await refreshUser();
          router.replace('/subscription?payment=success');
          return;
        }
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const status = await api.getSubscriptionStatus();
        if (status.success && status.data?.isActive) {
          await refreshUser();
          router.replace('/subscription?payment=success');
          return;
        }
        if (attempt < 4) await delay(1500);
      }

      finish(
        'Your subscription is still being confirmed.',
        'Do not pay again yet. Check your subscription in a moment, or contact support if it remains inactive.'
      );
    };

    const verify = async () => {
      if (!isAuthed) {
        finish('Please sign in to finish confirming your payment.', 'Your payment has not been assumed to be complete.');
        return;
      }

      try {
        if (callback.kind === 'subscription') {
          await verifySubscription();
        } else {
          await verifyBooking();
        }
      } catch {
        finish(
          'We could not confirm this payment yet.',
          'Do not pay again. Open the relevant page below to check its status.'
        );
      }
    };

    void verify();
    return () => { cancelled = true; };
  }, [callback, hasProof, isAuthed, isLoading, refreshUser, router]);

  const recoveryHref = callback.kind === 'subscription'
    ? '/subscription'
    : callback.bookingId
      ? `/bookings/${callback.bookingId}`
      : '/bookings';

  return (
    <main className="page-container flex min-h-[70vh] max-w-md items-center justify-center">
      <section className="card w-full space-y-5 p-7 text-center">
        {failure ? (
          <CircleAlert className="mx-auto h-12 w-12 text-amber-500" aria-hidden="true" />
        ) : (
          <Spinner size="lg" className="mx-auto" />
        )}
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-950 dark:text-primary-50">
            {failure ? 'Payment confirmation pending' : 'Confirming payment'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-primary-100/70">{message}</p>
          {failure ? <p className="text-sm text-amber-700 dark:text-amber-200">{failure}</p> : null}
        </div>

        {failure ? (
          <div className="space-y-3">
            <Button fullWidth onClick={() => router.replace(recoveryHref)}>
              <CreditCard className="h-4 w-4" /> Check payment status
            </Button>
            {!isAuthed ? (
              <Button variant="secondary" fullWidth onClick={() => router.replace('/login')}>
                Sign in
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-primary-100/60">
            <CheckCircle className="h-4 w-4 text-primary-600" aria-hidden="true" />
            We only confirm a payment after secure server verification.
          </div>
        )}
      </section>
    </main>
  );
}
