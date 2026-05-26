import React, { useState } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { CalendarDays, Clock, Percent, ChevronRight } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { useNavigation } from '@react-navigation/native';
import { type SubscriptionType } from '@/screens/subscription/subscriptionPlans';

interface Props {
  onSubscriptionSelect?: (subscriptionType: SubscriptionType) => void;
}

const PLANS = [
  {
    id: 'weekly' as SubscriptionType,
    title: 'Weekly Plan',
    description: 'Perfect for trying out',
    price: '₹500',
    icon: CalendarDays,
    iconColor: '#16a34a',
    iconBg: '#dcfce7',
    btnColor: '#16a34a',
  },
  {
    id: 'monthly' as SubscriptionType,
    title: 'Monthly Plan',
    description: 'Most popular',
    price: '₹1,500',
    icon: Clock,
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    btnColor: '#2563eb',
  },
];

export default function SubscriptionSelector({ onSubscriptionSelect }: Props) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<SubscriptionType | null>(null);

  const GAP = 12;
  const H_PAD = 32;
  const cardW = Math.floor((width - H_PAD - GAP) / 2);
  const cardBg = scheme === 'dark' ? colors.surface : colors.card;

  const handleSelect = (id: SubscriptionType) => {
    setSelected(id);
    navigation.navigate('SubscriptionDetails', { subscriptionType: id });
    onSubscriptionSelect?.(id);
  };

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
      {/* Section header */}
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4, letterSpacing: -0.2 }}>
        Buy Subscription
      </Text>
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 14, lineHeight: 17 }}>
        Choose a subscription plan that works best for you.
      </Text>

      {/* 2-column grid */}
      <View style={{ flexDirection: 'row', gap: GAP, marginBottom: 12 }}>
        {PLANS.map((p) => {
          const Icon = p.icon;
          const isSelected = selected === p.id;

          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => handleSelect(p.id)}
              activeOpacity={0.88}
              style={{
                width: cardW,
                backgroundColor: cardBg,
                borderRadius: 18,
                padding: 14,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? p.iconColor : colors.border,
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
                    backgroundColor: p.iconBg,
                    width: 44,
                    height: 44,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={22} color={p.iconColor} />
                </View>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: isSelected ? p.iconColor : colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2,
                  }}
                >
                  {isSelected && (
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.iconColor }} />
                  )}
                </View>
              </View>

              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.cardText, marginBottom: 3 }}>
                {p.title}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 14, lineHeight: 17 }}>
                {p.description}
              </Text>

              {/* Price + outlined button */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: p.iconColor }}>
                  {p.price}
                </Text>
                <TouchableOpacity
                  onPress={() => handleSelect(p.id)}
                  style={{
                    borderWidth: 1.5,
                    borderColor: p.btnColor,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 10,
                  }}
                >
                  <Text style={{ color: p.btnColor, fontSize: 13, fontWeight: '700' }}>Choose</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Savings banner */}
      <TouchableOpacity
        activeOpacity={0.88}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Percent size={18} color="white" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '700', marginBottom: 2 }}>
            Save more with subscriptions!
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 11, lineHeight: 16 }}>
            Flexible plans · Cancel anytime · Pause anytime
          </Text>
        </View>
        <ChevronRight size={18} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
    </View>
  );
}
