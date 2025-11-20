import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/lib/api';

export interface SubscriptionInfo {
  hasPremium: boolean;
  subscriptionType?: 'weekly' | 'monthly' | 'yearly';
  expiryDate?: string;
}

class SubscriptionService {
  private static instance: SubscriptionService;
  private subscriptionKey = 'userSubscription';

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  async getSubscriptionInfo(): Promise<SubscriptionInfo> {
    try {
      // First try to get from backend
      try {
        const response = await api.getSubscriptionStatus();
        if (response.success && response.data?.isActive) {
          const subscriptionInfo: SubscriptionInfo = {
            hasPremium: true,
            subscriptionType: this.getSubscriptionTypeFromPlan(response.data.plan, response.data.subscriptionType),
            expiryDate: response.data.endDate
          };
          // Sync with local storage
          await AsyncStorage.setItem(this.subscriptionKey, JSON.stringify(subscriptionInfo));
          return subscriptionInfo;
        } else {
          // No active subscription on backend, clear local storage
          await AsyncStorage.removeItem(this.subscriptionKey);
          return { hasPremium: false };
        }
      } catch (apiError) {
        console.log('Error fetching subscription from backend, using local storage:', apiError);
        // Fallback to local storage if API fails
        const subscriptionData = await AsyncStorage.getItem(this.subscriptionKey);
        if (subscriptionData) {
          const localInfo = JSON.parse(subscriptionData);
          // Check if expired
          if (localInfo.expiryDate && new Date(localInfo.expiryDate) > new Date()) {
            return localInfo;
          } else {
            // Expired, remove from local storage
            await AsyncStorage.removeItem(this.subscriptionKey);
            return { hasPremium: false };
          }
        }
        return { hasPremium: false };
      }
    } catch (error) {
      console.log('Error getting subscription info:', error);
      return { hasPremium: false };
    }
  }

  async setPremiumSubscription(subscriptionType: 'weekly' | 'monthly' | 'yearly'): Promise<void> {
    try {
      const subscriptionInfo: SubscriptionInfo = {
        hasPremium: true,
        subscriptionType,
        expiryDate: this.calculateExpiryDate(subscriptionType)
      };
      await AsyncStorage.setItem(this.subscriptionKey, JSON.stringify(subscriptionInfo));
    } catch (error) {
      console.log('Error setting premium subscription:', error);
    }
  }

  async removeSubscription(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.subscriptionKey);
    } catch (error) {
      console.log('Error removing subscription:', error);
    }
  }

  async hasPremiumSubscription(): Promise<boolean> {
    try {
      const subscriptionInfo = await this.getSubscriptionInfo();
      return subscriptionInfo.hasPremium;
    } catch (error) {
      console.log('Error checking premium subscription:', error);
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

  private calculateExpiryDate(subscriptionType: 'weekly' | 'monthly' | 'yearly'): string {
    const now = new Date();
    let expiryDate: Date;

    switch (subscriptionType) {
      case 'weekly':
        expiryDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        break;
      case 'yearly':
        expiryDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    return expiryDate.toISOString();
  }
}

export default SubscriptionService.getInstance();
