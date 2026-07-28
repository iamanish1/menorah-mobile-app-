export type RazorpayPaymentCallback = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type RazorpayPaymentCallbackMessage = RazorpayPaymentCallback & {
  type: 'menorah:razorpay-callback';
};

const nonEmptyValue = (value: string | null | undefined) => value?.trim() || null;

const callbackFromSearchParams = (
  searchParams: URLSearchParams,
  expectedOrderId: string,
): RazorpayPaymentCallback | null => {
  const razorpay_order_id = nonEmptyValue(searchParams.get('razorpay_order_id'));
  const razorpay_payment_id = nonEmptyValue(searchParams.get('razorpay_payment_id'));
  const razorpay_signature = nonEmptyValue(searchParams.get('razorpay_signature'));

  if (
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature ||
    razorpay_order_id !== expectedOrderId
  ) {
    return null;
  }

  return { razorpay_order_id, razorpay_payment_id, razorpay_signature };
};

/**
 * Razorpay may deliver a WebView result through the callback URL. The client
 * treats that URL only as a transport for the signed fields: the backend still
 * verifies the signature, amount, owner and captured payment state before it
 * activates a subscription.
 */
export const parseRazorpayPaymentCallbackUrl = (
  rawUrl: string,
  expectedOrderId: string,
): RazorpayPaymentCallback | null => {
  try {
    return callbackFromSearchParams(new URL(rawUrl).searchParams, expectedOrderId);
  } catch {
    return null;
  }
};

/**
 * The app-hosted callback relay posts this exact payload when Razorpay delivers
 * a form POST. Keeping the message shape narrow avoids treating arbitrary page
 * messages or a bare `status=success` redirect as proof of payment.
 */
export const parseRazorpayPaymentCallbackMessage = (
  rawMessage: string,
  expectedOrderId: string,
): RazorpayPaymentCallback | null => {
  try {
    const value = JSON.parse(rawMessage) as Partial<RazorpayPaymentCallbackMessage>;
    if (value.type !== 'menorah:razorpay-callback') return null;

    return callbackFromSearchParams(
      new URLSearchParams({
        razorpay_order_id: value.razorpay_order_id || '',
        razorpay_payment_id: value.razorpay_payment_id || '',
        razorpay_signature: value.razorpay_signature || '',
      }),
      expectedOrderId,
    );
  } catch {
    return null;
  }
};

const normalizedOriginAndPath = (value: string) => {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return null;
  }
};

/**
 * Accept the configured relay and final return screen. The relay intentionally
 * moves a POST body to `/checkout/return`, so both locations can occur in a
 * single WebView navigation sequence.
 */
export const isKnownCheckoutReturnUrl = (
  rawUrl: string,
  configuredCallbackUrl: string | undefined,
  webBaseUrl: string,
): boolean => {
  const received = normalizedOriginAndPath(rawUrl);
  if (!received) return false;

  const configured = configuredCallbackUrl
    ? normalizedOriginAndPath(configuredCallbackUrl)
    : null;
  if (configured === received) return true;

  try {
    const webUrl = new URL(webBaseUrl);
    const returnPath = `${webUrl.origin}/checkout/return`;
    const callbackPath = `${webUrl.origin}/checkout/callback`;
    return received === returnPath || received === callbackPath;
  } catch {
    return false;
  }
};
