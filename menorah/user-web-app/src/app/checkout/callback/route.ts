import { NextResponse } from 'next/server';
import {
  CHECKOUT_CALLBACK_COOKIE,
  CHECKOUT_CALLBACK_MAX_AGE_SECONDS,
  encodeCheckoutCallback,
  normalizeCheckoutCallback,
} from '@/lib/checkoutCallback';

const PAYMENT_CALLBACK_FIELDS = [
  'type',
  'bookingId',
  'subscriptionType',
  'order_id',
  'razorpay_order_id',
  'razorpay_payment_id',
  'razorpay_signature',
] as const;

export const runtime = 'nodejs';

const buildCallbackPayload = (request: Request, body?: FormData) => {
  const requestUrl = new URL(request.url);
  const fields: Record<string, unknown> = {};

  for (const key of PAYMENT_CALLBACK_FIELDS) {
    // A Razorpay form POST is preferred because its signed fields are not in
    // the incoming URL. If a gateway uses a GET redirect instead, the Caddy
    // callback matcher excludes that one request from access logging too.
    fields[key] = requestUrl.searchParams.get(key);
    const formValue = body?.get(key);
    if (formValue !== null && formValue !== undefined) fields[key] = formValue;
  }

  return normalizeCheckoutCallback(fields);
};

const redirectToReturnPage = (request: Request, body?: FormData) => {
  const requestUrl = new URL(request.url);
  const response = NextResponse.redirect(new URL('/checkout/return', requestUrl.origin), { status: 303 });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');

  const callbackCookie = encodeCheckoutCallback(buildCallbackPayload(request, body));
  if (!callbackCookie) {
    // Do not put signed gateway values into a fallback URL if this independent
    // server secret is missing. The webhook can still reconcile a paid order,
    // and the user receives the generic status screen instead of a leaked
    // proof in logs/history.
    console.error('CHECKOUT_CALLBACK_SECRET is required to relay a payment callback in production');
    return response;
  }

  response.cookies.set({
    name: CHECKOUT_CALLBACK_COOKIE,
    value: callbackCookie,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/checkout/return',
    maxAge: CHECKOUT_CALLBACK_MAX_AGE_SECONDS,
  });

  return response;
};

// Razorpay can deliver a browser checkout callback with either a GET redirect
// or a form POST. Preserve only the expected payment fields, then hand the
// result to the client-side return page where the authenticated API verifies
// the gateway signature before treating it as a completed payment.
export async function GET(request: Request) {
  return redirectToReturnPage(request);
}

export async function POST(request: Request) {
  let body: FormData | undefined;

  try {
    body = await request.formData();
  } catch {
    // A malformed callback still reaches the return page, which can show a
    // recoverable confirmation state instead of leaving the user on a blank
    // gateway response.
  }

  return redirectToReturnPage(request, body);
}
