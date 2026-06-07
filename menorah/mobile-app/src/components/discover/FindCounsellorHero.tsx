import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Search, Star, ArrowRight, ShieldCheck } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';

interface Props {
  onPress: () => void;
}

const AVATARS = ['A', 'S', 'P', 'R'];
const AVATAR_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#ea580c'];

export default function FindCounsellorHero({ onPress }: Props) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const heroBg = isDark ? colors.primaryDark : colors.primary;
  const ctaBg = isDark ? colors.primary + '18' : 'white';
  const ctaColor = isDark ? colors.primary : colors.primaryDark;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.92}
      style={{
        marginHorizontal: 16,
        marginBottom: 20,
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: heroBg,
        shadowColor: isDark ? '#000' : colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
        elevation: 6,
      }}
    >
      {/* Top content */}
      <View style={{ padding: 20, paddingBottom: 16 }}>
        {/* Badge */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignSelf: 'flex-start',
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 20,
            marginBottom: 14,
          }}
        >
          <ShieldCheck size={12} color="white" />
          <Text style={{ color: 'white', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
            Verified Therapists
          </Text>
        </View>

        <Text style={{ fontSize: 24, fontWeight: '900', color: 'white', lineHeight: 30, letterSpacing: -0.4, marginBottom: 8 }}>
          Find Your{'\n'}Perfect Counsellor
        </Text>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 19, marginBottom: 18 }}>
          Browse licensed therapists filtered by specialization, language, and availability.
        </Text>

        {/* CTA button */}
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.88}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: ctaBg,
            alignSelf: 'flex-start',
            paddingHorizontal: 18,
            paddingVertical: 11,
            borderRadius: 14,
          }}
        >
          <Search size={15} color={ctaColor} />
          <Text style={{ color: ctaColor, fontSize: 14, fontWeight: '800' }}>Browse Counsellors</Text>
          <ArrowRight size={14} color={ctaColor} />
        </TouchableOpacity>
      </View>

      {/* Bottom stats bar */}
      <View
        style={{
          backgroundColor: 'rgba(0,0,0,0.12)',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        {/* Avatars stack */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {AVATARS.map((letter, i) => (
            <View
              key={i}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: AVATAR_COLORS[i],
                borderWidth: 2,
                borderColor: heroBg,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: i === 0 ? 0 : -8,
              }}
            >
              <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>{letter}</Text>
            </View>
          ))}
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600', marginLeft: 8 }}>
            50+ therapists
          </Text>
        </View>

        {/* Rating */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Star size={13} color="#fbbf24" fill="#fbbf24" />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '700' }}>4.8</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>avg rating</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
