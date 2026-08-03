import crypto from 'crypto';

export const CHECKOUT_CALLBACK_COOKIE = 'menorah_checkout_callback';
export const CHECKOUT_CALLBACK_MAX_AGE_SECONDS = 5 * 60;

export type CheckoutKind = 'booking' | 'subscription';

export type CheckoutCallbackPayload = {
  version: 1;
  issuedAt: number;
  bookingId: string | null;
  kind: CheckoutKind;
  orderId: string | null;
  paymentId: string | null;
  signature: string | null;
  subscriptionType: 'weekly' | 'monthly' | 'yearly' | null;
};

type CallbackFields = Record<string, unknown>;

const MAX_CALLBACK_FIELD_LENGTH = 512;
const MIN_CHECKOUT_CALLBACK_SECRET_LENGTH = 64;
const CALLBACK_SECRET_PLACEHOLDER = /(?:replace|placeholder|example|change(?:me)?|todo)/i;

const getString = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_CALLBACK_FIELD_LENGTH
    ? value
    : null;

const isSubscriptionType = (value: string | null): value is NonNullable<CheckoutCallbackPayload['subscriptionType']> =>
  value === 'weekly' || value === 'monthly' || value === 'yearly';

/**
 * Normalize only the fields the client-side API verification needs. Gateway
 * `status` fields are deliberately omitted: a redirect parameter is never
 * proof that a payment settled.
 */
export function normalizeCheckoutCallback(
  fields: CallbackFields,
  issuedAt = Date.now(),
): CheckoutCallbackPayload {
  const subscriptionType = getString(fields.subscriptionType);

  return {
    version: 1,
    issuedAt,
    bookingId: getString(fields.bookingId),
    kind: getString(fields.type) === 'subscription' ? 'subscription' : 'booking',
    orderId: getString(fields.razorpay_order_id) ?? getString(fields.order_id),
    paymentId: getString(fields.razorpay_payment_id),
    signature: getString(fields.razorpay_signature),
    subscriptionType: isSubscriptionType(subscriptionType) ? subscriptionType : null,
  };
}

export function hasGatewayProof(callback: CheckoutCallbackPayload | null) {
  return Boolean(callback?.orderId && callback.paymentId && callback.signature);
}

function getCheckoutCallbackSecret() {
  const configuredSecret = process.env.CHECKOUT_CALLBACK_SECRET?.trim();

  if (
    configuredSecret
    && configuredSecret.length >= MIN_CHECKOUT_CALLBACK_SECRET_LENGTH
    && !CALLBACK_SECRET_PLACEHOLDER.test(configuredSecret)
  ) {
    return configuredSecret;
  }

  // A fixed development-only key keeps local callback smoke tests convenient
  // without weakening a production deployment. Production must supply its own
  // independent secret; do not reuse a Razorpay or JWT secret in this web app.
  return process.env.NODE_ENV === 'production' ? null : 'menorah-local-checkout-callback-secret-change-me';
}

const sign = (encodedPayload: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');

const signaturesMatch = (received: string, expected: string) => {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
};

/**
 * Stores the gateway proof in a short-lived, HttpOnly, integrity-protected
 * cookie rather than moving it into a redirect URL (and therefore proxy logs,
 * browser history, and referrers).
 */
export function encodeCheckoutCallback(callback: CheckoutCallbackPayload) {
  const secret = getCheckoutCallbackSecret();
  if (!secret) return null;

  const encodedPayload = Buffer.from(JSON.stringify(callback)).toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function decodeCheckoutCallback(value: string | undefined | null, now = Date.now()) {
  const secret = getCheckoutCallbackSecret();
  if (!secret || !value) return null;

  const [encodedPayload, receivedSignature, ...extraParts] = value.split('.');
  if (!encodedPayload || !receivedSignature || extraParts.length > 0) return null;

  const expectedSignature = sign(encodedPayload, secret);
  if (!signaturesMatch(receivedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as CheckoutCallbackPayload;
    const issuedAt = Number(payload.issuedAt);
    const maxAgeMs = CHECKOUT_CALLBACK_MAX_AGE_SECONDS * 1000;

    if (
      payload.version !== 1
      || !Number.isFinite(issuedAt)
      || issuedAt > now + 30_000
      || now - issuedAt > maxAgeMs
      || (payload.kind !== 'booking' && payload.kind !== 'subscription')
      || (!isSubscriptionType(payload.subscriptionType) && payload.subscriptionType !== null)
    ) {
      return null;
    }

    return normalizeCheckoutCallback({
      bookingId: payload.bookingId,
      type: payload.kind,
      razorpay_order_id: payload.orderId,
      razorpay_payment_id: payload.paymentId,
      razorpay_signature: payload.signature,
      subscriptionType: payload.subscriptionType,
    }, issuedAt);
  } catch {
    return null;
  }
}
