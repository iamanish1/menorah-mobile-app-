import { api } from '@/lib/api';

export interface SubscriptionInfo {
  hasPremium: boolean;
  subscriptionType?: 'weekly' | 'monthly' | 'yearly';
  expiryDate?: string;
}

class SubscriptionService {
  private static instance: SubscriptionService;
  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  async getSubscriptionInfo(): Promise<SubscriptionInfo> {
    try {
      const response = await api.getSubscriptionStatus();
      if (!response.success || !response.data?.isActive) {
        return { hasPremium: false };
      }

      return {
        hasPremium: true,
        subscriptionType: this.getSubscriptionTypeFromPlan(
          response.data.plan,
          response.data.subscriptionType
        ),
        expiryDate: response.data.endDate,
      };
    } catch {
      // Entitlements always fail closed when the server cannot be reached.
      return { hasPremium: false };
    }
  }

  async hasPremiumSubscription(): Promise<boolean> {
    try {
      const subscriptionInfo = await this.getSubscriptionInfo();
      return subscriptionInfo.hasPremium;
    } catch {
      return false;
    }
  }

  private getSubscriptionTypeFromPlan(plan: string, subscriptionType?: string): 'weekly' | 'monthly' | 'yearly' | undefined {
    // Return subscription type from backend if available
    if (subscriptionType && ['weekly', 'monthly', 'yearly'].includes(subscriptionType)) {
      return subscriptionType as 'weekly' | 'monthly' | 'yearly';
    }
    return undefined;
  }
}

export default SubscriptionService.getInstance();
