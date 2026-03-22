import { Calendar, Clock, Crown } from 'lucide-react-native';

export type SubscriptionType = 'weekly' | 'monthly' | 'yearly';

export const SUBSCRIPTION_PLANS = [
  {
    id: 'weekly' as SubscriptionType,
    title: 'Weekly Plan',
    shortLabel: 'Weekly',
    description: 'Perfect for trying out',
    price: '\u20B9500',
    billingLabel: 'Billed every 7 days',
    icon: Calendar,
    color: '#10B981',
    bgColor: '#D1FAE5',
    features: [
      '1 week of premium access',
      'Priority support during your active plan',
      'Access to premium resources and guided tools',
      'Flexible option if you want to try the service first',
    ],
  },
  {
    id: 'monthly' as SubscriptionType,
    title: 'Monthly Plan',
    shortLabel: 'Monthly',
    description: 'Most popular choice',
    price: '\u20B91500',
    billingLabel: 'Billed every month',
    icon: Clock,
    color: '#3B82F6',
    bgColor: '#DBEAFE',
    features: [
      '1 month of uninterrupted premium access',
      'Better value than renewing weekly',
      'Priority support and premium content access',
      'Ideal for consistent month-long care and learning',
    ],
  },
  {
    id: 'yearly' as SubscriptionType,
    title: 'Yearly Plan',
    shortLabel: 'Yearly',
    description: 'Best value for money',
    price: '\u20B912000',
    billingLabel: 'Billed once per year',
    icon: Crown,
    color: '#8B5CF6',
    bgColor: '#EDE9FE',
    features: [
      '12 months of premium access',
      'Best long-term value for regular users',
      'Priority support and premium member benefits',
      'Great for building a steady wellness routine',
    ],
  },
];

export function getSubscriptionPlan(type?: SubscriptionType) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === type);
}
