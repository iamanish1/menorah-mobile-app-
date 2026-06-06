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
        } catch (error) {
          console.warn('[SessionReview] Failed to read cached subscription info:', error);
        }
        try {
          const res = await api.getSubscriptionStatus();
          if (res.success && res.data?.isActive) {
            setHasActiveSub(true);
            setSubType(res.data.subscriptionType);
            if (res.data.subscriptionType) {
              await subscriptionService.setPremiumSubscription(res.data.subscriptionType);
            }
          }
        } catch (error) {
          console.warn('[SessionReview] Failed to fetch subscription status:', error);
        }
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
          paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16,
        }}>
          {/* Left: back + title */}
          <View style={{ flex: 1, marginRight: 12 }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 10 }}>
              <ArrowLeft size={22} color="white" />
            </TouchableOpacity>
            <Text style={{ fontSize: 22, fontWeight: '900', color: 'white', letterSpacing: -0.3, marginBottom: 4 }}>
              Review & Pay
            </Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 17 }}>
              Review your session details before{'\n'}proceeding to payment
            </Text>
          </View>

          {/* Right: Secure & Private badge */}
          <View style={{ alignItems: 'center', marginTop: 30 }}>
            <View style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center', justifyContent: 'center', marginBottom: 4,
            }}>
              <ShieldCheck size={20} color="white" />
            </View>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '600', textAlign: 'center' }}>
              Secure &{'\n'}Private
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Session info card ── */}
        <View style={{
          backgroundColor: cardBg, borderRadius: 16,
          padding: 14, borderWidth: 1, borderColor: isDark ? colors.border : '#e8ede8',
          shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
        }}>
          {/* Top: icon + title + subtitle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{
              width: 46, height: 46, borderRadius: 13,
              backgroundColor: meta.iconBg,
              alignItems: 'center', justifyContent: 'center', marginRight: 12,
            }}>
              <User size={22} color={meta.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 2 }}>
                {meta.title}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
                {genderLabel}
                {!hasActiveSubscription ? ' (Identity revealed after payment)' : ''}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#f0f4f0', marginBottom: 12 }} />

          {/* Two-column info row */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Duration */}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: colors.primary + '14',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock size={15} color={colors.primary} />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{duration} minutes</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>Duration</Text>
              </View>
            </View>

            {/* Vertical divider */}
            <View style={{ width: 1, height: 32, backgroundColor: isDark ? colors.border : '#e8ede8', marginHorizontal: 8 }} />

            {/* Identity / Subscription info */}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
              <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: hasActiveSubscription ? '#FEF3C7' : colors.primary + '14',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {hasActiveSubscription
                  ? <Crown size={15} color="#F59E0B" />
                  : <ShieldCheck size={15} color={colors.primary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                  {hasActiveSubscription ? 'Subscription' : 'Identity revealed'}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  {hasActiveSubscription ? `${subscriptionType || 'active'} plan` : 'after payment'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── What's included card ── */}
        <View style={{
          backgroundColor: cardBg, borderRadius: 16,
          borderWidth: 1, borderColor: isDark ? colors.border : '#e8ede8',
          overflow: 'hidden',
          shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
        }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text, padding: 14, paddingBottom: 10 }}>
            What{"'"}s included:
          </Text>
          {(features as string[]).map((feature: string, i: number) => (
            <View key={i}>
              <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#f0f4f0' }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, gap: 12 }}>
                <View style={{
                  width: 24, height: 24, borderRadius: 12,
                  backgroundColor: colors.primary,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={13} color="white" strokeWidth={2.5} />
                </View>
                <Text style={{ fontSize: 13, color: colors.text, fontWeight: '500' }}>{feature}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Total amount card ── */}
        <View style={{
          backgroundColor: cardBg, borderRadius: 16,
          padding: 14, borderWidth: 1, borderColor: isDark ? colors.border : '#e8ede8',
          flexDirection: 'row', alignItems: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
        }}>
          <View style={{ flex: 1 }}>
            {hasActiveSubscription ? (
              <>
                <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 3 }}>Total Amount</Text>
                <Text style={{ fontSize: 26, fontWeight: '900', color: '#10B981', letterSpacing: -0.4 }}>Free</Text>
                <Text style={{ fontSize: 11, color: '#10B981', marginTop: 2 }}>Covered by subscription</Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 3 }}>Total Amount</Text>
                <Text style={{ fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -0.4 }}>
                  ₹{price.toLocaleString('en-IN')}
                </Text>
              </>
            )}
          </View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: colors.primary + '12',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Tag size={17} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center' }}>Tax included</Text>
            <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center' }}>No hidden charges</Text>
          </View>
        </View>

        {/* ── Notice banner ── */}
        {hasActiveSubscription ? (
          <View style={{
            backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#dcfce7',
            borderRadius: 14, padding: 12,
            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            borderWidth: 1, borderColor: '#10B981' + '44',
          }}>
            <Check size={17} color="#10B981" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#065F46', marginBottom: 2 }}>
                Subscription Active
              </Text>
              <Text style={{ fontSize: 12, color: '#065F46', lineHeight: 17 }}>
                You can book sessions with your {subscriptionType || 'subscription'} plan. Just confirm below.
              </Text>
            </View>
          </View>
        ) : (
          <View style={{
            backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#fffbeb',
            borderRadius: 14, padding: 12,
            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            borderWidth: 1, borderColor: '#F59E0B' + '55',
          }}>
            <AlertTriangle size={17} color="#F59E0B" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 2 }}>
                Important Notice
              </Text>
              <Text style={{ fontSize: 12, color: '#92400E', lineHeight: 17 }}>
                Your therapist{"'"}s identity will be revealed only after successful payment for unbiased matching.
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
            paddingVertical: 15, alignItems: 'center',
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
              borderRadius: 50, paddingVertical: 15,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingHorizontal: 20,
              opacity: isCreatingBooking ? 0.7 : 1,
            }}
          >
            {isCreatingBooking ? (
              <>
                <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                <Text style={{ color: 'white', fontSize: 15, fontWeight: '800' }}>Processing...</Text>
              </>
            ) : hasActiveSubscription ? (
              <>
                <Check size={16} color="white" style={{ marginRight: 8 }} />
                <Text style={{ color: 'white', fontSize: 15, fontWeight: '800', flex: 1, textAlign: 'center' }}>
                  Book Session — Free
                </Text>
                <ChevronRight size={18} color="white" />
              </>
            ) : (
              <>
                <Lock size={16} color="white" style={{ marginRight: 8 }} />
                <Text style={{ color: 'white', fontSize: 15, fontWeight: '800', flex: 1, textAlign: 'center' }}>
                  Proceed to Payment · ₹{price.toLocaleString('en-IN')}
                </Text>
                <ChevronRight size={18} color="white" />
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Footer */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8 }}>
          <ShieldCheck size={12} color={colors.muted} />
          <Text style={{ fontSize: 11, color: colors.muted }}>100% Secure Payments</Text>
        </View>
      </View>

    </View>
  );
}
