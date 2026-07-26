import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity, NativeModules } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { api } from '@/lib/api';
import { useAuth } from '@/state/useAuth';

const RAZORPAY_UNAVAILABLE_MESSAGE =
  'Payments require a development build. Expo Go preview does not support native Razorpay.';
const PAYMENT_LEAVE_MESSAGE =
  'The slot may remain temporarily held while payment status is reconciled. Wait for the hold to expire or contact support before trying that slot again.';
const PAYMENT_DISMISSED_MESSAGE =
  'The payment window was closed. Your slot may remain temporarily held while payment status is reconciled.';

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

export default function PaymentSheet({ route, navigation }: any) {
  const { bookingId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const checkoutInFlightRef = useRef(false);
  const checkoutStartedRef = useRef(false);
  const autoLaunchedBookingRef = useRef<string | null>(null);
  const allowNavigationRef = useRef(false);
  const leavePromptOpenRef = useRef(false);
  const { scheme } = useThemeMode();
  const { user } = useAuth();
  const colors = palettes[scheme];
  const primaryActionText = scheme === 'dark' ? colors.primaryDark : 'white';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const showLeavePaymentPrompt = useCallback((onLeave: () => void) => {
    if (leavePromptOpenRef.current) return;
    leavePromptOpenRef.current = true;
    Alert.alert(
      'Leave payment?',
      PAYMENT_LEAVE_MESSAGE,
      [
        {
          text: 'Stay',
          style: 'cancel',
          onPress: () => {
            leavePromptOpenRef.current = false;
          },
        },
        {
          text: 'Leave Payment',
          onPress: () => {
            leavePromptOpenRef.current = false;
            allowNavigationRef.current = true;
            onLeave();
          },
        },
      ],
      {
        onDismiss: () => {
          leavePromptOpenRef.current = false;
        },
      }
    );
  }, []);

  useEffect(() => navigation.addListener('beforeRemove', (event: any) => {
    if (allowNavigationRef.current || !checkoutStartedRef.current) return;
    event.preventDefault();
    showLeavePaymentPrompt(() => navigation.dispatch(event.data.action));
  }), [navigation, showLeavePaymentPrompt]);

  const openRazorpay = useCallback(async () => {
    if (checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const RazorpayCheckout = loadRazorpayCheckout();

      if (!RazorpayCheckout) {
        Alert.alert('Development build required', RAZORPAY_UNAVAILABLE_MESSAGE);
        setError(RAZORPAY_UNAVAILABLE_MESSAGE);
        setLoading(false);
        return;
      }

      // TODO(App Store): If Razorpay booking payments stay enabled on iOS,
      // confirm with business/legal that these are allowed real-world one-to-one service payments.
      // Booking payment must not unlock digital subscriptions, premium content, or app-only features.
      // Step 1: Create Razorpay order on backend
      checkoutStartedRef.current = true;
      const response = await api.createCheckoutSession(bookingId);

      if (!mountedRef.current) return;

      if (!response.success || !response.data) {
        setError(`Payment session failed: ${response.message || 'Unknown error'}`);
        setLoading(false);
        return;
      }

      if (response.data.alreadyPaid === true) {
        allowNavigationRef.current = true;
        navigation.replace('BookingSuccess', { bookingId });
        return;
      }

      const { orderId, keyId, amount, currency = 'INR' } = response.data;

      if (!orderId || !keyId || !amount) {
        setError(`Payment details missing — orderId:${orderId} keyId:${keyId} amount:${amount}`);
        setLoading(false);
        return;
      }

      setLoading(false);

      // Step 3: Open Razorpay SDK
      const userName = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
        : 'User';

      const options = {
        description: 'Booking Payment',
        currency,
        key: keyId,
        amount: String(amount),
        name: 'Menorah Health',
        order_id: orderId,
        prefill: {
          email: user?.email || '',
          contact: user?.phone || '',
          name: userName,
        },
        theme: { color: colors.primary },
      };

      const paymentData = await RazorpayCheckout.open(options);

      if (!mountedRef.current) return;

      // Step 3: Verify payment with backend
      setVerifying(true);
      const verifyResponse = await api.verifyRazorpayPayment({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_signature: paymentData.razorpay_signature,
        bookingId,
      });

      if (!mountedRef.current) return;

      if (verifyResponse.success) {
        allowNavigationRef.current = true;
        navigation.replace('BookingSuccess', { bookingId });
      } else {
        setError(`Verification failed: ${verifyResponse.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      // Razorpay SDK sends code 0 or 'PayerCancelled' when user dismisses
      if (err.code === 0 || err.code === 'PayerCancelled' || err.code === 'NativePaymentCancelled') {
        setError(PAYMENT_DISMISSED_MESSAGE);
        return;
      }
      setError(err.description || err.message || 'Payment failed. Please try again.');
    } finally {
      checkoutInFlightRef.current = false;
      if (mountedRef.current) {
        setVerifying(false);
      }
    }
  }, [bookingId, user, navigation, colors.primary]);

  useEffect(() => {
    if (!bookingId) {
      setError('Booking ID is required');
      setLoading(false);
      return;
    }
    if (autoLaunchedBookingRef.current === bookingId) return;
    autoLaunchedBookingRef.current = bookingId;
    void openRazorpay();
  }, [bookingId, openRazorpay]);

  const handleLeavePayment = () => {
    showLeavePaymentPrompt(() => navigation.goBack());
  };

  if (loading) {
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

  if (verifying) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 16, color: colors.text, marginTop: 16 }}>
            Verifying payment...
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
            onPress={openRazorpay}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: primaryActionText, fontSize: 16, fontWeight: '600' }}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLeavePayment}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>Leave Payment</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Default: Razorpay SDK is open (modal visible), show a minimal background
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ fontSize: 16, color: colors.text, marginTop: 16 }}>
          Opening Razorpay...
        </Text>
      </View>
    </SafeAreaView>
  );
}
