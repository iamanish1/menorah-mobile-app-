import { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CalendarPlus, CalendarCheck, CheckCircle, Calendar, Clock,
  User, ShieldCheck, Heart, ChevronRight, MapPin,
} from "lucide-react-native";
import { Image } from "expo-image";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { api, Booking } from "@/lib/api";
import { socketService } from "@/lib/socket";

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: "Trusted & Secure",     sub: "Your privacy is our priority" },
  { icon: User,        label: "Verified Experts",      sub: "Connect with qualified counsellors" },
  { icon: Clock,       label: "Flexible Scheduling",   sub: "Choose a time that works for you" },
  { icon: Heart,       label: "Better Together",       sub: "We're here to support you" },
];

export default function Bookings({ navigation }: any) {
  const [activeTab, setActiveTab]   = useState<'upcoming' | 'completed'>('upcoming');
  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  useEffect(() => { fetchBookings(); }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const refresh = () => fetchBookings();
    const u1 = socketService.onBookingConfirmed(refresh);
    const u2 = socketService.onBookingRescheduled(refresh);
    const u3 = socketService.onBookingStatusChanged(refresh);
    return () => { u1(); u2(); u3(); };
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const status = activeTab === 'upcoming' ? 'pending,confirmed' : 'completed';
      const res = await api.getBookings({ status, page: 1, limit: 50 });
      setBookings(res.success && res.data ? res.data.bookings || [] : []);
    } catch {
      Alert.alert('Error', 'Failed to load bookings. Please try again.');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => { setRefreshing(true); await fetchBookings(); setRefreshing(false); };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': case 'pending': return colors.primary;
      case 'completed':  return '#10B981';
      case 'cancelled':  return '#EF4444';
      case 'in-progress': return '#F59E0B';
      default: return colors.muted;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'confirmed':   return 'Upcoming';
      case 'pending':     return 'Pending';
      case 'completed':   return 'Completed';
      case 'cancelled':   return 'Cancelled';
      case 'in-progress': return 'In Progress';
      default: return status;
    }
  };

  const handleJoinSession = async (booking: Booking) => {
    try {
      if (booking.sessionType === 'video') {
        navigation.navigate('PreCallCheck', { bookingId: booking.id });
      } else if (booking.sessionType === 'audio') {
        navigation.navigate('PreCallCheck', { bookingId: booking.id });
      } else {
        navigation.navigate('ChatThread', { roomId: booking.id });
      }
    } catch {
      Alert.alert('Error', 'Failed to join session. Please try again.');
    }
  };

  const upcomingBookings  = bookings.filter(b => ['confirmed','pending','in-progress'].includes(b.status));
  const completedBookings = bookings.filter(b => b.status === 'completed');
  const displayBookings   = activeTab === 'upcoming' ? upcomingBookings : completedBookings;

  const cardBg = scheme === 'dark' ? colors.surface : colors.card;
  const trustBg = scheme === 'dark' ? colors.surface : '#f8fdf9';
  const bannerBg = scheme === 'dark' ? '#1a2e22' : '#edf7f1';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ── Header ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 30, fontWeight: '900', color: colors.text, letterSpacing: -0.5 }}>
              My Bookings
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>
              Manage your sessions and appointments
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('GenderSelection')}
            style={{
              width: 46, height: 46, borderRadius: 23,
              backgroundColor: scheme === 'dark' ? colors.surface : '#edf7f1',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: colors.border,
            }}
          >
            <CalendarPlus size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Tab Toggle ── */}
        <View style={{
          marginHorizontal: 20, marginBottom: 20,
          flexDirection: 'row',
          backgroundColor: scheme === 'dark' ? colors.surface : '#f1f5f9',
          borderRadius: 50, padding: 4,
          borderWidth: 1, borderColor: colors.border,
        }}>
          {(['upcoming', 'completed'] as const).map((tab) => {
            const active = activeTab === tab;
            const Icon = tab === 'upcoming' ? CalendarCheck : CheckCircle;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 7, paddingVertical: 11, borderRadius: 50,
                  backgroundColor: active ? colors.primary : 'transparent',
                }}
              >
                <Icon size={16} color={active ? 'white' : colors.muted} />
                <Text style={{
                  fontSize: 15, fontWeight: '700',
                  color: active ? 'white' : colors.muted,
                }}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Content ── */}
        {loading ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : displayBookings.length > 0 ? (
          <View style={{ paddingHorizontal: 20 }}>
            {displayBookings.map((booking) => (
              <TouchableOpacity
                key={booking.id}
                onPress={() => navigation.navigate('BookingReview', { bookingId: booking.id })}
                activeOpacity={0.88}
                style={{
                  backgroundColor: cardBg, borderRadius: 20, padding: 16,
                  marginBottom: 14, borderWidth: 1, borderColor: colors.border,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: scheme === 'dark' ? 0.15 : 0.05, shadowRadius: 8, elevation: 2,
                }}
              >
                {/* Counsellor row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                  {booking.counsellorImage ? (
                    <Image source={{ uri: booking.counsellorImage }} style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <User size={22} color={colors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.cardText }}>
                      {booking.counsellorName && booking.counsellorName !== 'To be assigned'
                        ? booking.counsellorName : 'Awaiting Assignment'}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                      {booking.specialization || 'Counsellor will be assigned soon'}
                    </Text>
                  </View>
                  <View style={{
                    backgroundColor: getStatusColor(booking.status) + '18',
                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: getStatusColor(booking.status) }}>
                      {getStatusLabel(booking.status)}
                    </Text>
                  </View>
                </View>

                {/* Meta row */}
                <View style={{ flexDirection: 'row', gap: 16, marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center' }}>
                      <Calendar size={13} color={colors.primary} />
                    </View>
                    <Text style={{ fontSize: 12, color: colors.muted }}>Instant session</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center' }}>
                      <MapPin size={13} color={colors.primary} />
                    </View>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      Online · {booking.sessionType.charAt(0).toUpperCase() + booking.sessionType.slice(1)}
                    </Text>
                  </View>
                </View>

                {/* Action buttons */}
                {(booking.status === 'in-progress' || (booking.status === 'confirmed' && booking.counsellorName && booking.counsellorName !== 'To be assigned')) && (
                  <TouchableOpacity
                    onPress={() => handleJoinSession(booking)}
                    style={{
                      backgroundColor: booking.status === 'in-progress' ? colors.primary : '#F59E0B',
                      paddingVertical: 11, borderRadius: 14, alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: 'white', fontSize: 14, fontWeight: '700' }}>
                      {booking.status === 'in-progress' ? 'Join Now' : 'Ready to Join'}
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          /* ── Empty state ── */
          <View style={{ paddingHorizontal: 16 }}>
            <View style={{
              backgroundColor: cardBg, borderRadius: 24,
              paddingTop: 32, paddingHorizontal: 24, paddingBottom: 24,
              alignItems: 'center', borderWidth: 1, borderColor: colors.border,
              marginBottom: 16,
            }}>
              {/* Illustration */}
              <View style={{ width: 140, height: 140, marginBottom: 28, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: 120, height: 120, borderRadius: 60,
                  backgroundColor: colors.primary + '10',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <View style={{
                    width: 82, height: 82, borderRadius: 41,
                    backgroundColor: colors.primary + '1C',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Calendar size={38} color={colors.primary} />
                  </View>
                </View>
                {/* Clock badge */}
                <View style={{
                  position: 'absolute', bottom: 6, right: 6,
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: scheme === 'dark' ? colors.surface : 'white',
                  borderWidth: 2, borderColor: colors.primary + '28',
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
                }}>
                  <Clock size={17} color={colors.primary} />
                </View>
              </View>

              <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 10, letterSpacing: -0.3, textAlign: 'center' }}>
                {activeTab === 'upcoming' ? 'No upcoming bookings' : 'No completed sessions'}
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
                {activeTab === 'upcoming'
                  ? "You don't have any upcoming sessions.\nBook your first session to get started on\nyour mental well-being journey."
                  : "Your completed sessions will appear here once you finish a therapy session."}
              </Text>

              {activeTab === 'upcoming' && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('GenderSelection')}
                  activeOpacity={0.88}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    backgroundColor: colors.primary,
                    paddingVertical: 15,
                    borderRadius: 50, width: '100%', justifyContent: 'center',
                  }}
                >
                  <Calendar size={18} color="white" />
                  <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>Book a Session</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Trust features grid */}
            <View style={{
              backgroundColor: trustBg, borderRadius: 20, padding: 16,
              borderWidth: 1, borderColor: colors.border, marginBottom: 14,
            }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {TRUST_ITEMS.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <View key={i} style={{ width: '50%', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8 }}>
                      <View style={{
                        width: 48, height: 48, borderRadius: 24,
                        backgroundColor: colors.primary + '14',
                        alignItems: 'center', justifyContent: 'center', marginBottom: 8,
                      }}>
                        <Icon size={22} color={colors.primary} />
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 3 }}>
                        {item.label}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 16 }}>
                        {item.sub}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Consistency banner */}
            <TouchableOpacity
              activeOpacity={0.88}
              style={{
                backgroundColor: bannerBg, borderRadius: 18, padding: 16,
                flexDirection: 'row', alignItems: 'center', gap: 14,
                borderWidth: 1, borderColor: colors.primary + '28',
              }}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: colors.primary + '18',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <CalendarCheck size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 2 }}>
                  Consistent sessions. Better results.
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
                  Stay consistent and take small steps every day.
                </Text>
              </View>
              <ChevronRight size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
