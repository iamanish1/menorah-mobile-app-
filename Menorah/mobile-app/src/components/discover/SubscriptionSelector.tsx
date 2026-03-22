import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Calendar, Clock, Crown } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { useNavigation } from '@react-navigation/native';

export type SubscriptionType = 'weekly' | 'monthly' | 'yearly';

interface SubscriptionSelectorProps {
  onSubscriptionSelect?: (subscriptionType: SubscriptionType) => void;
}

const SUBSCRIPTION_TYPES = [
  {
    id: 'weekly' as SubscriptionType,
    title: 'Weekly Plan',
    description: 'Perfect for trying out',
    price: '\u20B9500',
    icon: Calendar,
    color: '#10B981',
    bgColor: '#D1FAE5',
  },
  {
    id: 'monthly' as SubscriptionType,
    title: 'Monthly Plan',
    description: 'Most popular choice',
    price: '\u20B91500',
    icon: Clock,
    color: '#3B82F6',
    bgColor: '#DBEAFE',
  },
  {
    id: 'yearly' as SubscriptionType,
    title: 'Yearly Plan',
    description: 'Best value for money',
    price: '\u20B912000',
    icon: Crown,
    color: '#8B5CF6',
    bgColor: '#EDE9FE',
  },
];

export default function SubscriptionSelector({ onSubscriptionSelect }: SubscriptionSelectorProps) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const navigation = useNavigation<any>();
  const [selectedSubscription, setSelectedSubscription] = useState<SubscriptionType | null>(null);
  const cardBg = scheme === 'dark' ? colors.surface : colors.card;

  const handleSubscriptionSelect = (subscriptionType: SubscriptionType) => {
    setSelectedSubscription(subscriptionType);

    navigation.navigate('SubscriptionPayment', {
      subscriptionType,
      paymentMethod: 'razorpay',
    });

    onSubscriptionSelect?.(subscriptionType);
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
          Buy Subscription
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: colors.muted,
            marginBottom: 16,
            lineHeight: 20,
          }}
        >
          Choose a subscription plan that works best for you.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {SUBSCRIPTION_TYPES.map((subscription) => {
            const IconComponent = subscription.icon;
            const isSelected = selectedSubscription === subscription.id;

            return (
              <TouchableOpacity
                key={subscription.id}
                onPress={() => handleSubscriptionSelect(subscription.id)}
                activeOpacity={0.92}
                style={{
                  backgroundColor: cardBg,
                  borderRadius: 20,
                  padding: 16,
                  marginRight: 12,
                  width: 200,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? subscription.color : colors.border,
                  shadowColor: isSelected ? subscription.color : '#000000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: scheme === 'dark' ? (isSelected ? 0.3 : 0.16) : (isSelected ? 0.1 : 0.05),
                  shadowRadius: isSelected ? 12 : 5,
                  elevation: isSelected ? 4 : 1,
                }}
              >
                <View
                  style={{
                    backgroundColor: subscription.bgColor,
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <IconComponent size={24} color={subscription.color} />
                </View>

                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '700',
                    color: colors.cardText,
                    marginBottom: 4,
                  }}
                >
                  {subscription.title}
                </Text>

                <Text
                  style={{
                    fontSize: 14,
                    color: colors.muted,
                    marginBottom: 8,
                    lineHeight: 18,
                  }}
                >
                  {subscription.description}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: '700',
                      color: subscription.color,
                    }}
                  >
                    {subscription.price}
                  </Text>

                  <TouchableOpacity
                    onPress={() => handleSubscriptionSelect(subscription.id)}
                    style={{
                      backgroundColor: subscription.color,
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
