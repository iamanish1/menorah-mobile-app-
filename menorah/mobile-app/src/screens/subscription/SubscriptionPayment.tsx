import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity, NativeModules } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { X } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { ENV } from '@/lib/env';
import { api } from '@/lib/api';
import { useAuth } from '@/state/useAuth';
import { displayPhone } from '@/lib/authPolicy';
import subscriptionService from '@/services/subscriptionService';
import type { SubscriptionType } from './subscriptionPlans';
import {
  isKnownCheckoutReturnUrl,
  parseRazorpayPaymentCallbackMessage,
  parseRazorpayPaymentCallbackUrl,
  type RazorpayPaymentCallback,
} from '@/lib/subscriptionPaymentCallback';
import {
  IOS_SUBSCRIPTIONS_UNAVAILABLE_MESSAGE,
  shouldDisableIOSSubscriptionPurchase,
} from '@/lib/paymentPolicy';

const RAZORPAY_UNAVAILABLE_MESSAGE =
  'Payments require a development build. Expo Go preview does not support native Razorpay.';

const isSubscriptionType = (value: unknown): value is SubscriptionType =>
  value === 'weekly' || value === 'monthly' || value === 'yearly';

type RazorpayCheckoutModule = {
  open: (options: Record<string, unknown>) => Promise<any>;
};

type RazorpayRequireResult = {
  default?: RazorpayCheckoutModule;
  open?: RazorpayCheckoutModule['open'];
};

const hasNativeRazorpay = () =>
  Boolean(NativeModules.RNRazorpayCheckout && NativeModules.RazorpayEventEmitter);

const loadRazorpayCheckout = (): RazorpayCheckoutModule | null => {
  if (!hasNativeRazorpay()) {
    return null;
  }

  const razorpayModule = require('react-native-razorpay') as RazorpayRequireResult;
  const checkout =
    razorpayModule.default ??
    (razorpayModule.open ? (razorpayModule as RazorpayCheckoutModule) : null);

  return checkout && typeof checkout.open === 'function' ? checkout : null;
};

export default function SubscriptionPayment({ route, navigation }: any) {
  const { subscriptionType, paymentMethod = 'razorpay' } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [keyId, setKeyId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>('INR');
  const [isPolling, setIsPolling] = useState(false);
  const [, setWebViewLoading] = useState(true);
  const [sdkPaymentInitiated, setSdkPaymentInitiated] = useState(false);
  const isMountedRef = useRef(true);
  const statusPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusPollRunRef = useRef(0);
  const verificationInFlightRef = useRef(false);
  const subscriptionActivatedRef = useRef(false);
  const { scheme } = useThemeMode();
  const { user } = useAuth();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const actionTextColor = isDark ? colors.primaryDark : 'white';
  const returnUrl = ENV.CHECKOUT_RETURN_URL || `${ENV.WEB_BASE_URL}/checkout/callback`;
  const USE_RAZORPAY_SDK = ENV.USE_RAZORPAY_SDK ?? true;
  const canUseRazorpaySdk = USE_RAZORPAY_SDK && hasNativeRazorpay();
  const isIOSSubscriptionDisabled = shouldDisableIOSSubscriptionPurchase();
  const selectedSubscriptionType = isSubscriptionType(subscriptionType) ? subscriptionType : null;

  const clearStatusPoll = useCallback(() => {
    statusPollRunRef.current += 1;
    if (statusPollTimerRef.current) {
      clearTimeout(statusPollTimerRef.current);
      statusPollTimerRef.current = null;
    }
  }, []);

  const completeSubscriptionActivation = useCallback(async (confirmedType?: SubscriptionType) => {
    if (subscriptionActivatedRef.current) return;

    const activeType = confirmedType || selectedSubscriptionType;
    if (!activeType) {
      if (isMountedRef.current) {
        setError('Subscription type is required');
        setIsPolling(false);
      }
      return;
    }

    subscriptionActivatedRef.current = true;
    clearStatusPoll();
    // Local storage is updated only after a signed server verification or the
    // authenticated server-side subscription status confirms activation.
    await subscriptionService.setPremiumSubscription(activeType);

    if (!isMountedRef.current) return;
    setIsPolling(false);
    navigation.replace('SubscriptionSuccess', { subscriptionType: activeType });
  }, [clearStatusPoll, navigation, selectedSubscriptionType]);

  const pollSubscriptionStatus = useCallback((maxAttempts: number = 15) => {
    if (!selectedSubscriptionType || paymentMethod !== 'razorpay' || subscriptionActivatedRef.current) {
      return;
    }

    clearStatusPoll();
    const run = statusPollRunRef.current + 1;
    statusPollRunRef.current = run;
    let attempts = 0;
    setIsPolling(true);

    const poll = async () => {
      if (!isMountedRef.current || statusPollRunRef.current !== run || subscriptionActivatedRef.current) return;
      statusPollTimerRef.current = null;
      attempts += 1;

      try {
        // Subscription orders intentionally do not use the booking-only
        // `/payments/order/:orderId/status` endpoint. This is the authenticated
        // source of truth when a webhook has completed server-side activation.
        const response = await api.getSubscriptionStatus();
        if (response.success && response.data?.isActive) {
          const serverType = isSubscriptionType(response.data.subscriptionType)
            ? response.data.subscriptionType
            : selectedSubscriptionType;
          await completeSubscriptionActivation(serverType);
          return;
        }
      } catch (pollError) {
        // A transient network error should not turn a successful payment into a
        // client-side failure. The bounded retry below will ask the server again.
        console.warn('Unable to check subscription activation status:', pollError);
      }

      if (!isMountedRef.current || statusPollRunRef.current !== run || subscriptionActivatedRef.current) return;
      if (attempts >= maxAttempts) {
        setIsPolling(false);
        setError('We could not confirm your payment yet. Your card has not been charged again. Check your subscription status shortly or contact support.');
        return;
      }

      statusPollTimerRef.current = setTimeout(poll, 2000);
    };

    statusPollTimerRef.current = setTimeout(poll, 1500);
  }, [clearStatusPoll, completeSubscriptionActivation, paymentMethod, selectedSubscriptionType]);

  const verifySubscriptionPayment = useCallback(async (payment: RazorpayPaymentCallback) => {
    if (
      !selectedSubscriptionType ||
      !orderId ||
      payment.razorpay_order_id !== orderId ||
      verificationInFlightRef.current ||
      subscriptionActivatedRef.current
    ) {
      return;
    }

    verificationInFlightRef.current = true;
    clearStatusPoll();
    setIsPolling(true);

    try {
      const response = await api.verifySubscriptionPayment({
        ...payment,
        subscriptionType: selectedSubscriptionType,
      });

      if (response.success) {
        await completeSubscriptionActivation(selectedSubscriptionType);
        return;
      }

      // A network/server failure may mean the verified webhook has already
      // activated the subscription. Reconcile against the authenticated status
      // endpoint; invalid signatures and validation errors are never retried.
      if (response.isNetworkError || (response.httpStatus !== undefined && response.httpStatus >= 500)) {
        pollSubscriptionStatus();
        return;
      }

      if (isMountedRef.current) {
        setError(response.message || 'We could not securely verify this payment. Please contact support before trying again.');
      }
    } catch (verificationError) {
      console.warn('Unable to submit Razorpay subscription verification:', verificationError);
      pollSubscriptionStatus();
    } finally {
      verificationInFlightRef.current = false;
      if (isMountedRef.current && !subscriptionActivatedRef.current && !statusPollTimerRef.current) {
        setIsPolling(false);
      }
    }
  }, [clearStatusPoll, completeSubscriptionActivation, orderId, pollSubscriptionStatus, selectedSubscriptionType]);

  const createCheckoutSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    clearStatusPoll();
    subscriptionActivatedRef.current = false;
    verificationInFlightRef.current = false;

    if (isIOSSubscriptionDisabled) {
      setError(IOS_SUBSCRIPTIONS_UNAVAILABLE_MESSAGE);
      setLoading(false);
      return;
    }

    if (!selectedSubscriptionType) {
      setError('Subscription type is required');
      setLoading(false);
      return;
    }
    
    try {
      const response = await api.createSubscriptionCheckout(selectedSubscriptionType);
      
      if (response.success && response.data) {
        const url = response.data.checkoutUrl || response.data.url || response.data.sessionUrl;
        
        if (paymentMethod === 'razorpay' && response.data.orderId) {
          setOrderId(response.data.orderId);
        }
        
        if (paymentMethod === 'razorpay') {
          if (response.data.keyId) {
            setKeyId(response.data.keyId);
          }
          if (response.data.amount !== undefined) {
            setAmount(response.data.amount);
          }
          if (response.data.currency) {
            setCurrency(response.data.currency);
          }
        }
        
        if (url) {
          setCheckoutUrl(url);
        } else if (!canUseRazorpaySdk || paymentMethod !== 'razorpay') {
          setError(
            paymentMethod === 'razorpay' && !canUseRazorpaySdk
              ? RAZORPAY_UNAVAILABLE_MESSAGE
              : 'Checkout URL not found in response'
          );
        }
      } else {
        setError(response.message || 'Failed to create checkout session');
      }
    } catch (err: any) {
      console.error('Error creating subscription checkout session:', err);
      setError(`Failed to create checkout session: ${err.message || 'Network error. Please check your connection.'}`);
    } finally {
      setLoading(false);
    }
  }, [canUseRazorpaySdk, clearStatusPoll, isIOSSubscriptionDisabled, paymentMethod, selectedSubscriptionType]);

  const initiateSDKPayment = useCallback(async () => {
    if (isIOSSubscriptionDisabled) {
      Alert.alert('Subscriptions unavailable on iOS', IOS_SUBSCRIPTIONS_UNAVAILABLE_MESSAGE);
      setError(IOS_SUBSCRIPTIONS_UNAVAILABLE_MESSAGE);
      return;
    }

    if (!canUseRazorpaySdk) {
      Alert.alert('Development build required', RAZORPAY_UNAVAILABLE_MESSAGE);
      setError(RAZORPAY_UNAVAILABLE_MESSAGE);
      return;
    }

    const RazorpayCheckout = loadRazorpayCheckout();

    if (!RazorpayCheckout) {
      Alert.alert('Development build required', RAZORPAY_UNAVAILABLE_MESSAGE);
      setError(RAZORPAY_UNAVAILABLE_MESSAGE);
      return;
    }

    if (!keyId || !orderId || !amount) {
      console.error('Missing required payment data:', { keyId, orderId, amount });
      setError('Payment data incomplete. Please try again.');
      return;
    }

    try {
      console.log('Initiating Razorpay SDK payment for subscription');
      
      const userEmail = user?.email || '';
      const userPhone = displayPhone(user?.phone);
      const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '';

      const options = {
        description: `${selectedSubscriptionType || 'Premium'} Subscription Payment`,
        currency: currency,
        key: keyId,
        amount: amount.toString(),
        name: 'Menorah Health',
        order_id: orderId,
        prefill: {
          email: userEmail,
          contact: userPhone,
          name: userName || 'User'
        },
        theme: {
          color: colors.primary
        }
      };

      const paymentData = await RazorpayCheckout.open(options);

      if (paymentData.razorpay_payment_id && paymentData.razorpay_signature) {
        await verifySubscriptionPayment({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentData.razorpay_payment_id,
          razorpay_signature: paymentData.razorpay_signature,
        });
      } else {
        // The SDK normally returns all three fields. If its result is
        // interrupted after the provider has captured payment, wait for the
        // authenticated server status instead of treating a local success as
        // payment proof.
        pollSubscriptionStatus();
      }
    } catch (err: any) {
      console.error('Razorpay SDK error:', err);
      
      if (err.code === 0 || err.code === 'PayerCancelled' || err.code === 'NativePaymentCancelled') {
        console.log('User cancelled payment');
        navigation.goBack();
        return;
      }
      
      const errorMessage = err.description || err.message || 'Payment failed. Please try again.';
      setError(errorMessage);
      
      Alert.alert(
        'Payment Error',
        errorMessage,
        [{ text: 'OK' }]
      );
    }
  }, [
    isIOSSubscriptionDisabled,
    canUseRazorpaySdk,
    keyId,
    orderId,
    amount,
    currency,
    user,
    selectedSubscriptionType,
    navigation,
    pollSubscriptionStatus,
    verifySubscriptionPayment,
    colors.primary,
  ]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearStatusPoll();
    };
  }, [clearStatusPoll]);

  useEffect(() => {
    if (selectedSubscriptionType) {
      createCheckoutSession();
    } else {
      setError('Subscription type is required');
      setLoading(false);
    }
  }, [selectedSubscriptionType, createCheckoutSession]);

  useEffect(() => {
    if (
      canUseRazorpaySdk &&
      paymentMethod === 'razorpay' &&
      !loading &&
      keyId &&
      orderId &&
      amount &&
      !error &&
      !sdkPaymentInitiated
    ) {
      setSdkPaymentInitiated(true);
      initiateSDKPayment();
    }
  }, [keyId, orderId, amount, loading, error, paymentMethod, sdkPaymentInitiated, canUseRazorpaySdk, initiateSDKPayment]);

  const handleCheckoutReturnNavigation = useCallback(async (rawUrl: string) => {
    if (
      !orderId ||
      !isKnownCheckoutReturnUrl(rawUrl, returnUrl, ENV.WEB_BASE_URL) ||
      subscriptionActivatedRef.current
    ) {
      return;
    }

    const payment = parseRazorpayPaymentCallbackUrl(rawUrl, orderId);
    if (payment) {
      await verifySubscriptionPayment(payment);
      return;
    }

    try {
      const status = new URL(rawUrl).searchParams.get('status')?.toLowerCase();
      if (status === 'success') {
        // The app-hosted relay may receive Razorpay's form POST and post the
        // signed fields a moment later. This status poll reconciles only with
        // server-owned subscription state; it never activates locally on its own.
        pollSubscriptionStatus();
      } else if (status === 'cancel' || status === 'failed') {
        navigation.goBack();
      }
    } catch {
      // Ignore malformed navigation events. They are not a payment signal.
    }
  }, [navigation, orderId, pollSubscriptionStatus, returnUrl, verifySubscriptionPayment]);

  const handleNavigationStateChange = useCallback((nav: { url?: string }) => {
    if (nav.url) {
      handleCheckoutReturnNavigation(nav.url).catch((navigationError) => {
        console.warn('Unable to process checkout return navigation:', navigationError);
      });
    }
  }, [handleCheckoutReturnNavigation]);

  const handleWebViewMessage = useCallback((event: { nativeEvent: { data?: string } }) => {
    if (!orderId || !event.nativeEvent.data) return;

    const payment = parseRazorpayPaymentCallbackMessage(event.nativeEvent.data, orderId);
    if (payment) {
      verifySubscriptionPayment(payment).catch((verificationError) => {
        console.warn('Unable to process checkout callback message:', verificationError);
      });
    }
  }, [orderId, verifySubscriptionPayment]);

  const handleClose = () => {
    Alert.alert(
      'Cancel Payment',
      'Are you sure you want to cancel the payment?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: () => navigation.goBack() }
      ]
    );
  };

  if (isIOSSubscriptionDisabled) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12, textAlign: 'center' }}>
            Subscriptions unavailable on iOS
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
            {IOS_SUBSCRIPTIONS_UNAVAILABLE_MESSAGE}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: actionTextColor, fontSize: 16, fontWeight: '600' }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading || (canUseRazorpaySdk && paymentMethod === 'razorpay' && !sdkPaymentInitiated && !error)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 16, color: colors.text, marginTop: 16 }}>
            Preparing payment...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
            Payment Error
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24 }}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 12
            }}
          >
            <Text style={{ color: actionTextColor, fontSize: 16, fontWeight: '600' }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!checkoutUrl && (!canUseRazorpaySdk || paymentMethod !== 'razorpay')) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
            No Checkout URL
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24 }}>
            Checkout URL not available. Please try again.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 12
            }}
          >
            <Text style={{ color: actionTextColor, fontSize: 16, fontWeight: '600' }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{
        backgroundColor: colors.card,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
      }}>
        <TouchableOpacity onPress={handleClose}>
          <X size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>
          {isPolling ? 'Verifying Payment...' : 'Subscription Payment'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {isPolling && (
        <View style={{
          backgroundColor: colors.card,
          padding: 16,
          alignItems: 'center',
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.text, marginTop: 8 }}>
            Verifying your payment...
          </Text>
        </View>
      )}

      {!canUseRazorpaySdk || paymentMethod !== 'razorpay' ? (
        <WebView
          source={{ uri: checkoutUrl || '' }}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleWebViewMessage}
          onLoadEnd={() => setWebViewLoading(false)}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView error:', nativeEvent);
            setError(`Failed to load payment page: ${nativeEvent.description || 'Unknown error'}`);
            setWebViewLoading(false);
          }}
          style={{ flex: 1 }}
        />
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 16, color: colors.text, textAlign: 'center' }}>
            Payment window should open automatically. If it does not, please try again.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
