import React, { useState } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { User, Users, Info } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';

export type SessionType = 'basic' | 'premium' | 'pro';
export type TherapistGender = 'male' | 'female';

interface Props {
  onSessionSelect?: (sessionType: SessionType) => void;
}

const SESSIONS = [
  {
    id: 'basic' as SessionType,
    title: 'Basic 45 min',
    description: 'Perfect for getting started',
    price: '₹1,000',
    icon: User,
    iconColor: '#16a34a',
    iconBg: '#dcfce7',
    btnColor: '#16a34a',
  },
  {
    id: 'premium' as SessionType,
    title: 'Premium 60 min',
    description: 'Enhanced therapy experience',
    price: '₹2,000',
    icon: Users,
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    btnColor: '#2563eb',
  },
];

export default function SessionTypeSelector({ onSessionSelect }: Props) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<SessionType | null>(null);

  const GAP = 12;
  const H_PAD = 32;
  const cardW = Math.floor((width - H_PAD - GAP) / 2);
  const cardBg = scheme === 'dark' ? colors.surface : colors.card;

  const handleSelect = (id: SessionType) => {
    setSelected(id);
    onSessionSelect?.(id);
  };

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
      {/* Section header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.2 }}>
          Choose Your Session Type
        </Text>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Info size={13} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>How it works</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 14, lineHeight: 17 }}>
        Your therapist's identity will be revealed after payment for unbiased matching.
      </Text>

      {/* 2-column grid */}
      <View style={{ flexDirection: 'row', gap: GAP }}>
        {SESSIONS.map((s) => {
          const Icon = s.icon;
          const isSelected = selected === s.id;

          return (
            <TouchableOpacity
              key={s.id}
              onPress={() => handleSelect(s.id)}
              activeOpacity={0.88}
              style={{
                width: cardW,
                backgroundColor: cardBg,
                borderRadius: 18,
                padding: 14,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? s.iconColor : colors.border,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: scheme === 'dark' ? 0.18 : 0.06,
                shadowRadius: 8,
                elevation: isSelected ? 3 : 1,
              }}
            >
              {/* Icon + radio */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <View
                  style={{
                    backgroundColor: s.iconBg,
                    width: 44,
                    height: 44,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={22} color={s.iconColor} />
                </View>
                {/* Radio circle */}
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: isSelected ? s.iconColor : colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2,
                  }}
                >
                  {isSelected && (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: s.iconColor,
                      }}
                    />
                  )}
                </View>
              </View>

              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.cardText, marginBottom: 3 }}>
                {s.title}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 14, lineHeight: 17 }}>
                {s.description}
              </Text>

              {/* Price + button */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: s.iconColor }}>
                  {s.price}
                </Text>
                <TouchableOpacity
                  onPress={() => handleSelect(s.id)}
                  style={{
                    backgroundColor: s.btnColor,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 10,
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 13, fontWeight: '700' }}>Choose</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
