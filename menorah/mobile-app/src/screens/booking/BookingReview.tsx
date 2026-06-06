import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, Clock, User, Shield, CheckCircle, Video, MessageCircle, ArrowLeft, ShieldCheck, CalendarCheck, ChevronRight, Wallet } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { api } from '@/lib/api';
import { socketService, SessionStartedData } from '@/lib/socket';

// Price categories mapping
const PRICE_CATEGORIES = {
  basic: {
    title: 'Basic Session',
    price: 1000,
    duration: 45,
    features: ['General counselling', 'Email support', 'Standard session']
  },
  premium: {
    title: 'Premium Session',
    price: 2000,
    duration: 60,
    features: ['Specialized therapy', 'Priority support', 'Follow-up session', 'Extended consultation']
  },
  elite: {
    title: 'Elite Session',
    price: 5000,
    duration: 90,
    features: ['Expert therapy', '24/7 support', 'Multiple follow-ups', 'Personalized care plan', 'Premium experience']
  }
};

export default function BookingReview({ navigation, route }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const selectedDate = 'tomorrow';
  const selectedTime = '10:00 AM';
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [loadingBooking, setLoadingBooking] = useState(false);
  const [existingBooking, setExistingBooking] = useState<any>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const { categoryId, gender, price, bookingId, counsellorId, counsellorName, sessionType: directSessionType, sessionDuration: directDuration, scheduledAt: directScheduledAt, hourlyRate } = route.params || {};

  // If bookingId is provided, fetch existing booking details
  useEffect(() => {
    if (bookingId && !categoryId) {
      fetchBookingDetails();
    }
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time updates: refresh when counsellor assigns, reschedules, or starts session
  useEffect(() => {
    if (!bookingId || categoryId) return;
    const refresh = () => fetchBookingDetails();
    const unsub1 = socketService.onBookingConfirmed((data) => {
      if (data.bookingId === bookingId) refresh();
    });
    const unsub2 = socketService.onBookingRescheduled((data) => {
      if (data.bookingId === bookingId) refresh();
    });
    const unsub3 = socketService.onBookingStatusChanged((data) => {
      if (data.bookingId === bookingId) refresh();
    });
    const unsub4 = socketService.onSessionStarted((data: SessionStartedData) => {
      if (data.bookingId === bookingId) {
        setSessionReady(true);
        refresh();
      }
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [bookingId, categoryId]); // eslint-disable-line react-hooks/exhaustive-deps
  
  const fetchBookingDetails = async () => {
    if (!bookingId) return;
    
    setLoadingBooking(true);
    try {
      const response = await api.getBooking(bookingId);
      if (response.success && response.data?.booking) {
        setExistingBooking(response.data.booking);
      } else {
        Alert.alert('Error', 'Failed to load booking details. Please try again.');
        navigation.goBack();
      }
    } catch (error: any) {
      console.error('Error fetching booking:', error);
      Alert.alert('Error', 'Failed to load booking details. Please try again.');
      navigation.goBack();
    } finally {
      setLoadingBooking(false);
    }
  };
  
  // If viewing existing booking, show different UI
  if (bookingId && !categoryId) {
    if (loadingBooking) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 16, marginTop: 16 }}>
              Loading booking details...
            </Text>
          </View>
        </SafeAreaView>
      );
    }
    
    if (!existingBooking) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Text style={{ color: colors.text, fontSize: 16, textAlign: 'center' }}>
              Booking not found. Please try again.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 8,
                marginTop: 16
              }}
            >
              <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
                Go Back
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    
    const isAssigned = existingBooking.counsellorName && existingBooking.counsellorName !== 'To be assigned';
    const canJoin = existingBooking.status === 'in-progress' || sessionReady;
    const isConfirmedWithCounsellor = existingBooking.status === 'confirmed' && isAssigned;
    const isPending = existingBooking.status === 'pending' || !isAssigned;

    const statusColors: Record<string, string> = {
      pending: '#F59E0B',
      confirmed: colors.primary,
      'in-progress': '#10B981',
      completed: '#6B7280',
      cancelled: '#EF4444',
    };
    const statusColor = statusColors[existingBooking.status] || colors.muted;

    const handleJoinSession = () => {
      if (existingBooking.sessionType === 'video') {
        navigation.navigate('PreCallCheck', { bookingId });
      } else if (existingBooking.sessionType === 'chat') {
        navigation.navigate('ChatThread', { roomId: bookingId });
      } else {
        navigation.navigate('PreCallCheck', { bookingId });
      }
    };

    const isDark = scheme === 'dark';
    const cardBg = isDark ? colors.surface : 'white';
    const pageBg = isDark ? colors.bg : '#f5f7f5';

    const statusLabel = existingBooking.status === 'in-progress' ? 'In Progress'
      : existingBooking.status.charAt(0).toUpperCase() + existingBooking.status.slice(1);

    const statusDescriptions: Record<string, string> = {
      confirmed: "Your session is all set. We're looking forward to your session.",
      pending: 'Your booking is pending. A counsellor will be assigned soon.',
      'in-progress': 'Your session is currently in progress. You can join now.',
      completed: 'Your session has been completed. Thank you for choosing us!',
      cancelled: 'Your session has been cancelled.',
    };
    const statusDescription = statusDescriptions[existingBooking.status] || '';

    const sessionTypeLabel = existingBooking.sessionType === 'video' ? 'Video Session'
      : existingBooking.sessionType === 'audio' ? 'Audio Session' : 'Chat Session';

    let scheduledDateStr = '';
    let scheduledTimeStr = '';
    if (existingBooking.scheduledAt) {
      const d = new Date(existingBooking.scheduledAt);
      scheduledDateStr = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
      scheduledTimeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }

    const paymentStatusColorMap: Record<string, string> = {
      paid: '#10B981', pending: '#F59E0B', failed: '#EF4444', refunded: '#6B7280',
    };
    const paymentColor = paymentStatusColorMap[existingBooking.paymentStatus] || colors.muted;
    const paymentLabel = existingBooking.paymentStatus
      ? existingBooking.paymentStatus.charAt(0).toUpperCase() + existingBooking.paymentStatus.slice(1)
      : 'Pending';

    const showJoinButton = canJoin || isConfirmedWithCounsellor;

    return (
      <View style={{ flex: 1, backgroundColor: pageBg }}>

        {/* Header */}
        <SafeAreaView style={{ backgroundColor: cardBg }} edges={['top']}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 }}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}
            >
              <ArrowLeft size={17} color={colors.primary} style={{ marginRight: 5 }} />
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.3 }}>
              Booking Details
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>
              Here is everything about your session
            </Text>
          </View>
        </SafeAreaView>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: showJoinButton ? 96 : 32 }}
          showsVerticalScrollIndicator={false}
        >

          {/* Status Card */}
          <View style={{
            backgroundColor: isDark ? colors.surface : '#f0faf4',
            borderRadius: 20, padding: 18, marginBottom: 14,
            borderWidth: 1, borderColor: isDark ? colors.border : '#d1eedd',
            overflow: 'hidden',
          }}>
            <Text style={{ position: 'absolute', top: 14, right: 46, color: '#b8ddc8', fontSize: 22, fontWeight: '300' }}>+</Text>
            <Text style={{ position: 'absolute', top: 30, right: 22, color: '#b8ddc8', fontSize: 16, fontWeight: '300' }}>+</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: statusColor + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <ShieldCheck size={22} color={statusColor} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 12, color: colors.muted }}>Status</Text>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: statusColor, letterSpacing: -0.3 }}>{statusLabel}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>{statusDescription}</Text>
              </View>
              <View style={{
                width: 60, height: 60, borderRadius: 16, marginLeft: 12,
                backgroundColor: statusColor + '18',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <CalendarCheck size={28} color={statusColor} />
              </View>
            </View>
          </View>

          {/* Counsellor Card */}
          <View style={{
            backgroundColor: cardBg, borderRadius: 20, padding: 16, marginBottom: 14,
            borderWidth: 1, borderColor: isDark ? colors.border : '#e8ede8',
            flexDirection: 'row', alignItems: 'center',
          }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <User size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 2 }}>Counsellor</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                {isAssigned ? existingBooking.counsellorName : 'Awaiting Assignment'}
              </Text>
              {existingBooking.specialization ? (
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 1 }}>{existingBooking.specialization}</Text>
              ) : !isAssigned ? (
                <Text style={{ fontSize: 12, color: '#F59E0B', marginTop: 2 }}>Will be assigned soon</Text>
              ) : null}
            </View>
            {isAssigned && (
              <TouchableOpacity
                onPress={() => navigation.navigate('ChatThread', { roomId: bookingId })}
                style={{ alignItems: 'center' }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center', marginBottom: 3 }}>
                  <MessageCircle size={20} color={colors.primary} />
                </View>
                <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>Message</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Session Details Card */}
          <View style={{
            backgroundColor: cardBg, borderRadius: 20, padding: 16, marginBottom: 14,
            borderWidth: 1, borderColor: isDark ? colors.border : '#e8ede8',
          }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 14, letterSpacing: -0.2 }}>
              Session Details
            </Text>

            {/* Type + Duration */}
            <View style={{ flexDirection: 'row', marginBottom: 14 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Video size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Type</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{sessionTypeLabel}</Text>
                </View>
              </View>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Clock size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Duration</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{existingBooking.sessionDuration || 45} min</Text>
                </View>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#f0f4f0', marginBottom: 14 }} />

            {/* Scheduled */}
            {existingBooking.scheduledAt ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <Calendar size={18} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 12, color: colors.muted }}>Scheduled</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{scheduledDateStr}</Text>
                    <Text style={{ fontSize: 13, color: colors.muted }}>{scheduledTimeStr}</Text>
                  </View>
                </View>
                <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#f0f4f0', marginBottom: 14 }} />
              </>
            ) : null}

            {/* Amount + Payment */}
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Wallet size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Amount</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                    {existingBooking.isSubscriptionBooking ? 'Free' : `₹${Number(existingBooking.amount || 0).toLocaleString('en-IN')}`}
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: paymentColor + '14', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <CheckCircle size={18} color={paymentColor} />
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Payment</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: paymentColor }}>{paymentLabel}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Ready to Join / In Progress Banner */}
          {(canJoin || isConfirmedWithCounsellor) && (
            <TouchableOpacity
              onPress={handleJoinSession}
              activeOpacity={0.88}
              style={{
                backgroundColor: isDark ? '#1c1500' : '#fff7ed',
                borderRadius: 18, padding: 16, marginBottom: 14,
                flexDirection: 'row', alignItems: 'center',
                borderWidth: 1, borderColor: '#fde68a',
              }}
            >
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                <Video size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#D97706', marginBottom: 2 }}>
                  {canJoin ? 'Join Now' : 'Ready to Join'}
                </Text>
                <Text style={{ fontSize: 12, color: '#92400E', lineHeight: 17 }}>
                  {canJoin ? 'Your session is in progress.' : 'Waiting for counsellor to join.'}
                </Text>
              </View>
              <ChevronRight size={18} color="#D97706" />
            </TouchableOpacity>
          )}

          {/* Pending Banner */}
          {isPending && existingBooking.status === 'pending' && (
            <View style={{
              backgroundColor: isDark ? '#1c1500' : '#fffbeb',
              borderRadius: 18, padding: 14, marginBottom: 14,
              borderWidth: 1, borderColor: '#fde68a',
              flexDirection: 'row', alignItems: 'center',
            }}>
              <ActivityIndicator size="small" color="#D97706" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#D97706', marginBottom: 2 }}>
                  Waiting for assignment...
                </Text>
                <Text style={{ fontSize: 12, color: '#92400E', lineHeight: 17 }}>
                  You will be notified when a counsellor accepts
                </Text>
              </View>
            </View>
          )}

          {/* Secure Footer */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
            <ShieldCheck size={13} color={colors.muted} style={{ marginRight: 5 }} />
            <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '500' }}>Secure & Confidential</Text>
          </View>
          <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 2 }}>
            Your privacy is our priority.
          </Text>

        </ScrollView>

        {/* Fixed Bottom CTA */}
        {showJoinButton && (
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            paddingHorizontal: 16, paddingBottom: 24, paddingTop: 12,
            backgroundColor: pageBg,
          }}>
            <TouchableOpacity
              onPress={handleJoinSession}
              activeOpacity={0.9}
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 16, borderRadius: 50,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Video size={20} color="white" style={{ marginRight: 10 }} />
              <Text style={{ color: 'white', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 }}>
                Join Session
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </View>
    );
  }
  
  // Direct counsellor booking flow (from CounsellorProfile)
  if (counsellorId && !bookingId && !categoryId) {
    const displayAmount = hourlyRate || 0;
    const displayDuration = directDuration || 60;
    const displayDate = directScheduledAt
      ? new Date(directScheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : 'To be confirmed';

    const handleConfirmDirectBooking = () => {
      Alert.alert(
        'Confirm Booking',
        `Book a ${displayDuration}-min session with ${counsellorName} for ₹${displayAmount}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: async () => {
              setIsCreatingBooking(true);
              try {
                const scheduledAt = directScheduledAt || (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(10, 0, 0, 0);
                  return d.toISOString();
                })();

                const bookingResponse = await api.createBooking({
                  counsellorId,
                  sessionType: directSessionType || 'video',
                  sessionDuration: displayDuration,
                  scheduledAt,
                  amount: displayAmount,
                });

                if (bookingResponse.success && bookingResponse.data?.booking?.id) {
                  navigation.navigate('PaymentSheet', {
                    bookingId: bookingResponse.data.booking.id,
                    paymentMethod: 'razorpay',
                  });
                } else {
                  Alert.alert('Error', bookingResponse.message || 'Failed to create booking. Please try again.');
                }
              } catch (error: any) {
                console.error('Error creating direct booking:', error);
                Alert.alert('Error', 'Failed to create booking. Please try again.');
              } finally {
                setIsCreatingBooking(false);
              }
            },
          },
        ]
      );
    };

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1 }}>
          <View style={{ backgroundColor: '#314830', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 12 }}>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>← Back</Text>
            </TouchableOpacity>
            <Text style={{ color: 'white', fontSize: 22, fontWeight: '700' }}>Review Booking</Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 4 }}>
              Confirm your session details
            </Text>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
            <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>
                Counsellor
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{counsellorName}</Text>
            </View>

            <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 14 }}>
              <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Session Details
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>Type</Text>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', textTransform: 'capitalize' }}>
                  {directSessionType || 'Video'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>Duration</Text>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{displayDuration} minutes</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>Scheduled</Text>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{displayDate}</Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.muted, fontSize: 16 }}>Total</Text>
                <Text style={{ color: colors.primary, fontSize: 20, fontWeight: '700' }}>₹{displayAmount}</Text>
              </View>
            </View>
          </ScrollView>

          <View style={{ padding: 20, paddingBottom: 32 }}>
            <TouchableOpacity
              onPress={handleConfirmDirectBooking}
              disabled={isCreatingBooking}
              style={{
                backgroundColor: isCreatingBooking ? colors.muted : colors.primary,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              {isCreatingBooking ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>Confirm & Pay ₹{displayAmount}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Original booking creation flow
  if (!categoryId || !gender || !price) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: colors.text, fontSize: 16, textAlign: 'center' }}>
            Invalid booking parameters. Please try again.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 8,
              marginTop: 16
            }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const category = PRICE_CATEGORIES[categoryId as keyof typeof PRICE_CATEGORIES];
  const genderText = gender === 'male' ? 'Male' : 'Female';

  const handleConfirmBooking = () => {
    Alert.alert(
      'Confirm Booking',
      `Are you sure you want to book a ${category.title} with a ${genderText.toLowerCase()} therapist for ₹${price}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setIsCreatingBooking(true);
            try {
              // Create booking first (without counsellor - will be assigned after payment)
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              tomorrow.setHours(10, 0, 0, 0);
              
              // Build booking data, omitting undefined values
              const bookingData: any = {
                sessionType: 'video', // Default to video session
                sessionDuration: category.duration,
                scheduledAt: tomorrow.toISOString(),
                amount: price,
                preferences: {
                  gender: gender,
                  sessionType: categoryId,
                  categoryId: categoryId
                }
              };
              // Only include counsellorId if it has a value (not undefined)
              // Since we're not providing a counsellor, we omit it entirely
              
              const bookingResponse = await api.createBooking(bookingData);

              if (bookingResponse.success && bookingResponse.data?.booking?.id) {
                // Navigate to payment screen with bookingId
                navigation.navigate("PaymentSheet", {
                  bookingId: bookingResponse.data.booking.id,
                  paymentMethod: 'razorpay'
                });
              } else {
                Alert.alert('Error', bookingResponse.message || 'Failed to create booking. Please try again.');
              }
            } catch (error: any) {
              console.error('Error creating booking:', error);
              Alert.alert('Error', 'Failed to create booking. Please try again.');
            } finally {
              setIsCreatingBooking(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
        {/* Header */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.cardText, marginBottom: 8 }}>
            Review Your Session
          </Text>
          <Text style={{ fontSize: 16, color: colors.muted, lineHeight: 22 }}>
            Review your session details before proceeding to payment
          </Text>
        </View>

        {/* Session Details Card */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{
              backgroundColor: colors.primary + '20',
              borderRadius: 12,
              padding: 12,
              marginRight: 16
            }}>
              <User size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.cardText, marginBottom: 4 }}>
                {category.title}
              </Text>
              <Text style={{ fontSize: 16, color: colors.muted }}>
                {genderText} Therapist
              </Text>
            </View>
          </View>

          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Clock size={16} color={colors.muted} />
              <Text style={{ fontSize: 14, color: colors.cardText, marginLeft: 8 }}>
                {category.duration} minutes session
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Calendar size={16} color={colors.muted} />
              <Text style={{ fontSize: 14, color: colors.cardText, marginLeft: 8 }}>
                {selectedDate} at {selectedTime}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Shield size={16} color={colors.muted} />
              <Text style={{ fontSize: 14, color: colors.cardText, marginLeft: 8 }}>
                Therapist identity revealed after payment
              </Text>
            </View>
          </View>

          {/* Features */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.cardText, marginBottom: 12 }}>
              What is included:
            </Text>
            {category.features.map((feature, index) => (
              <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <CheckCircle size={16} color={colors.primary} />
                <Text style={{ fontSize: 14, color: colors.cardText, marginLeft: 12, flex: 1 }}>
                  {feature}
                </Text>
              </View>
            ))}
          </View>

          {/* Price */}
          <View style={{
            backgroundColor: colors.primary + '10',
            borderRadius: 12,
            padding: 16,
            alignItems: 'center'
          }}>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 4 }}>
              Total Amount
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary }}>
              ₹{price}
            </Text>
          </View>
        </View>

        {/* Important Notice */}
        <View style={{
          backgroundColor: '#FEF3C7',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: '#F59E0B'
        }}>
          <Text style={{ fontSize: 14, color: '#92400E', fontWeight: '600', marginBottom: 8 }}>
            ⚠️ Important Notice
          </Text>
          <Text style={{ fontSize: 14, color: '#92400E', lineHeight: 20 }}>
            Your support provider identity will be revealed only after successful payment. This supports unbiased matching based on your preferences.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 12 }}>
          <TouchableOpacity
            onPress={handleConfirmBooking}
            disabled={isCreatingBooking}
            style={{
              backgroundColor: isCreatingBooking ? colors.muted : colors.primary,
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
              opacity: isCreatingBooking ? 0.6 : 1,
            }}
          >
            {isCreatingBooking ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                  Creating Booking...
                </Text>
              </View>
            ) : (
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                Confirm & Proceed to Payment
              </Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: 'transparent',
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Text style={{ color: colors.cardText, fontSize: 16, fontWeight: '600' }}>
              Back to Selection
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
