import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { secureStorage } from './secureStorage';
import { ENV } from './env';
import type { Article } from '@/types/article';

// Types
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  profileImage?: string | null;
  dateOfBirth?: string;
  gender?: string;
  notificationPreferences?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
  };
  kyc?: {
    status: KycStatus;
    provider?: string | null;
    submittedAt?: string;
    verifiedAt?: string;
    reviewedAt?: string;
    reviewReason?: string;
    faceCheckConfidence?: number;
  };
  createdAt?: string;
}

export type KycStatus = 'not_started' | 'pending' | 'verified' | 'manual_review' | 'rejected';

export interface KycVerification {
  id: string;
  status: KycStatus;
  provider: string;
  checkType: string;
  submittedAt?: string;
  verifiedAt?: string;
  reviewedAt?: string;
  reviewReason?: string;
  failureReason?: string;
  faceCount?: number | null;
  faceCheckConfidence?: number | null;
  threshold?: number | null;
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
  paymentMethod?: 'razorpay' | 'wallet' | 'subscription';
  isSubscriptionBooking?: boolean;
  canBeCancelled: boolean;
  canBeRescheduled: boolean;
  createdAt?: string; // Date when booking was created/paid
}

export interface VideoRoomSession {
  roomId: string;
  livekitUrl: string;
  livekitToken: string;
  roomUrl?: string;
  jitsiToken?: string;
  sessionType: string;
  counsellorName: string;
  userName: string;
  scheduledAt: string;
  duration: number;
  status?: string;
}

export interface ChatRoom {
  id: string;
  counsellorName: string;
  counsellorImage?: string | null;
  counsellorUserId?: string;
  specialization?: string;
  lastMessage: string;
  lastMessageTime: string;
  lastMessageSenderId?: string;
  unreadCount: number;
  isOnline: boolean;
}

export interface Message {
  _id?: string;
  id: string;
  senderId: string;
  senderName: string;
  sender?: string | {
    _id?: string;
    firstName?: string;
    lastName?: string;
    profileImage?: string | null;
  };
  senderImage?: string | null;
  content: string;
  timestamp: string;
  createdAt?: string;
  type: 'text' | 'image' | 'file';
  status?: 'sent' | 'delivered' | 'read';
  roomId?: string;
}

export interface ReportUserPayload {
  userId: string;
  roomId?: string;
  reason: string;
  details?: string;
}

export interface ReportContentPayload {
  contentType: 'message' | 'post' | 'chat';
  contentId: string;
  roomId?: string;
  reportedUserId?: string;
  reason: string;
  details?: string;
}

export interface ApiValidationError {
  type?: string;
  value?: unknown;
  msg?: string;
  message?: string;
  path?: string;
  param?: string;
  location?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: ApiValidationError[];
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

export interface ProfileImageUpload {
  uri: string;
  name?: string;
  type?: string;
}

// API Client
class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    if (__DEV__) {
      console.log('Initializing API Client with baseURL:', ENV.API_BASE_URL);
    }
    
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
          this.token = await secureStorage.getToken();
        }
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
          this.logDebug('[API] Request with token:', {
            method: config.method,
            url: config.url,
            hasBearerToken: true,
          });
        } else {
          this.logDebug('[API] Request without token:', {
            method: config.method,
            url: config.url,
          });
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
          await secureStorage.clearToken();
          this.token = null;
        }
        return Promise.reject(error);
      }
    );
  }

  private stringifyForLog(value: unknown) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private logDebug(label: string, value?: unknown) {
    if (!__DEV__) return;

    if (value === undefined) {
      console.log(label);
      return;
    }

    console.log(label, typeof value === 'string' ? value : this.stringifyForLog(value));
  }

  private buildUrl(path: string) {
    const baseURL = this.client.defaults.baseURL?.replace(/\/+$/, '') || '';
    return `${baseURL}${path.startsWith('/') ? path : `/${path}`}`;
  }

  // Set auth token — stored in device secure enclave (Keychain/Keystore)
  async setToken(token: string) {
    this.token = token;
    await secureStorage.setToken(token);
  }

  // Clear auth token
  async clearToken() {
    this.token = null;
    await secureStorage.clearToken();
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

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
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
        this.logDebug('API Network Error (server unreachable):', {
          url: config.url,
          method: config.method,
        });
        return {
          success: false,
          message: 'Network error: Unable to connect to server. Please check your internet connection and try again.'
        };
      }
      
      // Log actual errors (non-network errors). Stringify keeps nested validation errors visible.
      const responseData = error.response?.data;
      if (__DEV__) {
        console.error('API Request Error:', this.stringifyForLog({
          url: config.url,
          method: config.method,
          error: error.message,
          code: error.code,
          status: error.response?.status,
          response: responseData
        }));
      }
      
      if (responseData) {
        return responseData;
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
  }): Promise<ApiResponse<{ user?: User; token?: string; email?: string }>> {
    this.logDebug('[API] API BASE URL:', this.client.defaults.baseURL);
    this.logDebug('[API] POST /auth/register endpoint URL:', this.buildUrl('/auth/register'));
    this.logDebug('[API] REGISTER PAYLOAD KEYS:', Object.keys(userData));
    this.logDebug('[API] POST /auth/register payload:', {
      ...userData,
      password: `[redacted; length=${userData.password.length}]`,
    });

    return this.request({
      method: 'POST',
      url: '/auth/register',
      data: {
        ...userData,
        firstName: userData.firstName.trim(),
        lastName: userData.lastName.trim(),
        email: this.normalizeEmail(userData.email),
        phone: userData.phone.trim(),
        dateOfBirth: userData.dateOfBirth.trim(),
      },
    });
  }

  async login(credentials: { email: string; password: string }): Promise<ApiResponse<{ user: User; token: string }>> {
    const payload = {
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
    };

    this.logDebug('[API] API BASE URL:', this.client.defaults.baseURL);
    this.logDebug('[API] POST /auth/login endpoint URL:', this.buildUrl('/auth/login'));
    this.logDebug('[API] LOGIN PAYLOAD KEYS:', Object.keys(payload));
    this.logDebug('[API] POST /auth/login payload:', {
      email: payload.email,
      password: `[redacted; length=${payload.password.length}]`,
    });

    return this.request({
      method: 'POST',
      url: '/auth/login',
      data: payload,
    });
  }

  async verifyEmail(code: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/verify-email',
      data: { code },
    });
  }

  async verifyEmailOtp(email: string, otp: string): Promise<ApiResponse<{ user: User; token: string }>> {
    return this.request({
      method: 'POST',
      url: '/auth/verify-email-otp',
      data: { email: this.normalizeEmail(email), otp: otp.trim() },
    });
  }

  async resendEmailVerification(email: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/resend-email-verification',
      data: { email: this.normalizeEmail(email) },
    });
  }

  async resendEmailOtp(email: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/resend-email-otp',
      data: { email: this.normalizeEmail(email) },
    });
  }

  async verifyPhone(phone: string, otp: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/verify-phone',
      data: { phone, otp },
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
    this.logDebug('[API] getCurrentUser called:', {
      baseURL: this.client.defaults.baseURL,
      endpoint: this.buildUrl('/users/me'),
    });

    return this.request({
      method: 'GET',
      url: '/users/me',
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

  // Articles API Methods
  async getArticles(params?: {
    page?: number;
    limit?: number;
    category?: string;
    q?: string;
  }): Promise<ApiResponse<{ articles: Article[]; pagination: { page: number; limit: number; total: number; pages: number } }>> {
    return this.request({
      method: 'GET',
      url: '/articles',
      params,
    });
  }

  async getArticle(slug: string): Promise<ApiResponse<{ article: Article }>> {
    return this.request({
      method: 'GET',
      url: `/articles/${slug}`,
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
    status?: string;
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
  async createCheckoutSession(bookingId: string): Promise<ApiResponse<any>> {
    return this.request({
      method: 'POST',
      url: '/payments/create-checkout-session',
      data: { bookingId },
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
    subscriptionType: 'weekly' | 'monthly' | 'yearly'
  ): Promise<ApiResponse<any>> {
    return this.request({
      method: 'POST',
      url: '/payments/create-subscription-checkout',
      data: { subscriptionType },
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

  async getMessages(roomId: string, params?: { page?: number; limit?: number }): Promise<ApiResponse<{ messages: Message[]; pagination: { page: number; limit: number; total: number; pages: number } }>> {
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

  async reportUser(payload: ReportUserPayload): Promise<ApiResponse<void>> {
    // TODO: Confirm the production moderation endpoint path with the backend team.
    const response = await this.request<void>({
      method: 'POST',
      url: '/moderation/report-user',
      data: payload,
    });

    return response.message
      ? response
      : {
          ...response,
          message: response.success
            ? 'Report submitted.'
            : 'Report user endpoint is not connected yet. Please contact support so the team can review this manually.',
        };
  }

  async reportContent(payload: ReportContentPayload): Promise<ApiResponse<void>> {
    // TODO: Confirm the production moderation endpoint path with the backend team.
    const response = await this.request<void>({
      method: 'POST',
      url: '/moderation/report-content',
      data: payload,
    });

    return response.message
      ? response
      : {
          ...response,
          message: response.success
            ? 'Report submitted.'
            : 'Report content endpoint is not connected yet. Please contact support so the team can review this manually.',
        };
  }

  async blockUser(userId: string, roomId?: string): Promise<ApiResponse<void>> {
    // TODO: Confirm the production blocking endpoint path with the backend team.
    const response = await this.request<void>({
      method: 'POST',
      url: '/moderation/block-user',
      data: { userId, roomId },
    });

    return response.message
      ? response
      : {
          ...response,
          message: response.success
            ? 'User blocked.'
            : 'Block user endpoint is not connected yet. Please contact support so the team can review this manually.',
        };
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
  async createVideoRoom(bookingId: string): Promise<ApiResponse<VideoRoomSession>> {
    return this.request({
      method: 'POST',
      url: '/video/create-room',
      data: { bookingId },
    });
  }

  async getVideoRoom(bookingId: string): Promise<ApiResponse<VideoRoomSession>> {
    return this.request({
      method: 'GET',
      url: `/video/room/${bookingId}`,
    });
  }

  async joinVideoRoom(bookingId: string): Promise<ApiResponse<VideoRoomSession>> {
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

  async updateProfileWithImage(profileData: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    gender?: string;
    preferredLanguage?: string;
    timezone?: string;
    profileImage?: ProfileImageUpload;
  }): Promise<ApiResponse<{ user: User }>> {
    try {
      const formData = new FormData();

      Object.entries(profileData).forEach(([key, value]) => {
        if (!value || key === 'profileImage') {
          return;
        }
        formData.append(key, String(value));
      });

      if (profileData.profileImage?.uri) {
        formData.append('profileImage', {
          uri: profileData.profileImage.uri,
          name: profileData.profileImage.name || `profile-${Date.now()}.jpg`,
          type: profileData.profileImage.type || 'image/jpeg',
        } as any);
      }

      const response = await this.client.put('/users/profile', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      if (errorResponse) {
        return errorResponse;
      }

      const isNetworkError = error.code === 'ERR_NETWORK' || error.code === 'NETWORK_ERROR' || error.message?.includes('Network Error');
      if (isNetworkError) {
        return {
          success: false,
          message: 'Network error: Unable to upload image. Please check your internet connection and try again.'
        };
      }

      return {
        success: false,
        message: error.message || 'Failed to update profile image',
      };
    }
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

  async getKycStatus(): Promise<ApiResponse<{ status: KycStatus; verification: KycVerification | null }>> {
    return this.request({
      method: 'GET',
      url: '/ekyc/status',
    });
  }

  async submitKycVerification(payload: {
    selfie: ProfileImageUpload;
    consentAccepted: boolean;
  }): Promise<ApiResponse<{ status: KycStatus; verification: KycVerification; kyc: User['kyc'] }>> {
    try {
      const formData = new FormData();
      formData.append('consentAccepted', payload.consentAccepted ? 'true' : 'false');
      formData.append('selfie', {
        uri: payload.selfie.uri,
        name: payload.selfie.name || `selfie-${Date.now()}.jpg`,
        type: payload.selfie.type || 'image/jpeg',
      } as any);

      const response = await this.client.post('/ekyc/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });

      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      if (errorResponse) return errorResponse;

      const isNetworkError = error.code === 'ERR_NETWORK' || error.code === 'NETWORK_ERROR' || error.message?.includes('Network Error');
      return {
        success: false,
        message: isNetworkError
          ? 'Network error: Unable to submit identity verification. Please check your connection and try again.'
          : error.message || 'Identity verification failed',
      };
    }
  }

  async updatePrivacyPreferences(preferences: {
    profileVisibility?: 'public' | 'counsellors' | 'private';
    showEmail?: boolean;
    showPhone?: boolean;
    allowMessages?: boolean;
  }): Promise<ApiResponse<void>> {
    // TODO: Confirm the production privacy-preferences endpoint path with the backend team.
    const response = await this.request<void>({
      method: 'PUT',
      url: '/users/privacy-preferences',
      data: preferences,
    });

    return response.message
      ? response
      : {
          ...response,
          message: response.success
            ? 'Privacy preferences saved.'
            : 'Privacy preferences endpoint is not connected yet. Please contact support if you need this changed now.',
        };
  }

  async requestAccountDeletion(reason?: string): Promise<ApiResponse<void>> {
    // TODO: Confirm the production account-deletion endpoint path with the backend team.
    const response = await this.request<void>({
      method: 'POST',
      url: '/users/account-deletion-request',
      data: {
        reason: reason || 'User requested account deletion from the mobile app.',
      },
    });

    return response.message
      ? response
      : {
          ...response,
          message: response.success
            ? 'Account deletion request submitted.'
            : 'Account deletion endpoint is not connected yet. Please contact support so the team can process this manually.',
        };
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
