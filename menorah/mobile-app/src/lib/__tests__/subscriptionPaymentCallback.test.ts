import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isKnownCheckoutReturnUrl,
  parseRazorpayPaymentCallbackMessage,
  parseRazorpayPaymentCallbackUrl,
} from '../subscriptionPaymentCallback';

const orderId = 'order_test_expected';
const payment = {
  razorpay_order_id: orderId,
  razorpay_payment_id: 'pay_test_expected',
  razorpay_signature: 'signed-by-razorpay',
};

test('parses a complete Razorpay callback URL only for the created order', () => {
  const url = new URL('https://app.menorah.me/checkout/return');
  Object.entries(payment).forEach(([key, value]) => url.searchParams.set(key, value));

  assert.deepEqual(parseRazorpayPaymentCallbackUrl(url.toString(), orderId), payment);
  assert.equal(parseRazorpayPaymentCallbackUrl(url.toString(), 'order_other'), null);
});

test('rejects callback URLs without every signed Razorpay field', () => {
  assert.equal(
    parseRazorpayPaymentCallbackUrl(
      'https://app.menorah.me/checkout/return?razorpay_order_id=order_test_expected&razorpay_payment_id=pay_test_expected',
      orderId,
    ),
    null,
  );
});

test('accepts only the explicitly typed native WebView callback message', () => {
  assert.deepEqual(
    parseRazorpayPaymentCallbackMessage(JSON.stringify({ type: 'menorah:razorpay-callback', ...payment }), orderId),
    payment,
  );
  assert.equal(
    parseRazorpayPaymentCallbackMessage(JSON.stringify({ type: 'payment-success', ...payment }), orderId),
    null,
  );
});

test('accepts callback and final return URLs but not an arbitrary success URL', () => {
  const callbackUrl = 'https://app.menorah.me/checkout/callback';
  assert.equal(isKnownCheckoutReturnUrl(callbackUrl, callbackUrl, 'https://app.menorah.me'), true);
  assert.equal(isKnownCheckoutReturnUrl('https://app.menorah.me/checkout/return?status=success', callbackUrl, 'https://app.menorah.me'), true);
  assert.equal(isKnownCheckoutReturnUrl('https://attacker.example/checkout/return?status=success', callbackUrl, 'https://app.menorah.me'), false);
});
