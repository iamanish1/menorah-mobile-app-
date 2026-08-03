const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const projectRoot = resolve(__dirname, "..");
const readSource = (relativePath) =>
  readFileSync(resolve(projectRoot, relativePath), "utf8");

test("all subscription payment capability gates remain fail closed", () => {
  const policy = readSource("src/lib/paymentPolicy.ts");

  assert.match(
    policy,
    /export const isDigitalSubscriptionPaymentAllowed = \(\) => false;/,
  );
  assert.match(
    policy,
    /export const isExternalDigitalPaymentAllowed = \(\) => false;/,
  );
  assert.match(
    policy,
    /export const shouldDisableSubscriptionPurchase = \(\) =>\s*!isDigitalSubscriptionPaymentAllowed\(\);/,
  );
});

test("the discover selector uses the all-platform subscription gate", () => {
  const selector = readSource(
    "src/components/discover/SubscriptionSelector.tsx",
  );

  assert.match(selector, /shouldDisableSubscriptionPurchase/);
  assert.match(selector, /SUBSCRIPTIONS_UNAVAILABLE_MESSAGE/);
  assert.doesNotMatch(selector, /shouldDisableIOSSubscriptionPurchase/);
  assert.doesNotMatch(selector, /IOS_SUBSCRIPTIONS_UNAVAILABLE_MESSAGE/);
});

test("leaving a bound booking payment never promises or requests cancellation", () => {
  const paymentSheet = readSource("src/screens/booking/PaymentSheet.tsx");

  assert.match(paymentSheet, /Leave Payment/);
  assert.match(paymentSheet, /payment status is reconciled/);
  assert.match(paymentSheet, /hold to expire/);
  assert.doesNotMatch(paymentSheet, /api\.cancelBooking/);
  assert.doesNotMatch(paymentSheet, /Your booking will be cancelled/);
});

test("booking checkout handles completed payments and native dismissal without relaunching", () => {
  const paymentSheet = readSource("src/screens/booking/PaymentSheet.tsx");

  assert.match(paymentSheet, /response\.data\.alreadyPaid === true/);
  assert.match(paymentSheet, /navigation\.replace\('BookingSuccess'/);
  assert.match(paymentSheet, /checkoutInFlightRef/);
  assert.match(paymentSheet, /autoLaunchedBookingRef/);
  assert.match(paymentSheet, /mountedRef/);
  assert.match(paymentSheet, /beforeRemove/);
  assert.match(paymentSheet, /PAYMENT_DISMISSED_MESSAGE/);
  assert.doesNotMatch(
    paymentSheet,
    /NativePaymentCancelled'[\s\S]{0,100}navigation\.goBack\(\)/,
  );
});

test("booking review skips checkout only for a paid subscription booking", () => {
  const bookingReview = readSource("src/screens/booking/BookingReview.tsx");

  assert.match(bookingReview, /isSubscriptionAuthorizedBooking/);
  assert.match(bookingReview, /booking\?\.isSubscriptionBooking === true/);
  assert.match(
    bookingReview,
    /booking\?\.paymentMethod === ["']subscription["']/,
  );
  assert.match(bookingReview, /booking\?\.paymentStatus === ["']paid["']/);
  assert.match(bookingReview, /isSubscriptionBooking: true/);
});

test("mobile does not advertise an unimplemented first-session promotion", () => {
  const discover = readSource("src/screens/discover/DiscoverModern.tsx");

  assert.doesNotMatch(
    discover,
    /FreeSessionModal|hasSeenFreeSessionModal|Book My Free Session/,
  );
  assert.doesNotMatch(discover, /First Session is on Us|completely free/i);
});

test("bookings under payment review expose support guidance without join or retry actions", () => {
  const bookings = readSource("src/screens/booking/Bookings.tsx");
  const bookingReview = readSource("src/screens/booking/BookingReview.tsx");

  assert.match(bookings, /if \(booking\.paymentReviewRequired\) return;/);
  assert.match(
    bookings,
    /!booking\.paymentReviewRequired[\s\S]{0,180}booking\.status === ["']in-progress["']/,
  );
  assert.match(
    bookings,
    /!booking\.paymentReviewRequired\s*&&\s*booking\.paymentAction === ["']resume_payment["']/,
  );
  assert.match(
    bookingReview,
    /const showJoinButton = canJoin \|\| isConfirmedWithCounsellor;/,
  );
  assert.match(bookingReview, /const canJoin =\s*!isPaymentReviewRequired/);
  assert.match(
    bookingReview,
    /Payment status is being reconciled\. Contact support if it does not update\./,
  );
});
