'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Crown, Zap, Star, CreditCard, Shield } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Badge, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/utils';
import { getCspNonce } from '@/lib/cspNonce';

const SUBSCRIPTION_PURCHASES_AVAILABLE = false;

interface Plan {
  id: string;
  name: string;
  type: 'weekly' | 'monthly' | 'yearly';
  price: number;
  currency: string;
  sessionsIncluded: number;
  features: string[];
  popular?: boolean;
  icon: React.ElementType;
  badge?: string;
}

const plans: Plan[] = [
  {
    id: 'weekly',
    name: 'Weekly',
    type: 'weekly',
    price: 999,
    currency: 'INR',
    sessionsIncluded: 1,
    icon: Zap,
    features: [
      '1 session per week',
      'Video, audio & chat',
      'Choose your counsellor',
      'Cancel anytime',
    ],
  },
  {
    id: 'monthly',
    name: 'Monthly',
    type: 'monthly',
    price: 3499,
    currency: 'INR',
    sessionsIncluded: 4,
    icon: Star,
    popular: true,
    badge: 'Most Popular',
    features: [
      '4 sessions per month',
      'Video, audio & chat',
      'Priority counsellor matching',
      'Cancel anytime',
    ],
  },
  {
    id: 'yearly',
    name: 'Yearly',
    type: 'yearly',
    price: 29999,
    currency: 'INR',
    sessionsIncluded: 52,
    icon: Crown,
    badge: 'Best Value',
    features: [
      '52 sessions per year',
      'Video, audio & chat',
      'Dedicated counsellor',
      'Priority support',
      'Progress reports',
    ],
  },
];

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) { resolve(true); return; }
    const s = document.createElement('script');
    s.nonce = getCspNonce() || '';
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function SubscriptionPage() {
  const { user, refreshUser } = useAuth();
  const [selected, setSelected]   = useState<Plan['type']>('monthly');
  const [paying, setPaying]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);

  const { data: statusData } = useQuery({
    queryKey: ['subscriptionStatus'],
    queryFn:  () => api.getSubscriptionStatus(),
  });

  const subscription = statusData?.data ?? user?.subscription;
  const isActive     = subscription?.isActive && subscription?.plan !== 'free';
  const selectedPlan = plans.find((p) => p.type === selected)!;

  if (!SUBSCRIPTION_PURCHASES_AVAILABLE) {
    return (
      <div className="page-container max-w-2xl">
        <div className="text-center mb-8 rounded-[1.75rem] border border-primary-100 bg-primary-50 px-5 py-6 dark:border-primary-800 dark:bg-primary-900/70">
          <h1 className="app-page-heading">Subscriptions</h1>
          <p className="app-page-subtitle mt-2">
            New subscription purchases are temporarily unavailable while payment reconciliation is completed.
          </p>
        </div>

        {isActive && subscription && (
          <div className="card p-4 bg-primary-50 border-primary-200 flex items-center gap-3 dark:bg-primary-900 dark:border-primary-700">
            <Crown className="w-5 h-5 text-primary-600 shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-primary-800 dark:text-primary-100 text-sm">
                Your existing {subscription.plan} entitlement remains active
                {subscription.endDate && ` until ${new Date(subscription.endDate).toLocaleDateString()}`}
              </p>
            </div>
            <Badge variant="primary">Active</Badge>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600 dark:border-primary-800 dark:bg-primary-950 dark:text-primary-100/75">
          No payment can be started from this page. Existing subscription status remains available in your account.
        </div>
      </div>
    );
  }

  const handleRazorpay = async () => {
    setPaying(true);
    setError('');

    const loaded = await loadRazorpay();
    if (!loaded) { setError('Failed to load payment gateway.'); setPaying(false); return; }

    const res = await api.createSubscriptionCheckout(selected);
    if (!res.success || !res.data?.orderId) {
      setError(res.message || 'Failed to create subscription session');
      setPaying(false);
      return;
    }

    const { orderId, amount, currency } = res.data;

    const rzp = new window.Razorpay({
      key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      amount:      amount ?? (selectedPlan.price * 100),  // backend returns paise; fallback multiplies INR to paise
      currency:    currency ?? 'INR',
      order_id:    orderId,
      name:        'Menorah Health',
      description: `${selectedPlan.name} Subscription`,
      theme:       { color: '#3d9470' },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verify = await api.verifySubscriptionPayment({
          ...response,
          subscriptionType: selected,
          orderId,
        });
        setPaying(false);
        if (verify.success) {
          setSuccess(true);
          await refreshUser();
        } else {
          setError(verify.message || 'Payment verification failed');
        }
      },
      modal: { ondismiss: () => setPaying(false) },
    });
    rzp.open();
  };


  if (success) {
    return (
      <div className="page-container max-w-md text-center space-y-6 pt-10">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-primary-100 rounded-full mx-auto">
          <Crown className="w-10 h-10 text-primary-600" />
        </div>
        <div>
          <h1 className="app-page-heading">You&apos;re subscribed!</h1>
          <p className="app-page-subtitle mt-2">Welcome to Menorah {selectedPlan.name} plan. Start booking sessions now.</p>
        </div>
        <Button fullWidth onClick={() => window.location.href = '/bookings/new'}>
          Book a Session
        </Button>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="text-center mb-8 rounded-[1.75rem] border border-primary-100 bg-primary-50 px-5 py-6 dark:border-primary-800 dark:bg-primary-900/70">
        <h1 className="app-page-heading">Choose your plan</h1>
        <p className="app-page-subtitle mt-2">Compare plan prices and included-session limits before purchase</p>
      </div>

      {/* Current subscription status */}
      {isActive && subscription && (
        <div className="max-w-2xl mx-auto mb-6">
          <div className="card p-4 bg-primary-50 border-primary-200 flex items-center gap-3 dark:bg-primary-900 dark:border-primary-700">
            <Crown className="w-5 h-5 text-primary-600 shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-primary-800 dark:text-primary-100 text-sm">
                Active {subscription.plan} plan
                {subscription.endDate && ` • Renews ${new Date(subscription.endDate).toLocaleDateString()}`}
              </p>
            </div>
            <Badge variant="primary">Active</Badge>
          </div>
        </div>
      )}

      {error && (
        <div className="max-w-2xl mx-auto mb-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-200">{error}</div>
        </div>
      )}

      <SegmentedControl
        ariaLabel="Subscription plan"
        className="mx-auto mb-6 max-w-xl"
        value={selected}
        options={plans.map(({ name, type, icon }) => ({ label: name, value: type, icon }))}
        onChange={(value) => setSelected(value as Plan['type'])}
      />

      {/* Plan cards */}
      <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
        {plans.map((plan) => {
          const Icon = plan.icon;
          const isSelected = selected === plan.type;
          return (
            <div
              key={plan.id}
              onClick={() => setSelected(plan.type)}
              className={`card p-6 cursor-pointer transition-all relative
                ${isSelected ? 'border-2 border-primary-500 shadow-md' : 'border-2 border-transparent hover:border-primary-200 dark:hover:border-primary-700'}`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant={plan.type === 'yearly' ? 'warning' : 'primary'} size="md">
                    {plan.badge}
                  </Badge>
                </div>
              )}

              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4
                ${isSelected ? 'bg-primary-600 text-white dark:bg-primary-500' : 'bg-primary-50 text-primary-600 dark:bg-primary-800 dark:text-primary-100'}`}>
                <Icon className="w-6 h-6" />
              </div>

              <h3 className="text-lg font-black text-gray-950 dark:text-primary-50">{plan.name}</h3>
              <div className="mt-1 mb-4">
                <span className="text-3xl font-black text-gray-950 dark:text-primary-50">{formatCurrency(plan.price, plan.currency)}</span>
                <span className="text-gray-500 dark:text-primary-100/65 text-sm ml-1">/{plan.type === 'yearly' ? 'year' : plan.type === 'monthly' ? 'mo' : 'wk'}</span>
              </div>
              <p className="text-sm text-primary-600 dark:text-primary-300 font-bold mb-4">{plan.sessionsIncluded} sessions included</p>

              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600 dark:text-primary-100/70">
                    <CheckCircle className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              {isSelected && (
                <div className="mt-4 w-full py-2 bg-primary-600 text-white text-sm font-bold rounded-full text-center dark:bg-primary-500">
                  Selected
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Payment method & CTA */}
      <div className="max-w-sm mx-auto space-y-4">
        <Button
          fullWidth size="lg" loading={paying}
          onClick={handleRazorpay}
        >
          <CreditCard className="w-5 h-5" />
          Subscribe · {formatCurrency(selectedPlan.price, selectedPlan.currency)}
        </Button>

        <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 dark:text-primary-100/50">
          <Shield className="w-3.5 h-3.5" />
          Secure payment · Cancel anytime
        </div>
      </div>
    </div>
  );
}
