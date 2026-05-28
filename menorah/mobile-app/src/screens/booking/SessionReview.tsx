import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Clock, ShieldCheck, Check, AlertTriangle,
  Crown, Lock, Tag, User, ChevronRight,
} from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { api } from '@/lib/api';
import subscriptionService from '@/services/subscriptionService';
import type { SessionType, TherapistGender } from '@/components/discover/SessionTypeSelector';

const SESSION_META: Record<string, { title: string; iconColor: string; iconBg: string }> = {
  basic:   { title: 'Basic Session',   iconColor: '#3B82F6', iconBg: '#DBEAFE' },
  premium: { title: 'Premium Session', iconColor: '#8B5CF6', iconBg: '#EDE9FE' },
  pro:     { title: 'Pro Session',     iconColor: '#F59E0B', iconBg: '#FEF3C7' },
};

const HERO_GREEN = '#2d5c3e';

export default function SessionReview({ navigation, route }: any) {
  const { sessionType, gender, duration, price, features } = route.params;
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();

  const [isCreatingBooking, setIsCreatingBooking]       = useState(false);
  const [hasActiveSubscription, setHasActiveSub]        = useState(false);
  const [subscriptionType, setSubType]                  = useState<string | undefined>();
  const [checkingSubscription, setCheckingSub]          = useState(true);

  const meta = SESSION_META[sessionType] ?? SESSION_META.basic;
  const genderLabel =
    gender === 'male'   ? 'Male Therapist'   :
    gender === 'female' ? 'Female Therapist' :
    'Any Therapist';

  const cardBg = isDark ? colors.surface : '#ffffff';

  useEffect(() => {
    (async () => {
      try {
        try {
          const info = await subscriptionService.getSubscriptionInfo();
          if (info.hasPremium) {
            setHasActiveSub(true);
            setSubType(info.subscriptionType);
            return;
          }
        } catch {}
        try {
          const res = await api.getSubscriptionStatus();
          if (res.success && res.data?.isActive) {
            setHasActiveSub(true);
            setSubType(res.data.subscriptionType);
            if (res.data.subscriptionType) {
              await subscriptionService.setPremiumSubscription(res.data.subscriptionType);
            }
          }
        } catch {}
      } finally {
        setCheckingSub(false);
      }
    })();
  }, []);

  const handlePayment = async () => {
    setIsCreatingBooking(true);
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      const bookingResponse = await api.createBooking({
        sessionType: 'video',
        sessionDuration: duration,
        scheduledAt: tomorrow.toISOString(),
        amount: price,
        preferences: { gender, sessionType, categoryId: sessionType },
      });

      if (bookingResponse.success && bookingResponse.data?.booking?.id) {
        const booking = bookingResponse.data.booking;
        const isSubBooking =
          (booking.paymentStatus === 'paid' && booking.isSubscriptionBooking) ||
          (hasActiveSubscription && booking.paymentMethod === 'subscription');

        if (isSubBooking) {
          navigation.replace('BookingSuccess', { bookingId: booking.id, isSubscriptionBooking: true });
        } else {
          navigation.navigate('PaymentSheet', { bookingId: booking.id, paymentMethod: 'razorpay' });
        }
      } else {
        Alert.alert('Error', bookingResponse.message || 'Failed to create booking. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Failed to create booking. Please try again.');
    } finally {
      setIsCreatingBooking(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.bg : '#f5f7f5' }}>

      {/* ── Dark green header ── */}
      <SafeAreaView style={{ backgroundColor: HERO_GREEN }} edges={['top']}>
        {/* Decorative circles */}
        <View style={{ position: 'absolute', top: -10, right: -10, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.04)' }} />
        <View style={{ position: 'absolute', top: 20, right: 20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.05)' }} />

        <View style={{
          flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingTop: 10, paddingBottom: 22,
        }}>
          {/* Left: back + title */}
          <View style={{ flex: 1, marginRight: 16 }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 12 }}>
              <ArrowLeft size={24} color="white" />
            </TouchableOpacity>
            <Text style={{ fontSize: 26, fontWeight: '900', color: 'white', letterSpacing: -0.4, marginBottom: 5 }}>
              Review & Pay
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 19 }}>
              Review your session details before{'\n'}proceeding to payment
            </Text>
          </View>

          {/* Right: Secure & Private badge */}
          <View style={{ alignItems: 'center', marginTop: 36 }}>
            <View style={{
              width: 50, height: 50, borderRadius: 25,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center', justifyContent: 'center', marginBottom: 6,
            }}>
              <ShieldCheck size={24} color="white" />
            </View>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600', textAlign: 'center' }}>
              Secure &{'\n'}Private
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Session info card ── */}
        <View style={{
          backgroundColor: cardBg, borderRadius: 20,
          padding: 18, borderWidth: 1, borderColor: isDark ? colors.border : '#e8ede8',
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
        }}>
          {/* Top: icon + title + subtitle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{
              width: 56, height: 56, borderRadius: 16,
              backgroundColor: meta.iconBg,
              alignItems: 'center', justifyContent: 'center', marginRight: 14,
            }}>
              <User size={28} color={meta.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 3 }}>
                {meta.title}
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted }}>
                {genderLabel}
                {!hasActiveSubscription ? ' (Identity revealed after payment)' : ''}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#f0f4f0', marginBottom: 16 }} />

          {/* Two-column info row */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Duration */}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: colors.primary + '14',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{duration} minutes</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>Duration</Text>
              </View>
            </View>

            {/* Vertical divider */}
            <View style={{ width: 1, height: 40, backgroundColor: isDark ? colors.border : '#e8ede8', marginHorizontal: 8 }} />

            {/* Identity / Subscription info */}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 8 }}>
              <View style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: hasActiveSubscription ? '#FEF3C7' : colors.primary + '14',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {hasActiveSubscription
                  ? <Crown size={18} color="#F59E0B" />
                  : <ShieldCheck size={18} color={colors.primary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                  {hasActiveSubscription ? 'Subscription' : 'Identity revealed'}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {hasActiveSubscription ? `${subscriptionType || 'active'} plan` : 'after payment'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── What's included card ── */}
        <View style={{
          backgroundColor: cardBg, borderRadius: 20,
          borderWidth: 1, borderColor: isDark ? colors.border : '#e8ede8',
          overflow: 'hidden',
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
        }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, padding: 18, paddingBottom: 14 }}>
            What's included:
          </Text>
          {(features as string[]).map((feature: string, i: number) => (
            <View key={i}>
              <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#f0f4f0' }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: 14 }}>
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: colors.primary,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={15} color="white" strokeWidth={2.5} />
                </View>
                <Text style={{ fontSize: 15, color: colors.text, fontWeight: '500' }}>{feature}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Total amount card ── */}
        <View style={{
          backgroundColor: cardBg, borderRadius: 20,
          padding: 18, borderWidth: 1, borderColor: isDark ? colors.border : '#e8ede8',
          flexDirection: 'row', alignItems: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
        }}>
          <View style={{ flex: 1 }}>
            {hasActiveSubscription ? (
              <>
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>Total Amount</Text>
                <Text style={{ fontSize: 30, fontWeight: '900', color: '#10B981', letterSpacing: -0.5 }}>Free</Text>
                <Text style={{ fontSize: 12, color: '#10B981', marginTop: 2 }}>Covered by subscription</Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>Total Amount</Text>
                <Text style={{ fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -0.5 }}>
                  ₹{price.toLocaleString('en-IN')}
                </Text>
              </>
            )}
          </View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: colors.primary + '12',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Tag size={20} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center' }}>Tax included</Text>
            <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center' }}>No hidden charges</Text>
          </View>
        </View>

        {/* ── Notice banner ── */}
        {hasActiveSubscription ? (
          <View style={{
            backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#dcfce7',
            borderRadius: 16, padding: 16,
            flexDirection: 'row', alignItems: 'flex-start', gap: 12,
            borderWidth: 1, borderColor: '#10B981' + '44',
          }}>
            <Check size={20} color="#10B981" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#065F46', marginBottom: 3 }}>
                Subscription Active
              </Text>
              <Text style={{ fontSize: 13, color: '#065F46', lineHeight: 19 }}>
                You can book sessions with your {subscriptionType || 'subscription'} plan. Just confirm below.
              </Text>
            </View>
          </View>
        ) : (
          <View style={{
            backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#fffbeb',
            borderRadius: 16, padding: 16,
            flexDirection: 'row', alignItems: 'flex-start', gap: 12,
            borderWidth: 1, borderColor: '#F59E0B' + '55',
          }}>
            <AlertTriangle size={20} color="#F59E0B" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 3 }}>
                Important Notice
              </Text>
              <Text style={{ fontSize: 13, color: '#92400E', lineHeight: 19 }}>
                Your therapist's identity will be revealed only after successful payment for unbiased matching.
              </Text>
            </View>
          </View>
        )}

      </ScrollView>

      {/* ── Fixed bottom CTA ── */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: isDark ? colors.bg : '#f5f7f5',
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 8,
        paddingTop: 12,
      }}>
        {checkingSubscription ? (
          <View style={{
            backgroundColor: HERO_GREEN + '80', borderRadius: 50,
            paddingVertical: 18, alignItems: 'center',
          }}>
            <ActivityIndicator size="small" color="white" />
          </View>
        ) : (
          <TouchableOpacity
            onPress={handlePayment}
            disabled={isCreatingBooking}
            activeOpacity={0.88}
            style={{
              backgroundColor: HERO_GREEN,
              borderRadius: 50, paddingVertical: 18,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingHorizontal: 24,
              opacity: isCreatingBooking ? 0.7 : 1,
            }}
          >
            {isCreatingBooking ? (
              <>
                <ActivityIndicator size="small" color="white" style={{ marginRight: 10 }} />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '800' }}>Processing...</Text>
              </>
            ) : hasActiveSubscription ? (
              <>
                <Check size={18} color="white" style={{ marginRight: 10 }} />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' }}>
                  Book Session — Free
                </Text>
                <ChevronRight size={20} color="white" />
              </>
            ) : (
              <>
                <Lock size={18} color="white" style={{ marginRight: 10 }} />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' }}>
                  Proceed to Payment · ₹{price.toLocaleString('en-IN')}
                </Text>
                <ChevronRight size={20} color="white" />
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Footer */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 10 }}>
          <ShieldCheck size={13} color={colors.muted} />
          <Text style={{ fontSize: 12, color: colors.muted }}>100% Secure Payments</Text>
        </View>
      </View>

    </View>
  );
}
