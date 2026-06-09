import { Platform } from 'react-native';

export const IOS_SUBSCRIPTIONS_UNAVAILABLE_MESSAGE =
  'Subscriptions are currently unavailable on iOS. You can continue using the free features.';

export const isIOS = () => Platform.OS === 'ios';

export const isDigitalSubscriptionPaymentAllowed = () => !isIOS();

export const isExternalDigitalPaymentAllowed = () => !isIOS();

export const shouldDisableIOSSubscriptionPurchase = () =>
  isIOS() && !isDigitalSubscriptionPaymentAllowed();
