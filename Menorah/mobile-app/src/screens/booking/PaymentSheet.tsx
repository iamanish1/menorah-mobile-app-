import { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { api } from '@/lib/api';
import { useAuth } from '@/state/useAuth';

export default function PaymentSheet({ route, navigation }: any) {
  const { bookingId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { scheme } = useThemeMode();
  const { user } = useAuth();
  const colors = palettes[scheme];

  const openRazorpay = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Create Razorpay order on backend
      const response = await api.createCheckoutSession(bookingId);

      if (!response.success || !response.data) {
        setError(response.message || 'Failed to create payment session. Please try again.');
        setLoading(false);
        return;
      }

      const { orderId, keyId, amount, currency = 'INR' } = response.data;

      if (!orderId || !keyId || !amount) {
        setError('Payment details missing. Please try again.');
        setLoading(false);
        return;
      }

      setLoading(false);

      // Step 2: Guard — native module must be available
      if (!RazorpayCheckout || typeof RazorpayCheckout.open !== 'function') {
        setError(
          'Razorpay SDK is not available in Expo Go.\n\nRun "npx expo run:android" to build a development APK with native payment support.'
        );
        return;
      }

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
        theme: { color: '#314830' },
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
        setError('Payment verification failed. Please contact support if amount was deducted.');
      }
    } catch (err: any) {
      // Razorpay SDK sends code 0 or 'PayerCancelled' when user dismisses
      if (err.code === 0 || err.code === 'PayerCancelled' || err.code === 'NativePaymentCancelled') {
        try { await api.cancelBooking(bookingId, 'Payment cancelled by user'); } catch (_) {}
        navigation.goBack();
        return;
      }
      setError(err.description || err.message || 'Payment failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  }, [bookingId, user, navigation]);

  useEffect(() => {
    if (!bookingId) {
      setError('Booking ID is required');
      setLoading(false);
      return;
    }
    openRazorpay();
  }, []);

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
            try { await api.cancelBooking(bookingId, 'Payment not completed'); } catch (_) {}
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
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Try Again</Text>
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
