import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarDays, Clock, Tag, User, ShieldCheck, Lock } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import type { SessionType, TherapistGender } from '@/components/discover/SessionTypeSelector';

interface GenderSelectionProps {
  navigation: any;
  route: {
    params?: {
      sessionType?: SessionType;
      duration?: number;
      price?: number;
    };
  };
}

const GENDER_OPTIONS = [
  {
    id: 'male' as TherapistGender,
    title: 'Male Therapist',
    description: 'Experienced male counsellors',
    color: '#3B82F6',
    bgColor: '#DBEAFE',
  },
  {
    id: 'female' as TherapistGender,
    title: 'Female Therapist',
    description: 'Experienced female counsellors',
    color: '#EC4899',
    bgColor: '#FCE7F3',
  },
  {
    id: 'any' as TherapistGender,
    title: 'No Preference',
    description: 'Match with any available counsellor',
    color: '#10B981',
    bgColor: '#D1FAE5',
  },
];

const SESSION_DETAILS: Record<string, { title: string; duration: number; price: number; features: string[] }> = {
  basic: {
    title: 'Basic Session',
    duration: 45,
    price: 1000,
    features: ['General counselling', 'Email support', 'Standard session'],
  },
  premium: {
    title: 'Premium Session',
    duration: 60,
    price: 2000,
    features: ['Enhanced counselling', 'Priority support', 'Extended session', 'Follow-up call'],
  },
  pro: {
    title: 'Pro Session',
    duration: 90,
    price: 3000,
    features: ['Comprehensive counselling', '24/7 support', 'Extended session', 'Multiple follow-ups', 'Resource materials'],
  },
};

export default function GenderSelection({ navigation, route }: GenderSelectionProps) {
  const sessionType: SessionType = route?.params?.sessionType ?? 'basic';
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';

  const [selectedGender, setSelectedGender] = useState<TherapistGender>('any');

  const session = SESSION_DETAILS[sessionType] ?? SESSION_DETAILS.basic;
  const cardBg = isDark ? colors.surface : '#ffffff';

  const handleContinue = () => {
    navigation.navigate('SessionReview', {
      sessionType,
      gender: selectedGender,
      duration: session.duration,
      price: session.price,
      features: session.features,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.bg : '#f5f7f5' }}>

      {/* ── Dark green header ── */}
      <SafeAreaView style={{ backgroundColor: '#2d5c3e' }} edges={['top']}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20,
        }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ marginRight: 14 }}
          >
            <ArrowLeft size={24} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: 'white', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 }}>
              Choose Your Preference
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 3 }}>
              Select your preferred therapist gender
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Selected Session card ── */}
        <View style={{
          backgroundColor: cardBg,
          marginHorizontal: 16, marginTop: 20, marginBottom: 24,
          borderRadius: 20, padding: 16,
          borderWidth: 1, borderColor: isDark ? colors.border : '#e8ede8',
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.1 : 0.05, shadowRadius: 6, elevation: 2,
        }}>
          {/* Top row: icon + label */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <View style={{
              width: 46, height: 46, borderRadius: 14,
              backgroundColor: colors.primary + '14',
              alignItems: 'center', justifyContent: 'center', marginRight: 12,
            }}>
              <CalendarDays size={22} color={colors.primary} />
            </View>
            <View>
              <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '500', marginBottom: 2 }}>
                Selected Session
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary, letterSpacing: -0.3 }}>
                {session.title}
              </Text>
            </View>
          </View>

          {/* Duration + Price chips */}
          <View style={{
            flexDirection: 'row',
            borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#f0f4f0',
            paddingTop: 14, gap: 0,
          }}>
            {/* Duration */}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: colors.primary + '14',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock size={16} color={colors.primary} />
              </View>
              <View>
                <Text style={{ fontSize: 11, color: colors.muted }}>Duration</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                  {session.duration} minutes
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={{ width: 1, backgroundColor: isDark ? colors.border : '#e8ede8', marginHorizontal: 8 }} />

            {/* Price */}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 8 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: colors.primary + '14',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Tag size={16} color={colors.primary} />
              </View>
              <View>
                <Text style={{ fontSize: 11, color: colors.muted }}>Price</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                  ₹{session.price.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Section title ── */}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3, marginBottom: 4 }}>
            Choose Your Preference
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>
            Let us know your preference so we can match you better
          </Text>
        </View>

        {/* ── Option cards ── */}
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {GENDER_OPTIONS.map((opt) => {
            const isSelected = selectedGender === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => setSelectedGender(opt.id)}
                activeOpacity={0.85}
                style={{
                  backgroundColor: cardBg,
                  borderRadius: 18,
                  padding: 16,
                  flexDirection: 'row', alignItems: 'center',
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? colors.primary : (isDark ? colors.border : '#e2e8e2'),
                  shadowColor: isSelected ? colors.primary : '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isSelected ? 0.1 : 0.04,
                  shadowRadius: 6, elevation: isSelected ? 3 : 1,
                }}
              >
                {/* Icon circle */}
                <View style={{
                  width: 54, height: 54, borderRadius: 27,
                  backgroundColor: opt.bgColor,
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 14,
                }}>
                  <User size={26} color={opt.color} />
                </View>

                {/* Text */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 3 }}>
                    {opt.title}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
                    {opt.description}
                  </Text>
                </View>

                {/* Radio button */}
                <View style={{
                  width: 24, height: 24, borderRadius: 12,
                  borderWidth: isSelected ? 0 : 2,
                  borderColor: isDark ? colors.border : '#d1d5db',
                  backgroundColor: isSelected ? colors.primary : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                  marginLeft: 12,
                }}>
                  {isSelected && (
                    <View style={{
                      width: 10, height: 10, borderRadius: 5,
                      backgroundColor: 'white',
                    }} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Privacy note ── */}
        <View style={{
          marginHorizontal: 16, marginTop: 20,
          backgroundColor: isDark ? colors.surface : '#f0faf4',
          borderRadius: 16, padding: 14,
          flexDirection: 'row', alignItems: 'center', gap: 12,
          borderWidth: 1, borderColor: colors.primary + '22',
        }}>
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: colors.primary + '18',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <ShieldCheck size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 2 }}>
              Your preference is respected
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
              We{"'"}ll match you with the best available counsellor.
            </Text>
          </View>
        </View>

        {/* ── Continue button ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <TouchableOpacity
            onPress={handleContinue}
            activeOpacity={0.88}
            style={{
              backgroundColor: colors.primary,
              paddingVertical: 17, borderRadius: 50,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ color: 'white', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 }}>
              Continue
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Secure footer ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          <Lock size={13} color={colors.muted} />
          <Text style={{ fontSize: 12, color: colors.muted }}>Secure & Confidential</Text>
        </View>

      </ScrollView>
    </View>
  );
}
