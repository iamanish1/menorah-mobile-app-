import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import RazorpayCheckout from 'react-native-razorpay';
import { X } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { ENV } from '@/lib/env';
import { api } from '@/lib/api';
import { useAuth } from '@/state/useAuth';
import subscriptionService from '@/services/subscriptionService';
import type { SubscriptionType } from '@/components/discover/SubscriptionSelector';

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
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [sdkPaymentInitiated, setSdkPaymentInitiated] = useState(false);
  const { scheme } = useThemeMode();
  const { user } = useAuth();
  const colors = palettes[scheme];
  const returnUrl = ENV.CHECKOUT_RETURN_URL || 'menorah://payments/subscription/return';
  const USE_RAZORPAY_SDK = ENV.USE_RAZORPAY_SDK ?? true;
  const canUseRazorpaySdk = USE_RAZORPAY_SDK && typeof RazorpayCheckout?.open === 'function';

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
        console.error('Error polling order status:', err);
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          setIsPolling(false);
          setError('Unable to verify payment. Please check your subscription status.');
        }
      }
    };

    setTimeout(poll, 2000);
  }, [orderId, paymentMethod]);

  const verifyAndActivateSubscription = useCallback(async () => {
    try {
      // If we have payment details from SDK, verify with them
      // Otherwise, verify using order status
      const verifyResponse = await api.verifySubscriptionPayment({
        subscriptionType: subscriptionType as SubscriptionType,
        orderId: orderId || undefined
      });

      if (verifyResponse.success) {
        // Sync subscription with local storage
        await subscriptionService.setPremiumSubscription(subscriptionType as SubscriptionType);
        
        // Navigate to success screen
        navigation.replace('SubscriptionSuccess', { subscriptionType });
      } else {
        setError(verifyResponse.message || 'Failed to activate subscription');
      }
    } catch (err: any) {
      console.error('Error verifying subscription payment:', err);
      setError('Failed to activate subscription. Please contact support.');
    }
  }, [subscriptionType, orderId, navigation]);

  const createCheckoutSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Creating subscription checkout session with:', { subscriptionType, paymentMethod });
      
      const response = await api.createSubscriptionCheckout(subscriptionType as SubscriptionType, paymentMethod);
      
      console.log('Subscription checkout session response:', response);
      
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
          console.log('Checkout URL received:', url);
          setCheckoutUrl(url);
        } else if (!canUseRazorpaySdk || paymentMethod !== 'razorpay') {
          console.error('No checkout URL in response:', response);
          setError('Checkout URL not found in response');
        }
      } else {
        console.error('Subscription checkout session failed:', response);
        setError(response.message || 'Failed to create checkout session');
      }
    } catch (err: any) {
      console.error('Error creating subscription checkout session:', err);
      setError(`Failed to create checkout session: ${err.message || 'Network error. Please check your connection.'}`);
    } finally {
      setLoading(false);
    }
  }, [subscriptionType, paymentMethod, canUseRazorpaySdk]);

  const initiateSDKPayment = useCallback(async () => {
    if (!canUseRazorpaySdk) {
      console.warn('Razorpay SDK unavailable for subscription payment, using WebView fallback');
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
          color: '#314830'
        }
      };

      const paymentData = await RazorpayCheckout.open(options);
      
      console.log('Payment success data:', paymentData);
      
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
            await subscriptionService.setPremiumSubscription(subscriptionType as SubscriptionType);
            navigation.replace('SubscriptionSuccess', { subscriptionType });
          } else {
            setIsPolling(false);
            await pollOrderStatus();
          }
        } catch (verifyError: any) {
          console.error('Payment verification error:', verifyError);
          setIsPolling(false);
          await pollOrderStatus();
        }
      } else {
        await pollOrderStatus();
      }
    } catch (err: any) {
      console.error('Razorpay SDK error:', err);
      
      if (err.code === 'PayerCancelled' || err.code === 'NativePaymentCancelled') {
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
  }, [canUseRazorpaySdk, keyId, orderId, amount, currency, user, subscriptionType, navigation, pollOrderStatus]);

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
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
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
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
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
            console.error('WebView error:', nativeEvent);
            setError(`Failed to load payment page: ${nativeEvent.description || 'Unknown error'}`);
            setWebViewLoading(false);
          }}
          style={{ flex: 1 }}
        />
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 16, color: colors.text, textAlign: 'center' }}>
            Payment window should open automatically. If it doesn't, please try again.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

