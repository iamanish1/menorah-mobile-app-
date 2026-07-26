import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity, NativeModules } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { X } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { ENV } from '@/lib/env';
import { api } from '@/lib/api';
import { useAuth } from '@/state/useAuth';
import type { SubscriptionType } from './subscriptionPlans';
import {
  SUBSCRIPTIONS_UNAVAILABLE_MESSAGE,
  shouldDisableSubscriptionPurchase,
} from '@/lib/paymentPolicy';
import { reportError } from '@/lib/safeDiagnostics';

const RAZORPAY_UNAVAILABLE_MESSAGE =
  'Payments require a development build. Expo Go preview does not support native Razorpay.';

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
  const { scheme } = useThemeMode();
  const { user } = useAuth();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const actionTextColor = isDark ? colors.primaryDark : 'white';
  const returnUrl = ENV.CHECKOUT_RETURN_URL || 'menorah://payments/subscription/return';
  const USE_RAZORPAY_SDK = ENV.USE_RAZORPAY_SDK ?? true;
  const canUseRazorpaySdk = USE_RAZORPAY_SDK && hasNativeRazorpay();
  const isSubscriptionPurchaseDisabled = shouldDisableSubscriptionPurchase();

  const verifyAndActivateSubscription = useCallback(async () => {
    try {
      // If we have payment details from SDK, verify with them
      // Otherwise, verify using order status
      const verifyResponse = await api.verifySubscriptionPayment({
        subscriptionType: subscriptionType as SubscriptionType,
        orderId: orderId || undefined
      });

      if (verifyResponse.success) {
        // Navigate to success screen
        navigation.replace('SubscriptionSuccess', { subscriptionType });
      } else {
        setError(verifyResponse.message || 'Failed to activate subscription');
      }
    } catch (err: any) {
      reportError('subscription.payment_verification_failed', err);
      setError('Failed to activate subscription. Please contact support.');
    }
  }, [subscriptionType, orderId, navigation]);

  const pollOrderStatus = useCallback(async (maxAttempts: number = 15) => {
    if (!orderId || paymentMethod !== 'razorpay') {
      return;
    }

    setIsPolling(true);
    let attempts = 0;

    const poll = async () => {
      attempts++;
      try {
        const response = await api.getRazorpayOrderStatus(orderId);
        
        if (response.success && response.data?.orderStatus === 'paid') {
          setIsPolling(false);
          // Verify and activate subscription
          await verifyAndActivateSubscription();
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          setIsPolling(false);
          setError('Payment verification timeout. Please check your subscription status.');
        }
      } catch (err: any) {
        reportError('subscription.payment_status_poll_failed', err);
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          setIsPolling(false);
          setError('Unable to verify payment. Please check your subscription status.');
        }
      }
    };

    setTimeout(poll, 2000);
  }, [orderId, paymentMethod, verifyAndActivateSubscription]);

  const createCheckoutSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isSubscriptionPurchaseDisabled) {
      setError(SUBSCRIPTIONS_UNAVAILABLE_MESSAGE);
      setLoading(false);
      return;
    }
    
    try {
      const response = await api.createSubscriptionCheckout(subscriptionType as SubscriptionType);
      
      if (response.success && response.data) {
        const url = response.data.checkoutUrl || response.data.url || response.data.sessionUrl;
        
        if (paymentMethod === 'razorpay' && response.data.orderId) {
          setOrderId(response.data.orderId);
        }
        
        if (paymentMethod === 'razorpay') {
          if (response.data.keyId) {
            setKeyId(response.data.keyId);
          }
          if (response.data.amount) {
            setAmount(response.data.amount);
          }
          if (response.data.currency) {
            setCurrency(response.data.currency);
          }
        }
        
        if (url) {
          setCheckoutUrl(url);
        } else if (!canUseRazorpaySdk || paymentMethod !== 'razorpay') {
          reportError('subscription.checkout_url_missing');
          setError(
            paymentMethod === 'razorpay' && !canUseRazorpaySdk
              ? RAZORPAY_UNAVAILABLE_MESSAGE
              : 'Checkout URL not found in response'
          );
        }
      } else {
        reportError('subscription.checkout_creation_rejected');
        setError(response.message || 'Failed to create checkout session');
      }
    } catch (err: any) {
      reportError('subscription.checkout_creation_failed', err);
      setError(`Failed to create checkout session: ${err.message || 'Network error. Please check your connection.'}`);
    } finally {
      setLoading(false);
    }
  }, [subscriptionType, paymentMethod, canUseRazorpaySdk, isSubscriptionPurchaseDisabled]);

  const initiateSDKPayment = useCallback(async () => {
    if (isSubscriptionPurchaseDisabled) {
      Alert.alert('New subscriptions unavailable', SUBSCRIPTIONS_UNAVAILABLE_MESSAGE);
      setError(SUBSCRIPTIONS_UNAVAILABLE_MESSAGE);
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
      reportError('subscription.payment_data_incomplete');
      setError('Payment data incomplete. Please try again.');
      return;
    }

    try {
      const userEmail = user?.email || '';
      const userPhone = user?.phone || '';
      const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '';

      const options = {
        description: `${subscriptionType} Subscription Payment`,
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
        setIsPolling(true);
        
        try {
          const verifyResponse = await api.verifySubscriptionPayment({
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentData.razorpay_payment_id,
            razorpay_signature: paymentData.razorpay_signature,
            subscriptionType: subscriptionType as SubscriptionType
          });

          if (verifyResponse.success) {
            setIsPolling(false);
            navigation.replace('SubscriptionSuccess', { subscriptionType });
          } else {
            setIsPolling(false);
            await pollOrderStatus();
          }
        } catch (verifyError: any) {
          reportError('subscription.sdk_payment_verification_failed', verifyError);
          setIsPolling(false);
          await pollOrderStatus();
        }
      } else {
        await pollOrderStatus();
      }
    } catch (err: any) {
      reportError('subscription.razorpay_failed', err);
      
      if (err.code === 'PayerCancelled' || err.code === 'NativePaymentCancelled') {
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
  }, [isSubscriptionPurchaseDisabled, canUseRazorpaySdk, keyId, orderId, amount, currency, user, subscriptionType, navigation, pollOrderStatus, colors.primary]);

  useEffect(() => {
    if (subscriptionType) {
      createCheckoutSession();
    } else {
      setError('Subscription type is required');
      setLoading(false);
    }

    return () => {
      setIsPolling(false);
    };
  }, [subscriptionType, createCheckoutSession]);

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

  const handleNavigationStateChange = async (nav: any) => {
    const url = nav.url;
    
    if (url.includes('status=success') || url.includes(returnUrl + '?status=success')) {
      if (paymentMethod === 'razorpay' && orderId) {
        await pollOrderStatus();
      }
    } else if (url.includes('status=cancel') || url.includes('status=failed') || url.includes(returnUrl + '?status=cancel')) {
      navigation.goBack();
    }
  };

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

  if (isSubscriptionPurchaseDisabled) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12, textAlign: 'center' }}>
            New subscriptions unavailable
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
            {SUBSCRIPTIONS_UNAVAILABLE_MESSAGE}
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
          onLoadEnd={() => setWebViewLoading(false)}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            reportError('subscription.payment_webview_failed');
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
