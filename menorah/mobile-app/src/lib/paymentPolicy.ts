import { Platform } from 'react-native';

export const IOS_SUBSCRIPTIONS_UNAVAILABLE_MESSAGE =
  'New subscription purchases are temporarily unavailable. Existing entitlements remain visible.';

export const SUBSCRIPTIONS_UNAVAILABLE_MESSAGE = IOS_SUBSCRIPTIONS_UNAVAILABLE_MESSAGE;

export const isIOS = () => Platform.OS === 'ios';

// Subscription money movement does not yet have the durable attempt and
// reconciliation guarantees used by booking payments. Keep purchase entry
// points closed on every platform until that backend flow is implemented.
export const isDigitalSubscriptionPaymentAllowed = () => false;

// No client surface may treat an external checkout as available while the
// subscription backend is intentionally disabled.
export const isExternalDigitalPaymentAllowed = () => false;

export const shouldDisableIOSSubscriptionPurchase = () =>
  !isDigitalSubscriptionPaymentAllowed();

export const shouldDisableSubscriptionPurchase = () =>
  !isDigitalSubscriptionPaymentAllowed();
