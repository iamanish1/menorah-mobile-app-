import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  ArrowLeft, Star, MessageCircle, CalendarDays, Heart, Share2,
  IndianRupee, BadgeCheck, ShieldCheck, Brain, Users, Lock,
} from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { api, Counsellor } from '@/lib/api';

const { width } = Dimensions.get('window');
const HERO_GREEN = '#2d5c3e';

function generateDates(n = 30): Date[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i); return d;
  });
}

const ALL_SLOTS = [
  '08:00','09:00','10:00','11:00','12:00','13:00',
  '14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00',
];

function fmt(t: string) {
  const h = parseInt(t); const h12 = h % 12 || 12;
  return `${h12}:00 ${h < 12 ? 'AM' : 'PM'}`;
}
function isPast(date: Date, t: string) {
  const [h] = t.split(':').map(Number);
  const s = new Date(date); s.setHours(h, 0, 0, 0);
  return s <= new Date();
}

const WHY_ITEMS = [
  { Icon: ShieldCheck, title: 'Safe & Confidential',   sub: 'Your privacy is my priority.' },
  { Icon: Users,       title: 'Personalized Support',  sub: 'Sessions tailored to your needs.' },
  { Icon: Brain,       title: 'Evidence Based',         sub: 'Approaches that help you grow.' },
];

export default function CounsellorProfile({ navigation, route }: any) {
  const { counsellorId } = route.params || {};
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();

  const [counsellor, setCounsellor]   = useState<Counsellor | null>(null);
  const [loading, setLoading]         = useState(true);
  const [isFav, setIsFav]             = useState(false);
  const [dateIdx, setDateIdx]         = useState(0);
  const [selectedTime, setTime]       = useState<string | null>(null);
  const [showAllSlots, setShowAll]    = useState(false);

  const dates = useMemo(() => generateDates(30), []);
  const selectedDate = dates[dateIdx];

  useEffect(() => { if (counsellorId) load(); }, [counsellorId]);
  useEffect(() => { setTime(null); setShowAll(false); }, [dateIdx]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getCounsellor(counsellorId);
      if (res.success && res.data) setCounsellor(res.data.counsellor);
      else { Alert.alert('Error', 'Failed to load profile.'); navigation.goBack(); }
    } catch { Alert.alert('Error', 'Failed to load profile.'); navigation.goBack(); }
    finally { setLoading(false); }
  };

  const handleBook = () => {
    if (!selectedTime) { Alert.alert('Select Time', 'Please pick a time slot first.'); return; }
    const [h] = selectedTime.split(':').map(Number);
    const at = new Date(selectedDate); at.setHours(h, 0, 0, 0);
    navigation.navigate('BookingReview', {
      counsellorId: counsellor?.id,
      counsellorName: counsellor?.name,
      sessionType: 'video',
      sessionDuration: counsellor?.sessionDuration || 60,
      scheduledAt: at.toISOString(),
      hourlyRate: counsellor?.hourlyRate || 0,
      currency: counsellor?.currency || 'INR',
    });
  };

  const handleMessage = () => {
    navigation.navigate('ChatThread', { counsellorId: counsellor?.id });
  };

  const visibleSlots = showAllSlots ? ALL_SLOTS : ALL_SLOTS.filter(t => !isPast(selectedDate, t)).slice(0, 4);
  const hasMore = !showAllSlots && ALL_SLOTS.filter(t => !isPast(selectedDate, t)).length > 4;

  const price = counsellor ? `₹${(counsellor.hourlyRate || 0).toLocaleString('en-IN')}` : '₹0';

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.bg : '#f5f7f5' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ─────────────── HERO ─────────────── */}
        <View style={{ backgroundColor: HERO_GREEN, paddingBottom: 24, paddingTop: insets.top }}>

          {/* Decorative circles top-right */}
          <View style={{ position: 'absolute', top: -20, right: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.04)' }} />
          <View style={{ position: 'absolute', top: 20, right: 20, width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.05)' }} />

          {/* Top bar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16,
          }}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
            >
              <ArrowLeft size={20} color="white" />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setIsFav(!isFav)}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Heart size={19} color={isFav ? '#ef4444' : 'white'} fill={isFav ? '#ef4444' : 'transparent'} />
              </TouchableOpacity>
              <TouchableOpacity
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Share2 size={19} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="white" />
            </View>
          ) : counsellor ? (
            <View style={{ paddingHorizontal: 16 }}>

              {/* Avatar + info */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 }}>
                {/* Avatar */}
                <View style={{ position: 'relative', marginRight: 16 }}>
                  {counsellor.profileImage ? (
                    <Image
                      source={{ uri: counsellor.profileImage }}
                      style={{ width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)' }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{
                      width: 90, height: 90, borderRadius: 45,
                      borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)',
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 32, fontWeight: '800', color: 'white' }}>
                        {counsellor.name?.charAt(0)?.toUpperCase() || 'C'}
                      </Text>
                    </View>
                  )}
                  {counsellor.isAvailable && (
                    <View style={{
                      position: 'absolute', bottom: 4, right: 4,
                      width: 18, height: 18, borderRadius: 9,
                      backgroundColor: '#22c55e', borderWidth: 3, borderColor: HERO_GREEN,
                    }} />
                  )}
                </View>

                {/* Name / specialty / rating */}
                <View style={{ flex: 1, paddingTop: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: 'white', letterSpacing: -0.3 }} numberOfLines={1}>
                      {counsellor.name}
                    </Text>
                    {counsellor.isAvailable && (
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: 'rgba(255,255,255,0.18)',
                        paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
                      }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80' }} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: 'white' }}>Available</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.80)', marginBottom: 8 }} numberOfLines={1}>
                    {counsellor.specialization || 'Counsellor'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Star size={15} color="#FFD700" fill="#FFD700" />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>
                      {counsellor.rating?.toFixed(1) ?? '0.0'}
                    </Text>
                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                      ({counsellor.reviewCount || 0} reviews)
                    </Text>
                  </View>
                </View>
              </View>

              {/* Stats bar */}
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: 'rgba(0,0,0,0.20)',
                borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8,
                marginBottom: 18,
              }}>
                {[
                  { Icon: IndianRupee, value: `₹${(counsellor.hourlyRate || 0).toLocaleString('en-IN')}`, label: 'per session' },
                  { Icon: CalendarDays, value: `${counsellor.totalSessions || 0}+`,                         label: 'sessions'    },
                  { Icon: BadgeCheck,  value: `${counsellor.experience || 0}+`,                             label: 'years exp'   },
                ].map((s, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center', flexDirection: 'column' }}>
                    {i > 0 && (
                      <View style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                    )}
                    <View style={{
                      width: 32, height: 32, borderRadius: 16,
                      backgroundColor: 'rgba(255,255,255,0.12)',
                      alignItems: 'center', justifyContent: 'center', marginBottom: 6,
                    }}>
                      <s.Icon size={15} color="rgba(255,255,255,0.85)" />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: 'white', marginBottom: 2 }}>{s.value}</Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.70)' }}>{s.label}</Text>
                  </View>
                ))}
              </View>

              {/* Action buttons */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  onPress={handleMessage}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    paddingVertical: 13, borderRadius: 50,
                    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
                  }}
                >
                  <MessageCircle size={17} color="white" />
                  <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>Message</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleBook}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    paddingVertical: 13, borderRadius: 50,
                    backgroundColor: 'white',
                  }}
                >
                  <CalendarDays size={17} color={HERO_GREEN} />
                  <Text style={{ color: HERO_GREEN, fontSize: 15, fontWeight: '700' }}>Book Session</Text>
                </TouchableOpacity>
              </View>

            </View>
          ) : null}
        </View>

        {/* ─────────────── WHITE CONTENT ─────────────── */}
        <View style={{ backgroundColor: isDark ? colors.bg : '#ffffff' }}>

          {/* About */}
          <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 10 }}>About</Text>
            <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 22 }}>
              {counsellor?.bio || 'No bio available.'}
            </Text>
          </View>
          <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#f0f4f0', marginHorizontal: 20 }} />

          {/* Specializations */}
          {(counsellor?.specializations?.length ?? 0) > 0 && (
            <>
              <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 12 }}>Specializations</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {counsellor!.specializations.map((spec, i) => (
                    <View key={i} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: colors.primary + '12',
                      paddingHorizontal: 14, paddingVertical: 8,
                      borderRadius: 20,
                    }}>
                      <Brain size={14} color={colors.primary} />
                      <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>{spec}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#f0f4f0', marginHorizontal: 20 }} />
            </>
          )}

          {/* Why choose me */}
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 18 }}>Why choose me?</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {WHY_ITEMS.map(({ Icon, title, sub }, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{
                    width: 52, height: 52, borderRadius: 26,
                    backgroundColor: colors.primary + '12',
                    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
                  }}>
                    <Icon size={22} color={colors.primary} />
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 4, lineHeight: 16 }}>
                    {title}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 15 }}>
                    {sub}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: isDark ? colors.border : '#f0f4f0', marginHorizontal: 20 }} />

          {/* Pick a Date & Time */}
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 16 }}>
              Pick a Date & Time
            </Text>

            {/* Date chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
              style={{ marginBottom: 16 }}
            >
              {dates.slice(0, 7).map((date, i) => {
                const isSel = dateIdx === i;
                const isToday = i === 0;
                const day = date.toLocaleDateString('en-US', { weekday: 'short' });
                const num = date.getDate();
                const mon = date.toLocaleDateString('en-US', { month: 'short' });
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setDateIdx(i)}
                    style={{
                      alignItems: 'center', minWidth: 62,
                      backgroundColor: isSel ? colors.primary : (isDark ? colors.surface : '#ffffff'),
                      borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10,
                      borderWidth: 1.5, borderColor: isSel ? colors.primary : (isDark ? colors.border : '#e2e8e2'),
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: isSel ? 'rgba(255,255,255,0.85)' : colors.muted, marginBottom: 4 }}>
                      {isToday ? 'Today' : day}
                    </Text>
                    <Text style={{ fontSize: 19, fontWeight: '800', color: isSel ? 'white' : colors.text }}>
                      {num}
                    </Text>
                    <Text style={{ fontSize: 11, color: isSel ? 'rgba(255,255,255,0.80)' : colors.muted, marginTop: 2 }}>
                      {mon}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {/* Calendar icon chip */}
              <TouchableOpacity style={{
                width: 62, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isDark ? colors.surface : '#ffffff',
                borderRadius: 14, borderWidth: 1.5, borderColor: isDark ? colors.border : '#e2e8e2',
              }}>
                <CalendarDays size={20} color={colors.muted} />
              </TouchableOpacity>
            </ScrollView>

            {/* Time slots */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {visibleSlots.map((t) => {
                const past = isPast(selectedDate, t);
                const isSel = selectedTime === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => { if (!past) setTime(t); }}
                    disabled={past}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 11,
                      borderRadius: 12,
                      backgroundColor: isSel ? colors.primary : (isDark ? colors.surface : '#ffffff'),
                      borderWidth: 1.5,
                      borderColor: isSel ? colors.primary : (isDark ? colors.border : '#e2e8e2'),
                      opacity: past ? 0.4 : 1,
                    }}
                  >
                    <Text style={{
                      fontSize: 13, fontWeight: '700',
                      color: isSel ? 'white' : (past ? colors.muted : colors.text),
                    }}>
                      {fmt(t)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {hasMore && (
                <TouchableOpacity
                  onPress={() => setShowAll(true)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 11,
                    borderRadius: 12, borderWidth: 1.5,
                    borderColor: isDark ? colors.border : '#e2e8e2',
                    backgroundColor: isDark ? colors.surface : '#ffffff',
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>More</Text>
                  <Text style={{ fontSize: 13, color: colors.muted }}>›</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

        </View>
      </ScrollView>

      {/* ─────────────── BOTTOM CTA ─────────────── */}
      {!loading && counsellor && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: isDark ? colors.bg : '#ffffff',
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 8,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: isDark ? colors.border : '#f0f4f0',
        }}>
          <TouchableOpacity
            onPress={handleBook}
            activeOpacity={0.88}
            style={{
              backgroundColor: selectedTime ? HERO_GREEN : (isDark ? colors.surface : '#e2e8e2'),
              paddingVertical: 17, borderRadius: 50,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{
              color: selectedTime ? 'white' : colors.muted,
              fontSize: 16, fontWeight: '800', letterSpacing: 0.1,
            }}>
              {selectedTime ? `Book ${fmt(selectedTime)} · ${price}` : 'Select a Time Slot'}
            </Text>
          </TouchableOpacity>

          {/* Secure footer */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 10 }}>
            <ShieldCheck size={13} color={colors.muted} />
            <Text style={{ fontSize: 12, color: colors.muted }}>Secure booking. Cancel anytime.</Text>
          </View>
        </View>
      )}
    </View>
  );
}
