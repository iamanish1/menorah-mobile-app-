import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { User, Users, Crown } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';

export type SessionType = 'basic' | 'premium' | 'pro';
export type TherapistGender = 'male' | 'female';

interface SessionTypeSelectorProps {
  onSessionSelect?: (sessionType: SessionType) => void;
}

const SESSION_TYPES = [
  {
    id: 'basic' as SessionType,
    title: 'Basic 45 min',
    description: 'Perfect for getting started',
    price: '\u20B91000',
    icon: User,
    color: '#10B981',
    bgColor: '#D1FAE5',
  },
  {
    id: 'premium' as SessionType,
    title: 'Premium 60 min',
    description: 'Enhanced therapeutic experience',
    price: '\u20B92000',
    icon: Users,
    color: '#3B82F6',
    bgColor: '#DBEAFE',
  },
  {
    id: 'pro' as SessionType,
    title: 'Pro 90 min',
    description: 'Comprehensive therapy session',
    price: '\u20B93000',
    icon: Crown,
    color: '#8B5CF6',
    bgColor: '#EDE9FE',
  },
];

export default function SessionTypeSelector({ onSessionSelect }: SessionTypeSelectorProps) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const [selectedSession, setSelectedSession] = useState<SessionType | null>(null);
  const cardBg = scheme === 'dark' ? colors.surface : colors.card;

  const handleSessionSelect = (sessionType: SessionType) => {
    setSelectedSession(sessionType);
    onSessionSelect?.(sessionType);
  };

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 0 }}>
      <View style={{ marginBottom: 0 }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: '700',
            color: colors.text,
            marginBottom: 8,
          }}
        >
          Choose Your Session Type
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: colors.muted,
            marginBottom: 16,
            lineHeight: 20,
          }}
        >
          Your therapist&apos;s identity will be revealed after payment for unbiased matching.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {SESSION_TYPES.map((session) => {
            const IconComponent = session.icon;
            const isSelected = selectedSession === session.id;

            return (
              <TouchableOpacity
                key={session.id}
                onPress={() => handleSessionSelect(session.id)}
                activeOpacity={0.92}
                style={{
                  backgroundColor: cardBg,
                  borderRadius: 20,
                  padding: 16,
                  marginRight: 12,
                  width: 200,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? session.color : colors.border,
                  shadowColor: isSelected ? session.color : '#000000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: scheme === 'dark' ? (isSelected ? 0.3 : 0.16) : (isSelected ? 0.1 : 0.05),
                  shadowRadius: isSelected ? 12 : 5,
                  elevation: isSelected ? 4 : 1,
                }}
              >
                <View
                  style={{
                    backgroundColor: session.bgColor,
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <IconComponent size={24} color={session.color} />
                </View>

                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '700',
                    color: colors.cardText,
                    marginBottom: 4,
                  }}
                >
                  {session.title}
                </Text>

                <Text
                  style={{
                    fontSize: 14,
                    color: colors.muted,
                    marginBottom: 8,
                    lineHeight: 18,
                  }}
                >
                  {session.description}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: '700',
                      color: session.color,
                    }}
                  >
                    {session.price}
                  </Text>

                  <TouchableOpacity
                    onPress={() => handleSessionSelect(session.id)}
                    style={{
                      backgroundColor: session.color,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: 'white',
                        fontSize: 14,
                        fontWeight: '600',
                      }}
                    >
                      Choose
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
