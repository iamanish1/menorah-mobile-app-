import axios, { AxiosInstance, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from './env';

// Types
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  profileImage?: string;
  dateOfBirth?: string;
  gender?: string;
  notificationPreferences?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
  };
}

export interface Counsellor {
  id: string;
  name: string;
  specialization: string;
  specializations: string[];
  rating: number;
  reviewCount: number;
  experience: number;
  languages: string[];
  hourlyRate: number;
  currency: string;
  profileImage?: string;
  bio?: string;
  education?: string[];
  certifications?: string[];
  availability?: any;
  sessionDuration?: number;
  timezone?: string;
  isAvailable: boolean;
  totalSessions: number;
  stats?: any;
  gallery?: string[];
}

export interface Booking {
  id: string;
  counsellorName: string;
  counsellorImage?: string;
  specialization: string;
  sessionType: 'video' | 'audio' | 'chat';
  sessionDuration: number;
  scheduledAt: string;
  status: 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  amount: number;
  currency: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  canBeCancelled: boolean;
  canBeRescheduled: boolean;
  createdAt?: string; // Date when booking was created/paid
}

export interface ChatRoom {
  id: string;
  counsellorName: string;
  counsellorImage?: string;
  counsellorUserId?: string; // Add counselor userId for presence tracking
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isOnline: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderImage?: string;
  content: string;
  timestamp: string;
  type: 'text' | 'image' | 'file';
  status?: 'sent' | 'delivered' | 'read';
  roomId?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: any[];
}

export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// API Client
class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    console.log('Initializing API Client with baseURL:', ENV.API_BASE_URL);
    
    this.client = axios.create({
      baseURL: ENV.API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      async (config) => {
        if (!this.token) {
          this.token = await AsyncStorage.getItem('auth_token');
        }
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
          console.log('[API] Request with token:', config.method, config.url);
        } else {
          console.log('[API] Request without token:', config.method, config.url);
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle token refresh and errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          await AsyncStorage.removeItem('auth_token');
          this.token = null;
          // You might want to redirect to login here
        }
        return Promise.reject(error);
      }
    );
  }

  // Set auth token
  setToken(token: string) {
    this.token = token;
    AsyncStorage.setItem('auth_token', token);
  }

  // Clear auth token
  clearToken() {
    this.token = null;
    AsyncStorage.removeItem('auth_token');
  }

  // Helper method to remove undefined values from request data
  private cleanRequestData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.cleanRequestData(item));
    }
    
    const cleaned: any = {};
    for (const key of Object.keys(data)) {
      if (data[key] !== undefined) {
        cleaned[key] = this.cleanRequestData(data[key]);
      }
    }
    return cleaned;
  }

  // Generic request method
  private async request<T>(config: any): Promise<ApiResponse<T>> {
    try {
      // Clean request data to remove undefined values
      if (config.data) {
        config.data = this.cleanRequestData(config.data);
      }
      
      const response: AxiosResponse<ApiResponse<T>> = await this.client(config);
      return response.data;
    } catch (error: any) {
      // Check if it's a network error first
      const isNetworkError = error.code === 'ERR_NETWORK' || error.code === 'NETWORK_ERROR' || error.message?.includes('Network Error');
      
      if (isNetworkError) {
        // Log network errors as warnings since they're expected when server is unreachable
        console.warn('API Network Error (server unreachable):', {
          url: config.url,
          method: config.method,
        });
        return {
          success: false,
          message: 'Network error: Unable to connect to server. Please check your internet connection and try again.'
        };
      }
      
      // Log actual errors (non-network errors)
      console.error('API Request Error:', {
        url: config.url,
        method: config.method,
        error: error.message,
        code: error.code,
        response: error.response?.data
      });
      
      if (error.response?.data) {
        return error.response.data;
      }
      
      throw error;
    }
  }

  // Auth API Methods
  async register(userData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
    dateOfBirth: string;
    gender: string;
  }): Promise<ApiResponse<{ user: User; token: string }>> {
    return this.request({
      method: 'POST',
      url: '/auth/register',
      data: userData,
    });
  }

  async login(credentials: { email: string; password: string }): Promise<ApiResponse<{ user: User; token: string }>> {
    return this.request({
      method: 'POST',
      url: '/auth/login',
      data: credentials,
    });
  }

  async verifyEmail(code: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/verify-email',
      data: { code },
    });
  }

  async resendEmailVerification(email: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/resend-email-verification',
      data: { email },
    });
  }

  async verifyPhone(token: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/verify-phone',
      data: { token },
    });
  }

  async forgotPassword(email: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/forgot-password',
      data: { email },
    });
  }

  async resetPassword(token: string, password: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/reset-password',
      data: { token, password },
    });
  }

  async getCurrentUser(): Promise<ApiResponse<{ user: User }>> {
    console.log('[API] getCurrentUser called, baseURL:', this.client.defaults.baseURL);
    return this.request({
      method: 'GET',
      url: '/auth/me',
    });
  }

  async logout(): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/logout',
    });
  }

  // Counsellors API Methods
  async getCounsellors(params?: {
    search?: string;
    specialization?: string;
    language?: string;
    minRating?: number;
    maxPrice?: number;
    minPrice?: number;
    page?: number;
    limit?: number;
    sortBy?: 'rating' | 'price' | 'experience' | 'name';
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<{ counsellors: Counsellor[]; pagination: { page: number; limit: number; total: number; pages: number } }>> {
    return this.request({
      method: 'GET',
      url: '/counsellors',
      params,
    });
  }

  async getCounsellor(id: string): Promise<ApiResponse<{ counsellor: Counsellor }>> {
    return this.request({
      method: 'GET',
      url: `/counsellors/${id}`,
    });
  }

  async getCounsellorAvailability(
    id: string,
    startDate: string,
    endDate: string
  ): Promise<ApiResponse<{ availability: any[] }>> {
    return this.request({
      method: 'GET',
      url: `/counsellors/${id}/availability`,
      params: { startDate, endDate },
    });
  }

  async getSpecializations(): Promise<ApiResponse<{ specializations: string[] }>> {
    return this.request({
      method: 'GET',
      url: '/counsellors/specializations',
    });
  }

  async getLanguages(): Promise<ApiResponse<{ languages: string[] }>> {
    return this.request({
      method: 'GET',
      url: '/counsellors/languages',
    });
  }

  // Bookings API Methods
  async createBooking(bookingData: {
    counsellorId?: string;
    sessionType: 'video' | 'audio' | 'chat';
    sessionDuration: number;
    scheduledAt: string;
    amount?: number;
    preferences?: {
      gender?: string;
      sessionType?: string;
      categoryId?: string;
    };
    symptoms?: string[];
    concerns?: string;
    goals?: string[];
    emergencyContact?: any;
  }): Promise<ApiResponse<{ booking: Booking }>> {
    return this.request({
      method: 'POST',
      url: '/bookings',
      data: bookingData,
    });
  }

  async getBookings(params?: {
    status?: 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<{ bookings: Booking[]; pagination: { page: number; limit: number; total: number; pages: number } }>> {
    return this.request({
      method: 'GET',
      url: '/bookings',
      params,
    });
  }

  async getBooking(id: string): Promise<ApiResponse<{ booking: Booking }>> {
    return this.request({
      method: 'GET',
      url: `/bookings/${id}`,
    });
  }

  async cancelBooking(id: string, reason?: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'PUT',
      url: `/bookings/${id}/cancel`,
      data: { reason },
    });
  }

  async startSession(id: string): Promise<ApiResponse<{ roomUrl?: string; sessionType: string }>> {
    return this.request({
      method: 'PUT',
      url: `/bookings/${id}/start`,
    });
  }

  async completeSession(id: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'PUT',
      url: `/bookings/${id}/complete`,
    });
  }

  // Payments API Methods
  async createCheckoutSession(bookingId: string, paymentMethod: 'stripe' | 'razorpay'): Promise<ApiResponse<any>> {
    return this.request({
      method: 'POST',
      url: '/payments/create-checkout-session',
      data: { bookingId, paymentMethod },
    });
  }

  async verifyRazorpayPayment(paymentData: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    bookingId: string;
  }): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/payments/verify-razorpay',
      data: paymentData,
    });
  }

  async getPaymentStatus(bookingId: string): Promise<ApiResponse<any>> {
    return this.request({
      method: 'GET',
      url: `/payments/booking/${bookingId}`,
    });
  }

  async getRazorpayOrderStatus(orderId: string): Promise<ApiResponse<any>> {
    return this.request({
      method: 'GET',
      url: `/payments/order/${orderId}/status`,
    });
  }

  // Subscription Payment API Methods
  async createSubscriptionCheckout(
    subscriptionType: 'weekly' | 'monthly' | 'yearly',
    paymentMethod: 'stripe' | 'razorpay' = 'razorpay'
  ): Promise<ApiResponse<any>> {
    return this.request({
      method: 'POST',
      url: '/payments/create-subscription-checkout',
      data: { subscriptionType, paymentMethod },
    });
  }

  async verifySubscriptionPayment(paymentData: {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    subscriptionType: 'weekly' | 'monthly' | 'yearly';
    orderId?: string;
  }): Promise<ApiResponse<any>> {
    return this.request({
      method: 'POST',
      url: '/payments/verify-subscription-payment',
      data: paymentData,
    });
  }

  async getSubscriptionStatus(): Promise<ApiResponse<any>> {
    return this.request({
      method: 'GET',
      url: '/payments/subscription/status',
    });
  }

  // Chat API Methods
  async getChatRooms(): Promise<ApiResponse<{ chatRooms: ChatRoom[] }>> {
    return this.request({
      method: 'GET',
      url: '/chat/rooms',
    });
  }

  async getMessages(roomId: string, params?: { page?: number; limit?: number }): Promise<ApiResponse<PaginationResponse<Message>>> {
    return this.request({
      method: 'GET',
      url: `/chat/rooms/${roomId}/messages`,
      params,
    });
  }

  async sendMessage(roomId: string, content: string, type: 'text' | 'image' | 'file' = 'text'): Promise<ApiResponse<{ message: Message }>> {
    return this.request({
      method: 'POST',
      url: `/chat/rooms/${roomId}/messages`,
      data: { content, type },
    });
  }

  async markMessageAsRead(roomId: string, messageId: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'PUT',
      url: `/chat/rooms/${roomId}/messages/${messageId}/read`,
    });
  }

  async deleteMessage(roomId: string, messageId: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'DELETE',
      url: `/chat/rooms/${roomId}/messages/${messageId}`,
    });
  }

  async sendTypingIndicator(roomId: string, isTyping: boolean): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: `/chat/rooms/${roomId}/typing`,
      data: { isTyping },
    });
  }

  // Get available counselors for chat
  async getAvailableCounsellors(): Promise<ApiResponse<{ counsellors: any[] }>> {
    return this.request({
      method: 'GET',
      url: '/chat/available-counsellors',
    });
  }

  // Start a chat with a counselor
  async startChat(counsellorId: string): Promise<ApiResponse<{ room: any }>> {
    return this.request({
      method: 'POST',
      url: '/chat/start',
      data: { counsellorId },
    });
  }

  // Video Call API Methods
  async createVideoRoom(bookingId: string): Promise<ApiResponse<{ roomId: string; roomUrl: string; jitsiToken: string; sessionType: string; counsellorName: string; userName: string; scheduledAt: string; duration: number }>> {
    return this.request({
      method: 'POST',
      url: '/video/create-room',
      data: { bookingId },
    });
  }

  async getVideoRoom(bookingId: string): Promise<ApiResponse<{ roomId: string; roomUrl: string; jitsiToken: string; sessionType: string; counsellorName: string; userName: string; scheduledAt: string; duration: number; status: string }>> {
    return this.request({
      method: 'GET',
      url: `/video/room/${bookingId}`,
    });
  }

  async joinVideoRoom(bookingId: string): Promise<ApiResponse<{ roomId: string; roomUrl: string; jitsiToken: string; sessionType: string; counsellorName: string; userName: string; scheduledAt: string; duration: number; status: string }>> {
    return this.request({
      method: 'POST',
      url: `/video/room/${bookingId}/join`,
    });
  }

  async leaveVideoRoom(bookingId: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: `/video/room/${bookingId}/leave`,
    });
  }

  // Profile/User API Methods
  async updateProfile(profileData: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    gender?: string;
    preferredLanguage?: string;
    timezone?: string;
    profileImage?: string;
  }): Promise<ApiResponse<{ user: User }>> {
    return this.request({
      method: 'PUT',
      url: '/users/profile',
      data: profileData,
    });
  }

  async updateAddress(addressData: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  }): Promise<ApiResponse<{ user: User }>> {
    return this.request({
      method: 'PUT',
      url: '/users/address',
      data: addressData,
    });
  }

  async updateEmergencyContact(contactData: {
    name?: string;
    relationship?: string;
    phone?: string;
  }): Promise<ApiResponse<{ user: User }>> {
    return this.request({
      method: 'PUT',
      url: '/users/emergency-contact',
      data: contactData,
    });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'PUT',
      url: '/users/change-password',
      data: { currentPassword, newPassword },
    });
  }

  async updateNotificationPreferences(preferences: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
  }): Promise<ApiResponse<{ user: User }>> {
    return this.request({
      method: 'PUT',
      url: '/users/notification-preferences',
      data: preferences,
    });
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<any>> {
    return this.request({
      method: 'GET',
      url: '/health',
    });
  }
}

// Export singleton instance
export const api = new ApiClient();

// Legacy function for backward compatibility
export async function listCounsellors(): Promise<Counsellor[]> {
  try {
    const response = await api.getCounsellors();
    return response.data?.counsellors || [];
  } catch (error) {
    console.error('Error fetching counsellors:', error);
    return [];
  }
}
