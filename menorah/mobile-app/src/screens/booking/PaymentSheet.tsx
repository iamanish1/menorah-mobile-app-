import { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity, NativeModules } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { api } from '@/lib/api';
import { useAuth } from '@/state/useAuth';

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

export default function PaymentSheet({ route, navigation }: any) {
  const { bookingId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { scheme } = useThemeMode();
  const { user } = useAuth();
  const colors = palettes[scheme];
  const primaryActionText = scheme === 'dark' ? colors.primaryDark : 'white';

  const openRazorpay = useCallback(async () => {
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
      const response = await api.createCheckoutSession(bookingId);

      if (!response.success || !response.data) {
        setError(`Payment session failed: ${response.message || 'Unknown error'}`);
        setLoading(false);
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

      // Step 3: Verify payment with backend
      setVerifying(true);
      const verifyResponse = await api.verifyRazorpayPayment({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_signature: paymentData.razorpay_signature,
        bookingId,
      });

      if (verifyResponse.success) {
        navigation.replace('BookingSuccess', { bookingId });
      } else {
        setError(`Verification failed: ${verifyResponse.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      // Razorpay SDK sends code 0 or 'PayerCancelled' when user dismisses
      if (err.code === 0 || err.code === 'PayerCancelled' || err.code === 'NativePaymentCancelled') {
        try {
          await api.cancelBooking(bookingId, 'Payment cancelled by user');
        } catch (cancelError) {
          console.warn('Failed to cancel booking after payment cancellation:', cancelError);
        }
        navigation.goBack();
        return;
      }
      setError(err.description || err.message || 'Payment failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  }, [bookingId, user, navigation, colors.primary]);

  useEffect(() => {
    if (!bookingId) {
      setError('Booking ID is required');
      setLoading(false);
      return;
    }
    openRazorpay();
  }, [bookingId, openRazorpay]);

  const handleCancel = () => {
    Alert.alert(
      'Cancel Payment',
      'Are you sure? Your booking will be cancelled.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.cancelBooking(bookingId, 'Payment not completed');
            } catch (cancelError) {
              console.warn('Failed to cancel booking after incomplete payment:', cancelError);
            }
            navigation.goBack();
          },
        },
      ]
    );
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
          <TouchableOpacity onPress={handleCancel}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>Cancel Booking</Text>
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
