import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Check } from 'lucide-react-native';
import Button from '@/components/ui/Button';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { getSubscriptionPlan, type SubscriptionType } from './subscriptionPlans';

export default function SubscriptionDetails({ route, navigation }: any) {
  const { subscriptionType } = route.params || {};
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const plan = getSubscriptionPlan(subscriptionType as SubscriptionType);

  if (!plan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 12 }}>
            Plan not found
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24 }}>
            We could not load the subscription details. Please go back and try again.
          </Text>
          <Button title="Go Back" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const IconComponent = plan.icon;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginLeft: 12 }}>
          Subscription Details
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 24,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 20,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              backgroundColor: plan.bgColor,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <IconComponent size={28} color={plan.color} />
          </View>

          <Text style={{ fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 6 }}>
            {plan.title}
          </Text>
          <Text style={{ fontSize: 15, color: colors.muted, lineHeight: 22, marginBottom: 16 }}>
            {plan.description}
          </Text>

          <View
            style={{
              backgroundColor: scheme === 'dark' ? colors.surface : '#F8FAF8',
              borderRadius: 18,
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 28, fontWeight: '800', color: plan.color, marginBottom: 4 }}>
              {plan.price}
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted }}>
              {plan.billingLabel}
            </Text>
          </View>
        </View>

        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 24,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 20,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 14 }}>
            What&apos;s included
          </Text>

          {plan.features.map((feature) => (
            <View key={feature} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: plan.bgColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                  marginTop: 1,
                }}
              >
                <Check size={13} color={plan.color} />
              </View>
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: colors.cardText }}>
                {feature}
              </Text>
            </View>
          ))}
        </View>

        <View
          style={{
            backgroundColor: scheme === 'dark' ? colors.surface : '#F8FAF8',
            borderRadius: 20,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
            Before payment
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: colors.muted }}>
            Review the plan details above. When you continue, you&apos;ll move to the payment step to activate this subscription.
          </Text>
        </View>

        <Button
          title={`Continue with ${plan.shortLabel} Plan`}
          onPress={() =>
            navigation.navigate('SubscriptionPayment', {
              subscriptionType: plan.id,
              paymentMethod: 'razorpay',
            })
          }
          style={{ marginBottom: 12 }}
        />
        <Button title="Back" variant="outline" onPress={() => navigation.goBack()} />
      </ScrollView>
    </SafeAreaView>
  );
}
