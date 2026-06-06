import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { CalendarDays, Clock, Crown, Percent } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { useNavigation } from '@react-navigation/native';
import { type SubscriptionType } from '@/screens/subscription/subscriptionPlans';
import {
  IOS_SUBSCRIPTIONS_UNAVAILABLE_MESSAGE,
  shouldDisableIOSSubscriptionPurchase,
} from '@/lib/paymentPolicy';

interface Props {
  onSubscriptionSelect?: (subscriptionType: SubscriptionType) => void;
}

const PLANS = [
  {
    id: 'weekly' as SubscriptionType,
    title: 'Weekly',
    description: 'Perfect for trying out',
    price: '₹500',
    badge: null,
    icon: CalendarDays,
    iconColor: '#16a34a',
    iconBg: '#dcfce7',
    btnColor: '#16a34a',
  },
  {
    id: 'monthly' as SubscriptionType,
    title: 'Monthly',
    description: 'Most popular choice',
    price: '₹1,500',
    badge: 'Popular',
    icon: Clock,
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    btnColor: '#2563eb',
  },
  {
    id: 'yearly' as SubscriptionType,
    title: 'Yearly',
    description: 'Best value, save 33%',
    price: '₹12,000',
    badge: 'Best Value',
    icon: Crown,
    iconColor: '#7c3aed',
    iconBg: '#ede9fe',
    btnColor: '#7c3aed',
  },
];

const CARD_WIDTH = 158;

export default function SubscriptionSelector({ onSubscriptionSelect }: Props) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const navigation = useNavigation<any>();
  const [selected, setSelected] = useState<SubscriptionType | null>(null);
  const cardBg = scheme === 'dark' ? colors.surface : colors.card;
  const isIOSSubscriptionDisabled = shouldDisableIOSSubscriptionPurchase();

  const handleSelect = (id: SubscriptionType) => {
    setSelected(id);
    navigation.navigate('SubscriptionDetails', { subscriptionType: id });
    onSubscriptionSelect?.(id);
  };

  return (
    <View style={{ marginBottom: 4 }}>
      {/* Section header */}
      <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.2 }}>
          {isIOSSubscriptionDisabled ? 'Subscription Plans' : 'Buy Subscription'}
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4, marginBottom: 14, lineHeight: 17 }}>
          {isIOSSubscriptionDisabled
            ? IOS_SUBSCRIPTIONS_UNAVAILABLE_MESSAGE
            : 'Choose a subscription plan that works best for you.'}
        </Text>
      </View>

      {isIOSSubscriptionDisabled ? (
        <View
          style={{
            marginHorizontal: 16,
            borderRadius: 16,
            padding: 16,
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 }}>
            Free features are available
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            {IOS_SUBSCRIPTIONS_UNAVAILABLE_MESSAGE}
          </Text>
        </View>
      ) : (
        <>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
          >
            {PLANS.map((p) => {
              const Icon = p.icon;
              const isSelected = selected === p.id;

              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => handleSelect(p.id)}
                  activeOpacity={0.88}
                  style={{
                    width: CARD_WIDTH,
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
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <View
                      style={{
                        backgroundColor: p.iconBg,
                        width: 42,
                        height: 42,
                        borderRadius: 13,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={20} color={p.iconColor} />
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

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.cardText }}>
                      {p.title}
                    </Text>
                    {p.badge && (
                      <View style={{ backgroundColor: p.iconBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: p.iconColor }}>{p.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 14, lineHeight: 16 }}>
                    {p.description}
                  </Text>

                  {/* Price + button */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: p.iconColor }}>
                      {p.price}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleSelect(p.id)}
                      style={{
                        borderWidth: 1.5,
                        borderColor: p.btnColor,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 10,
                      }}
                    >
                      <Text style={{ color: p.btnColor, fontSize: 12, fontWeight: '700' }}>Choose</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Savings banner */}
          <TouchableOpacity
            activeOpacity={0.88}
            style={{
              marginHorizontal: 16,
              marginTop: 12,
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
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
