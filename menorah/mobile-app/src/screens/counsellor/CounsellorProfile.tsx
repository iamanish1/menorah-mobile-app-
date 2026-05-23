import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Dimensions, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Star, MessageCircle, Calendar, Heart, Share2, Users } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes, headerGradient } from "@/theme/colors";
import { api, Counsellor } from "@/lib/api";

const { width } = Dimensions.get('window');

// Generate next N days starting from today
function generateDates(numDays = 30): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < numDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// Generate hourly time slots from 8 AM to 9 PM
const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00',
  '16:00', '17:00', '18:00', '19:00',
  '20:00', '21:00',
];

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const hour12 = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function isSlotPast(date: Date, timeStr: string): boolean {
  const now = new Date();
  const [h, m] = timeStr.split(':').map(Number);
  const slotDate = new Date(date);
  slotDate.setHours(h, m, 0, 0);
  return slotDate <= now;
}

export default function CounsellorProfile({ navigation, route }: any) {
  const { counsellorId } = route.params || {};
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  const [counsellor, setCounsellor] = useState<Counsellor | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const dates = useMemo(() => generateDates(30), []);
  const selectedDate = dates[selectedDateIndex];

  useEffect(() => {
    if (counsellorId) loadCounsellor();
  }, [counsellorId]);

  // Reset time when date changes
  useEffect(() => {
    setSelectedTime(null);
  }, [selectedDateIndex]);

  const loadCounsellor = async () => {
    setLoading(true);
    try {
      const response = await api.getCounsellor(counsellorId);
      if (response.success && response.data) {
        setCounsellor(response.data.counsellor);
      } else {
        Alert.alert('Error', 'Failed to load counsellor profile.');
        navigation.goBack();
      }
    } catch {
      Alert.alert('Error', 'Failed to load counsellor profile.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleBookSession = () => {
    if (!selectedTime) {
      Alert.alert('Select Time', 'Please select a time slot to continue.');
      return;
    }
    const [h, m] = selectedTime.split(':').map(Number);
    const scheduledAt = new Date(selectedDate);
    scheduledAt.setHours(h, m, 0, 0);

    navigation.navigate('BookingReview', {
      counsellorId: counsellor?.id,
      counsellorName: counsellor?.name,
      sessionType: 'video',
      sessionDuration: counsellor?.sessionDuration || 60,
      scheduledAt: scheduledAt.toISOString(),
      hourlyRate: counsellor?.hourlyRate || 0,
      currency: counsellor?.currency || 'INR',
    });
  };

  const sections = [
    { id: 'header', type: 'header' },
    { id: 'about', type: 'about' },
    { id: 'specializations', type: 'specializations' },
    { id: 'booking', type: 'booking' },
  ];

  const renderSection = ({ item }: { item: any }) => {
    switch (item.type) {
      case 'header':
        return (
          <LinearGradient
            colors={headerGradient(scheme) as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingBottom: 20 }}
          >
            {/* Top bar */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 }}
              >
                <ArrowLeft size={20} color="white" />
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setIsFavorite(!isFavorite)}
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 }}
                >
                  <Heart size={20} color={isFavorite ? '#EF4444' : 'white'} fill={isFavorite ? '#EF4444' : 'none'} />
                </TouchableOpacity>
                <TouchableOpacity style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 }}>
                  <Share2 size={20} color="white" />
                </TouchableOpacity>
              </View>
            </View>

            {loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="white" />
              </View>
            ) : counsellor ? (
              <View style={{ paddingHorizontal: 16 }}>
                {/* Profile row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  {counsellor.profileImage ? (
                    <Image
                      source={{ uri: counsellor.profileImage }}
                      style={{ width: 80, height: 80, borderRadius: 40, marginRight: 16 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{
                      width: 80, height: 80, borderRadius: 40,
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      alignItems: 'center', justifyContent: 'center', marginRight: 16,
                    }}>
                      <Users size={40} color="white" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: 'white', marginBottom: 4 }} numberOfLines={1}>
                      {counsellor.name}
                    </Text>
                    <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 4 }} numberOfLines={1}>
                      {counsellor.specialization || 'Counsellor'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Star size={14} color="#FFD700" fill="#FFD700" />
                      <Text style={{ fontSize: 13, color: 'white', marginLeft: 4 }}>
                        {counsellor.rating?.toFixed(1) || '0.0'} ({counsellor.reviewCount || 0} reviews)
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Stats */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 }}>
                  {[
                    { value: `${counsellor.currency === 'INR' ? '₹' : '$'}${counsellor.hourlyRate || 0}`, label: 'per session' },
                    { value: `${counsellor.totalSessions || 0}+`, label: 'sessions' },
                    { value: `${counsellor.experience || 0}+`, label: 'years exp' },
                  ].map((stat) => (
                    <View key={stat.label} style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: 'white' }}>{stat.value}</Text>
                      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{stat.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Actions */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('ChatThread', { counsellorId: counsellor.id })}
                    style={{
                      flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12,
                      padding: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
                    }}
                  >
                    <MessageCircle size={16} color="white" />
                    <Text style={{ color: 'white', fontSize: 14, fontWeight: '600', marginLeft: 6 }}>Message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleBookSession}
                    style={{
                      flex: 1, backgroundColor: 'white', borderRadius: 12,
                      padding: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
                    }}
                  >
                    <Calendar size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600', marginLeft: 6 }}>Book Session</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </LinearGradient>
        );

      case 'about':
        return (
          <View style={{ paddingHorizontal: 16, marginTop: 20, marginBottom: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 10 }}>About</Text>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 22 }}>
              {counsellor?.bio || 'No bio available.'}
            </Text>
          </View>
        );

      case 'specializations':
        if (!counsellor?.specializations?.length) return null;
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 }}>Specializations</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {counsellor.specializations.map((spec, i) => (
                <View key={i} style={{
                  backgroundColor: colors.primary + '15',
                  paddingHorizontal: 14, paddingVertical: 8,
                  borderRadius: 20, borderWidth: 1, borderColor: colors.primary + '30',
                }}>
                  <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>{spec}</Text>
                </View>
              ))}
            </View>
          </View>
        );

      case 'booking':
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 32 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 14 }}>
              Pick a Date & Time
            </Text>

            {/* Date scroller */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
              style={{ marginBottom: 20 }}
            >
              {dates.map((date, index) => {
                const isSelected = selectedDateIndex === index;
                const isToday = index === 0;
                const dayName = date.toLocaleDateString('en-IN', { weekday: 'short' });
                const dayNum = date.getDate();
                const month = date.toLocaleDateString('en-IN', { month: 'short' });
                return (
                  <TouchableOpacity
                    key={index}
                    onPress={() => setSelectedDateIndex(index)}
                    style={{
                      alignItems: 'center',
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderRadius: 14,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderWidth: 1.5,
                      borderColor: isSelected ? colors.primary : colors.border,
                      minWidth: 58,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: isSelected ? 'rgba(255,255,255,0.85)' : colors.muted, marginBottom: 4 }}>
                      {isToday ? 'Today' : dayName}
                    </Text>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: isSelected ? 'white' : colors.text }}>
                      {dayNum}
                    </Text>
                    <Text style={{ fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.8)' : colors.muted, marginTop: 2 }}>
                      {month}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Time slots grid */}
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.muted, marginBottom: 12 }}>
              Available times for{' '}
              {selectedDate.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {TIME_SLOTS.map((timeStr) => {
                const past = isSlotPast(selectedDate, timeStr);
                const isSelected = selectedTime === timeStr;
                return (
                  <TouchableOpacity
                    key={timeStr}
                    onPress={() => { if (!past) setSelectedTime(timeStr); }}
                    disabled={past}
                    style={{
                      width: (width - 32 - 30) / 4,
                      alignItems: 'center',
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: past
                        ? (scheme === 'dark' ? 'rgba(255,255,255,0.04)' : '#F3F4F6')
                        : isSelected
                          ? colors.primary
                          : colors.card,
                      borderWidth: 1.5,
                      borderColor: past
                        ? colors.border
                        : isSelected
                          ? colors.primary
                          : colors.border,
                      opacity: past ? 0.45 : 1,
                    }}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: past ? colors.muted : isSelected ? 'white' : colors.text,
                    }}>
                      {formatTime(timeStr)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={sections}
        renderItem={renderSection}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
      />

      {/* Bottom CTA */}
      {!loading && counsellor && (
        <View style={{
          backgroundColor: colors.card,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}>
          {!selectedTime && (
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', marginBottom: 8 }}>
              Select a date and time slot above
            </Text>
          )}
          <TouchableOpacity
            onPress={handleBookSession}
            disabled={!selectedTime}
            style={{
              backgroundColor: selectedTime ? colors.primary : colors.border,
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: selectedTime ? 'white' : colors.muted, fontSize: 16, fontWeight: '700' }}>
              {selectedTime
                ? `Book ${formatTime(selectedTime)} · ${counsellor.currency === 'INR' ? '₹' : '$'}${counsellor.hourlyRate || 0}`
                : 'Select a Time Slot'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
