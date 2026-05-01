export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileImage?: string;
  role: 'user' | 'counsellor' | 'admin';
}

export interface Booking {
  id: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  userImage?: string;
  userGender?: string;
  sessionType: 'video' | 'audio' | 'chat';
  sessionDuration: number;
  scheduledAt: string;
  status: 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  amount: number;
  currency: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentMethod?: 'stripe' | 'razorpay' | 'wallet' | 'subscription';
  isSubscriptionBooking?: boolean;
  symptoms?: string[];
  concerns?: string;
  goals?: string[];
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  preferences?: {
    gender?: string;
    sessionType?: string;
    categoryId?: string;
  };
  assignedAt?: string;
  createdAt?: string;
}

export interface CounsellorStatus {
  isActive: boolean;
  isAvailable: boolean;
  message: string;
}

export interface DashboardStats {
  totalBookings: number;
  upcomingSessions: number;
  pendingAssignments: number;
  monthlyEarnings: {
    amount: number;
    currency: string;
  };
}

export interface TodaySchedule {
  id: string;
  userName: string;
  userImage?: string;
  sessionType: 'video' | 'audio' | 'chat';
  sessionDuration: number;
  scheduledAt: string;
  status: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: any[];
}

