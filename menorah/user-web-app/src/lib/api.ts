import axios, { AxiosInstance, AxiosResponse } from 'axios';
import type {
  ApiResponse, User, Counsellor, CounsellorFilters,
  Booking, ChatRoom, ChatMessage, VideoRoom,
  Article, ArticleFilters, ArticlePagination,
} from '@/types';

export const UNAUTHORIZED_EVENT = 'menorah:unauthorized';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true,
    });

    this.client.interceptors.response.use(
      (res) => res,
      (error) => {
        if (error.response?.status === 401 && typeof window !== 'undefined') {
          window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        }
        return Promise.reject(error);
      }
    );
  }

  private async get<T>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    try {
      const res: AxiosResponse<ApiResponse<T>> = await this.client.get(url, { params });
      return res.data;
    } catch (err: unknown) {
      return this.handleError<T>(err, `GET ${url} failed`);
    }
  }

  private async post<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    try {
      const res: AxiosResponse<ApiResponse<T>> = await this.client.post(url, body);
      return res.data;
    } catch (err: unknown) {
      return this.handleError<T>(err, `POST ${url} failed`);
    }
  }

  private async put<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    try {
      const res: AxiosResponse<ApiResponse<T>> = await this.client.put(url, body);
      return res.data;
    } catch (err: unknown) {
      return this.handleError<T>(err, `PUT ${url} failed`);
    }
  }

  private async putFormData<T>(url: string, formData: FormData): Promise<ApiResponse<T>> {
    try {
      const res: AxiosResponse<ApiResponse<T>> = await this.client.put(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    } catch (err: unknown) {
      return this.handleError<T>(err, `PUT ${url} failed`);
    }
  }

  private async del<T>(url: string): Promise<ApiResponse<T>> {
    try {
      const res: AxiosResponse<ApiResponse<T>> = await this.client.delete(url);
      return res.data;
    } catch (err: unknown) {
      return this.handleError<T>(err, `DELETE ${url} failed`);
    }
  }

  private handleError<T>(err: unknown, fallback: string): ApiResponse<T> {
    const e = err as { response?: { data?: ApiResponse<T>; status?: number } };
    return {
      success: false,
      message: e.response?.data?.message || fallback,
      errors:  e.response?.data?.errors  || [],
    };
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────
  async register(data: {
    firstName: string; lastName: string; email: string;
    phone: string; password: string; dateOfBirth: string; gender: string;
  }): Promise<ApiResponse<{ email: string }>> {
    return this.post<{ email: string }>('/auth/register', data);
  }

  async login(email: string, password: string): Promise<ApiResponse<{ user: User }>> {
    return this.post<{ user: User }>('/auth/login', { email, password, transport: 'cookie' });
  }

  async loginWithGoogle(credential: string): Promise<ApiResponse<{ user: User; isNewUser?: boolean }>> {
    return this.post<{ user: User; isNewUser?: boolean }>('/auth/google', { credential, transport: 'cookie' });
  }

  async verifyEmail(email: string, code: string): Promise<ApiResponse<void>> {
    return this.post<void>('/auth/verify-email', { email, code, transport: 'cookie' });
  }

  async resendOTP(phone: string): Promise<ApiResponse<void>> {
    return this.post<void>('/auth/resend-otp', { phone });
  }

  async verifyPhone(phone: string, otp: string): Promise<ApiResponse<{ user: User }>> {
    return this.post<{ user: User }>('/auth/verify-phone', { phone, otp });
  }

  async verifyEmailOTP(email: string, otp: string): Promise<ApiResponse<{ user: User }>> {
    return this.post<{ user: User }>('/auth/verify-email-otp', { email, otp, transport: 'cookie' });
  }

  async resendEmailOTP(email: string): Promise<ApiResponse<void>> {
    return this.post<void>('/auth/resend-email-otp', { email });
  }

  async resendEmailVerification(email: string): Promise<ApiResponse<void>> {
    return this.post<void>('/auth/resend-email-verification', { email });
  }

  async forgotPassword(email: string): Promise<ApiResponse<void>> {
    return this.post<void>('/auth/forgot-password', { email });
  }

  async resetPassword(token: string, password: string): Promise<ApiResponse<void>> {
    return this.post<void>('/auth/reset-password', { token, password });
  }

  async getCurrentUser(): Promise<ApiResponse<{ user: User }>> {
    return this.get<{ user: User }>('/users/me');
  }

  async logout(): Promise<void> {
    try { await this.client.post('/auth/logout'); } catch { /* ignore */ }
  }

  async logoutAll(): Promise<void> {
    await this.client.post('/auth/logout-all');
  }

  // ─── Users ─────────────────────────────────────────────────────────────────
  async updateProfile(data: Partial<User>): Promise<ApiResponse<{ user: User }>> {
    return this.put<{ user: User }>('/users/profile', data);
  }

  async updateProfileWithImage(formData: FormData): Promise<ApiResponse<{ user: User }>> {
    return this.putFormData<{ user: User }>('/users/profile', formData);
  }

  async updateAddress(data: User['address']): Promise<ApiResponse<{ user: User }>> {
    return this.put<{ user: User }>('/users/address', data);
  }

  async updateEmergencyContact(data: User['emergencyContact']): Promise<ApiResponse<{ user: User }>> {
    return this.put<{ user: User }>('/users/emergency-contact', data);
  }

  async updateNotificationPreferences(data: User['notificationPreferences']): Promise<ApiResponse<{ user: User }>> {
    return this.put<{ user: User }>('/users/notification-preferences', data);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    return this.put<void>('/users/change-password', { currentPassword, newPassword });
  }

  // Articles
  async getArticles(filters?: ArticleFilters): Promise<ApiResponse<{ articles: Article[]; pagination: ArticlePagination }>> {
    return this.get<{ articles: Article[]; pagination: ArticlePagination }>('/articles', filters as Record<string, unknown>);
  }

  async getArticleCategories(): Promise<ApiResponse<{ categories: string[] }>> {
    return this.get<{ categories: string[] }>('/articles/categories/list');
  }

  async getArticle(slug: string): Promise<ApiResponse<{ article: Article }>> {
    return this.get<{ article: Article }>(`/articles/${encodeURIComponent(slug)}`);
  }

  // ─── Counsellors ───────────────────────────────────────────────────────────
  async getCounsellors(filters?: CounsellorFilters): Promise<ApiResponse<{ counsellors: Counsellor[]; pagination: ApiResponse['pagination'] }>> {
    return this.get<{ counsellors: Counsellor[]; pagination: ApiResponse['pagination'] }>('/counsellors', filters as Record<string, unknown>);
  }

  async getCounsellor(id: string): Promise<ApiResponse<{ counsellor: Counsellor }>> {
    return this.get<{ counsellor: Counsellor }>(`/counsellors/${id}`);
  }

  async getCounsellorAvailability(
    id: string,
    startDate: string,
    endDate: string,
    duration?: number,
  ): Promise<ApiResponse<{ availability: Array<{
    date: string;
    dayOfWeek: string;
    timezone: string;
    sessionDuration: number;
    isAvailable: boolean;
    slots: Array<{
      startTime: string;
      endTime: string;
      startsAt: string;
      endsAt: string;
      status: 'available' | 'booked' | 'pending' | 'unavailable' | 'past';
      isSelectable: boolean;
      label: string;
      statusLabel: string;
    }>;
  }>; date?: string; timezone?: string; holdMinutes?: number }>> {
    return this.get<{ availability: Array<{
      date: string;
      dayOfWeek: string;
      timezone: string;
      sessionDuration: number;
      isAvailable: boolean;
      slots: Array<{
        startTime: string;
        endTime: string;
        startsAt: string;
        endsAt: string;
        status: 'available' | 'booked' | 'pending' | 'unavailable' | 'past';
        isSelectable: boolean;
        label: string;
        statusLabel: string;
      }>;
    }>; date?: string; timezone?: string; holdMinutes?: number }>(`/counsellors/${id}/availability`, { startDate, endDate, duration });
  }

  async getSpecializations(): Promise<ApiResponse<{ specializations: string[] }>> {
    return this.get<{ specializations: string[] }>('/counsellors/specializations');
  }

  async getLanguages(): Promise<ApiResponse<{ languages: string[] }>> {
    return this.get<{ languages: string[] }>('/counsellors/languages');
  }

  // ─── Bookings ──────────────────────────────────────────────────────────────
  async createBooking(data: {
    counsellorId?: string;
    sessionType: string;
    sessionDuration: number;
    scheduledAt?: string;
    amount?: number;
    promoCode?: string;
    preferences?: { gender?: string; sessionType?: string };
    symptoms?: string[];
    concerns?: string;
    goals?: string[];
    emergencyContact?: { name?: string; relationship?: string; phone?: string };
  }): Promise<ApiResponse<{ booking: Booking }>> {
    return this.post<{ booking: Booking }>('/bookings', data);
  }

  async getBookings(params?: { status?: string; page?: number; limit?: number }): Promise<ApiResponse<{ bookings: Booking[]; pagination: ApiResponse['pagination'] }>> {
    return this.get<{ bookings: Booking[]; pagination: ApiResponse['pagination'] }>('/bookings', params as Record<string, unknown>);
  }

  async getBooking(id: string): Promise<ApiResponse<{ booking: Booking }>> {
    return this.get<{ booking: Booking }>(`/bookings/${id}`);
  }

  async cancelBooking(id: string, reason?: string): Promise<ApiResponse<{ booking: Booking }>> {
    return this.put<{ booking: Booking }>(`/bookings/${id}/cancel`, { reason });
  }

  async rescheduleBooking(id: string, scheduledAt: string): Promise<ApiResponse<{ booking: Booking }>> {
    return this.put<{ booking: Booking }>(`/bookings/${id}/reschedule`, { scheduledAt });
  }

  async startSession(id: string): Promise<ApiResponse<{ roomUrl?: string; sessionType: string }>> {
    return this.put<{ roomUrl?: string; sessionType: string }>(`/bookings/${id}/start`);
  }

  // ─── Payments ──────────────────────────────────────────────────────────────
  async createCheckoutSession(
    bookingId: string,
  ): Promise<ApiResponse<{ sessionId?: string; sessionUrl?: string; orderId?: string; amount?: number; currency?: string; paymentMethod: string; alreadyPaid?: boolean }>> {
    return this.post<{ sessionId?: string; sessionUrl?: string; orderId?: string; amount?: number; currency?: string; paymentMethod: string; alreadyPaid?: boolean }>(
      '/payments/create-checkout-session',
      { bookingId },
    );
  }

  async verifyRazorpayPayment(data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    bookingId: string;
  }): Promise<ApiResponse<void>> {
    return this.post<void>('/payments/verify-razorpay', data);
  }

  async getPaymentStatus(bookingId: string): Promise<ApiResponse<{ paymentStatus: string; booking: Booking }>> {
    return this.get<{ paymentStatus: string; booking: Booking }>(`/payments/booking/${bookingId}`);
  }

  async createSubscriptionCheckout(
    subscriptionType: string,
  ): Promise<ApiResponse<{ orderId?: string; sessionUrl?: string; amount?: number; currency?: string }>> {
    return this.post<{ orderId?: string; sessionUrl?: string; amount?: number; currency?: string }>(
      '/payments/create-subscription-checkout',
      { subscriptionType },
    );
  }

  async verifySubscriptionPayment(data: {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    subscriptionType: string;
    orderId?: string;
  }): Promise<ApiResponse<{ user: User }>> {
    return this.post<{ user: User }>('/payments/verify-subscription-payment', data);
  }

  async getSubscriptionStatus(): Promise<ApiResponse<{ subscription: User['subscription'] }>> {
    return this.get<{ subscription: User['subscription'] }>('/payments/subscription/status');
  }

  // ─── Chat ──────────────────────────────────────────────────────────────────
  async getChatRooms(): Promise<ApiResponse<{ chatRooms: ChatRoom[] }>> {
    return this.get<{ chatRooms: ChatRoom[] }>('/chat/rooms');
  }

  async getMessages(roomId: string, page = 1, limit = 30): Promise<ApiResponse<{ messages: ChatMessage[]; pagination: ApiResponse['pagination'] }>> {
    return this.get<{ messages: ChatMessage[]; pagination: ApiResponse['pagination'] }>(
      `/chat/rooms/${roomId}/messages`,
      { page, limit },
    );
  }

  async sendMessage(roomId: string, content: string, type = 'text'): Promise<ApiResponse<{ message: ChatMessage }>> {
    return this.post<{ message: ChatMessage }>(`/chat/rooms/${roomId}/messages`, { content, type });
  }

  async markMessageAsRead(roomId: string, messageId: string): Promise<ApiResponse<void>> {
    return this.put<void>(`/chat/rooms/${roomId}/messages/${messageId}/read`);
  }

  async deleteMessage(roomId: string, messageId: string): Promise<ApiResponse<void>> {
    return this.del<void>(`/chat/rooms/${roomId}/messages/${messageId}`);
  }

  async sendTypingIndicator(roomId: string, isTyping: boolean): Promise<ApiResponse<void>> {
    return this.post<void>(`/chat/rooms/${roomId}/typing`, { isTyping });
  }

  async startChat(counsellorId: string): Promise<ApiResponse<{ room: ChatRoom }>> {
    return this.post<{ room: ChatRoom }>('/chat/start', { counsellorId });
  }

  async getAvailableCounsellorsForChat(): Promise<ApiResponse<{ counsellors: Array<{
    id: string; counsellorId: string; name: string; profileImage: string | null;
    specialization: string[]; rating: number; reviewCount: number;
    isOnline: boolean; isAvailable: boolean;
  }> }>> {
    return this.get('/chat/available-counsellors');
  }

  // ─── Video ─────────────────────────────────────────────────────────────────
  async createVideoRoom(bookingId: string): Promise<ApiResponse<VideoRoom>> {
    return this.post<VideoRoom>('/video/create-room', { bookingId });
  }

  async joinVideoRoom(bookingId: string): Promise<ApiResponse<VideoRoom>> {
    return this.post<VideoRoom>(`/video/room/${bookingId}/join`);
  }

  async leaveVideoRoom(bookingId: string): Promise<ApiResponse<void>> {
    return this.post<void>(`/video/room/${bookingId}/leave`);
  }
}

export const api = new ApiClient();
