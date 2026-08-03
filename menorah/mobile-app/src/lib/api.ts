import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { secureStorage } from "./secureStorage";
import { ENV } from "./env";
import { reportError, reportEvent } from "./safeDiagnostics";
import { invalidateLocalSession } from "./authSession";
import type { Article } from "@/types/article";

// Types
export type UserRole = 'user' | 'counsellor' | 'admin';
export type SocialAuthIntent = 'signin' | 'signup';
export type SocialProvider = 'google' | 'apple';
export type LinkedProviders =
  | SocialProvider[]
  | Partial<Record<SocialProvider, boolean>>;

export interface User {
  id: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  linkedProviders?: LinkedProviders;
  needsProfileCompletion?: boolean;
  profileCompleted?: boolean;
  profileImage?: string | null;
  dateOfBirth?: string;
  gender?: string;
  notificationPreferences?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
  };
  reauthenticationMethods?: {
    password: boolean;
    apple: boolean;
    google: boolean;
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

export type KycStatus =
  | "not_started"
  | "pending"
  | "verified"
  | "manual_review"
  | "rejected";

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
  sessionType: "video" | "audio" | "chat";
  sessionDuration: number;
  scheduledAt: string;
  status:
    | "pending"
    | "confirmed"
    | "in-progress"
    | "completed"
    | "cancelled"
    | "no-show"
    | "expired";
  amount: number;
  currency: string;
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentMethod?: "razorpay" | "wallet" | "subscription" | "promo";
  paymentReviewRequired?: boolean;
  paymentAction?: "resume_payment" | "contact_support" | null;
  holdExpiresAt?: string | null;
  promo?: {
    code?: string;
    discountAmount?: number;
  };
  isSubscriptionBooking?: boolean;
  canBeCancelled: boolean;
  canBeRescheduled: boolean;
  createdAt?: string; // Date when booking was created/paid
  chat?: {
    roomId?: string;
  };
}

export interface VideoRoomSession {
  provider?:
    | "livekit"
    | "vsee"
    | "doxy"
    | "zoom"
    | "google_meet"
    | "teams"
    | "disabled";
  joinMode?: "in_app" | "external_link" | "disabled";
  region?: "IN" | "AE" | "UNKNOWN";
  bookingId?: string;
  roomName?: string;
  roomId?: string;
  livekitUrl?: string;
  meetUrl?: string;
  meetTicket?: string;
  roomUrl?: string;
  jitsiToken?: string;
  joinUrl?: string;
  externalJoinUrl?: string;
  hostUrl?: string;
  externalHostUrl?: string;
  providerName?: string;
  externalProviderName?: string;
  sessionType: string;
  counsellorName: string;
  userName: string;
  scheduledAt: string;
  duration: number;
  status?: string;
  message?: string;
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
  sender?:
    | string
    | {
        _id?: string;
        firstName?: string;
        lastName?: string;
        profileImage?: string | null;
      };
  senderImage?: string | null;
  content: string;
  timestamp: string;
  createdAt?: string;
  type: "text" | "image" | "file";
  status?: "sent" | "delivered" | "read";
  roomId?: string;
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
  code?: string;
  message?: string;
  data?: T;
  errors?: ApiValidationError[];
  httpStatus?: number;
  isNetworkError?: boolean;
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

export type AssessmentSeverity = "Minimal" | "Mild" | "Moderate" | "Severe";

export interface Gad7Answer {
  questionId: number;
  value: number;
}

export interface Gad7Instrument {
  assessmentType: "GAD-7";
  assessmentVersion: string;
  language: "en";
  title: string;
  timeframe: string;
  disclaimer: string;
  resultNotice: string;
  questions: Array<{
    questionId: number;
    prompt: string;
  }>;
  responses: Array<{
    value: number;
    label: string;
  }>;
}

export interface PsychometricAssessmentResult {
  id: string;
  assessmentType: "GAD-7";
  assessmentVersion: string;
  language: "en";
  totalScore: number;
  severityCategory: AssessmentSeverity;
  completedAt: string;
}

/**
 * A mobile request must declare how it is authenticated. Public is the
 * fail-closed default, so new calls cannot accidentally disclose the device
 * bearer token to a route that does not require it.
 *
 * `manual` is for one-off candidate/revocation tokens. A 401 for one of those
 * tokens must not clear the stored session because it may be unrelated to it.
 */
type RequestAuthMode = 'public' | 'required' | 'manual';

type MobileApiRequestConfig = AxiosRequestConfig & {
  authMode?: RequestAuthMode;
  manualAuthToken?: string;
};

// API Client
class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private unauthorizedListeners = new Set<() => void | Promise<void>>();

  constructor() {
    reportEvent("api.client_initialized");

    this.client = axios.create({
      baseURL: ENV.API_BASE_URL,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Bearers are attached only to routes that explicitly require a session.
    // Public discovery and auth endpoints deliberately omit them, even if a
    // stale token is still present in secure storage.
    this.client.interceptors.request.use(
      async (config) => {
        const requestConfig = config as MobileApiRequestConfig;
        const authMode = requestConfig.authMode || 'public';

        delete config.headers.Authorization;

        if (authMode === 'manual') {
          if (!requestConfig.manualAuthToken) {
            return Promise.reject(new Error('Manual authentication requires a token.'));
          }
          config.headers.Authorization = `Bearer ${requestConfig.manualAuthToken}`;
        } else if (authMode === 'required') {
          if (!this.token) {
            this.token = await secureStorage.getToken();
          }
          if (this.token) {
            config.headers.Authorization = `Bearer ${this.token}`;
          }
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor to handle token refresh and errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const requestConfig = error.config as MobileApiRequestConfig | undefined;
        const isStoredSessionRequest = requestConfig?.authMode === 'required';

        // Public/auth failures and rejected one-off tokens must not clear an
        // unrelated signed-in session. Only a stored-session request can do so.
        if (error.response?.status === 401 && isStoredSessionRequest) {
          this.token = null;
          // Clear protected UI/cache state immediately; physical secure-store
          // cleanup may complete asynchronously or remain tombstoned for retry.
          invalidateLocalSession();
          try {
            await secureStorage.clearToken();
          } catch (storageError) {
            reportError("auth.token_cleanup_pending", storageError);
          }
          await Promise.allSettled(
            Array.from(this.unauthorizedListeners, listener => Promise.resolve(listener())),
          );
        }
        return Promise.reject(error);
      },
    );
  }

  // Set auth token in platform secure storage (iOS Keychain / Android Keystore).
  async setToken(token: string) {
    // Never activate a credential that was not durably persisted.
    this.token = null;
    await secureStorage.setToken(token);
    this.token = token;
  }

  // Clear auth token
  async clearToken() {
    this.token = null;
    await secureStorage.clearToken();
  }

  onUnauthorized(listener: () => void | Promise<void>) {
    this.unauthorizedListeners.add(listener);
    return () => {
      this.unauthorizedListeners.delete(listener);
    };
  }

  // Helper method to remove undefined values from request data
  private cleanRequestData(data: any): any {
    if (!data || typeof data !== "object") {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.cleanRequestData(item));
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
  private async request<T>(config: MobileApiRequestConfig): Promise<ApiResponse<T>> {
    try {
      // Clean request data to remove undefined values
      if (config.data) {
        config.data = this.cleanRequestData(config.data);
      }

      const response: AxiosResponse<ApiResponse<T>> = await this.client(config);
      return response.data;
    } catch (error: any) {
      // Check if it's a network error first
      const isNetworkError =
        error.code === "ERR_NETWORK" ||
        error.code === "NETWORK_ERROR" ||
        error.message?.includes("Network Error");

      if (isNetworkError) {
        reportError("api.network_unavailable", error);
        return {
          success: false,
          message:
            "Network error: Unable to connect to server. Please check your internet connection and try again.",
          isNetworkError: true,
        };
      }

      const responseData = error.response?.data;
      reportError("api.request_failed", error);

      if (responseData) {
        return {
          ...responseData,
          httpStatus: error.response?.status,
        };
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
    return this.request({
      method: "POST",
      url: "/auth/register",
      data: {
        ...userData,
        firstName: userData.firstName.trim(),
        lastName: userData.lastName.trim(),
        email: this.normalizeEmail(userData.email),
        phone: userData.phone.trim(),
        dateOfBirth: userData.dateOfBirth.trim(),
      },
      authMode: 'public',
    });
  }

  async login(credentials: { email: string; password: string }): Promise<ApiResponse<{
    user?: User;
    token?: string;
    email?: string;
  }>> {
    const payload = {
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
    };

    return this.request({
      method: "POST",
      url: "/auth/login",
      data: payload,
      authMode: 'public',
    });
  }

  async loginWithGoogle(
    credential: string,
    intent: SocialAuthIntent,
  ): Promise<ApiResponse<{
    user?: User;
    token?: string;
    email?: string;
    isNewUser?: boolean;
    needsProfileCompletion?: boolean;
  }>> {
    return this.request({
      method: 'POST',
      url: '/auth/google',
      data: { credential, intent },
      authMode: 'public',
    });
  }

  async loginWithApple(data: {
    identityToken: string;
    authorizationCode?: string | null;
    email?: string | null;
    fullName?: string | null;
  }, intent: SocialAuthIntent): Promise<ApiResponse<{
    user?: User;
    token?: string;
    email?: string;
    isNewUser?: boolean;
    needsProfileCompletion?: boolean;
  }>> {
    // Apple only returns name/email on a user's first authorization. Omit the
    // null repeat-sign-in values entirely so they cannot fail backend optional
    // string validation or be mistaken for an identity claim.
    const payload: {
      identityToken: string;
      authorizationCode?: string;
      email?: string;
      fullName?: string;
      intent: SocialAuthIntent;
    } = {
      identityToken: data.identityToken,
      intent,
    };

    if (data.authorizationCode) payload.authorizationCode = data.authorizationCode;
    if (data.email?.trim()) payload.email = data.email.trim();
    if (data.fullName?.trim()) payload.fullName = data.fullName.trim();

    return this.request({
      method: 'POST',
      url: '/auth/apple',
      data: payload,
      authMode: 'public',
    });
  }

  async verifyEmail(email: string, code: string): Promise<ApiResponse<{ user?: User; token?: string }>> {
    return this.request({
      method: 'POST',
      url: '/auth/verify-email',
      data: { email: this.normalizeEmail(email), code: code.trim() },
      authMode: 'public',
    });
  }

  async verifyEmailOtp(
    email: string,
    otp: string,
  ): Promise<ApiResponse<{ user: User; token: string }>> {
    return this.request({
      method: "POST",
      url: "/auth/verify-email-otp",
      data: { email: this.normalizeEmail(email), otp: otp.trim() },
      authMode: 'public',
    });
  }

  async resendEmailVerification(email: string): Promise<ApiResponse<void>> {
    return this.request({
      method: "POST",
      url: "/auth/resend-email-verification",
      data: { email: this.normalizeEmail(email) },
      authMode: 'public',
    });
  }

  async resendEmailOtp(email: string): Promise<ApiResponse<void>> {
    return this.request({
      method: "POST",
      url: "/auth/resend-email-otp",
      data: { email: this.normalizeEmail(email) },
      authMode: 'public',
    });
  }

  async verifyPhone(phone: string, otp: string): Promise<ApiResponse<void>> {
    return this.request({
      method: "POST",
      url: "/auth/verify-phone",
      data: { phone, otp },
      authMode: 'public',
    });
  }

  async forgotPassword(email: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/forgot-password',
      data: { email: this.normalizeEmail(email) },
      authMode: 'public',
    });
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<ApiResponse<void>> {
    return this.request({
      method: "POST",
      url: "/auth/reset-password",
      data: { token, password },
      authMode: 'public',
    });
  }

  async getCurrentUser(): Promise<ApiResponse<{ user: User }>> {
    return this.request({
      method: 'GET',
      url: '/users/me',
      authMode: 'required',
    });
  }

  async getCurrentUserWithToken(token: string): Promise<ApiResponse<{ user: User }>> {
    return this.request({
      method: 'GET',
      url: '/users/me',
      authMode: 'manual',
      manualAuthToken: token,
    });
  }

  async logout(): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/logout',
      authMode: 'required',
    });
  }

  async logoutToken(token: string): Promise<ApiResponse<void>> {
    return this.request({
      method: 'POST',
      url: '/auth/logout',
      authMode: 'manual',
      manualAuthToken: token,
    });
  }

  async retryPendingLogouts(): Promise<void> {
    const pendingTokens = await secureStorage.getPendingLogoutTokens();
    if (!pendingTokens.length) return;

    const results = await Promise.all(
      pendingTokens.map(async token => {
        try {
          return { token, response: await this.logoutToken(token) };
        } catch {
          return {
            token,
            response: {
              success: false,
              isNetworkError: true,
            } as ApiResponse<void>,
          };
        }
      }),
    );
    const retryableTokens = results
      .filter(({ response }) =>
        !response.success
        && (
          response.isNetworkError
          || !response.httpStatus
          || response.httpStatus >= 500
        ))
      .map(({ token }) => token);

    await secureStorage.setPendingLogoutTokens(retryableTokens);
  }

  async linkSocialProvider(payload: {
    provider: SocialProvider;
    providerToken: string;
    currentPassword: string;
  }): Promise<ApiResponse<{ user?: User; linkedProviders?: LinkedProviders }>> {
    return this.request({
      method: 'POST',
      url: '/auth/social/link',
      data: payload,
      authMode: 'required',
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
    sortBy?: "rating" | "price" | "experience" | "name";
    sortOrder?: "asc" | "desc";
  }): Promise<
    ApiResponse<{
      counsellors: Counsellor[];
      pagination: { page: number; limit: number; total: number; pages: number };
    }>
  > {
    return this.request({
      method: "GET",
      url: "/counsellors",
      params,
      // This backend route accepts optional auth, but its discovery response is public.
      authMode: 'public',
    });
  }

  async getCounsellor(
    id: string,
  ): Promise<ApiResponse<{ counsellor: Counsellor }>> {
    return this.request({
      method: "GET",
      url: `/counsellors/${id}`,
      authMode: 'public',
    });
  }

  async getCounsellorAvailability(
    id: string,
    startDate: string,
    endDate: string,
    duration?: number,
  ): Promise<ApiResponse<{ availability: any[] }>> {
    return this.request({
      method: "GET",
      url: `/counsellors/${id}/availability`,
      params: { startDate, endDate, duration },
      authMode: 'public',
    });
  }

  // Articles API Methods
  async getArticles(params?: {
    page?: number;
    limit?: number;
    category?: string;
    q?: string;
  }): Promise<
    ApiResponse<{
      articles: Article[];
      pagination: { page: number; limit: number; total: number; pages: number };
    }>
  > {
    return this.request({
      method: "GET",
      url: "/articles",
      params,
      authMode: 'public',
    });
  }

  async getArticle(slug: string): Promise<ApiResponse<{ article: Article }>> {
    return this.request({
      method: 'GET',
      url: `/articles/${encodeURIComponent(slug)}`,
      authMode: 'public',
    });
  }

  // English-only psychometric assessment API methods
  async getGad7Instrument(): Promise<
    ApiResponse<{ instrument: Gad7Instrument }>
  > {
    return this.request({
      method: "GET",
      url: "/assessments/instruments/gad-7",
      authMode: 'required',
    });
  }

  async submitGad7Assessment(
    assessmentVersion: string,
    answers: Gad7Answer[],
    idempotencyKey: string,
  ): Promise<
    ApiResponse<{
      assessment: PsychometricAssessmentResult;
      replayed: boolean;
    }>
  > {
    return this.request({
      method: "POST",
      url: "/assessments/gad-7",
      headers: { "Idempotency-Key": idempotencyKey },
      data: { assessmentVersion, answers },
      authMode: 'required',
    });
  }

  async getAssessmentResults(limit = 20): Promise<
    ApiResponse<{
      assessments: PsychometricAssessmentResult[];
    }>
  > {
    return this.request({
      method: "GET",
      url: "/assessments",
      params: { limit },
      authMode: 'required',
    });
  }

  async getAssessmentResult(id: string): Promise<
    ApiResponse<{
      assessment: PsychometricAssessmentResult;
    }>
  > {
    return this.request({
      method: "GET",
      url: `/assessments/${id}`,
      authMode: 'required',
    });
  }

  async getSpecializations(): Promise<
    ApiResponse<{ specializations: string[] }>
  > {
    return this.request({
      method: 'GET',
      url: '/counsellors/specializations',
      authMode: 'public',
    });
  }

  async getLanguages(): Promise<ApiResponse<{ languages: string[] }>> {
    return this.request({
      method: 'GET',
      url: '/counsellors/languages',
      authMode: 'public',
    });
  }

  // Bookings API Methods
  async createBooking(bookingData: {
    counsellorId?: string;
    sessionType: "video" | "audio" | "chat";
    sessionDuration: number;
    scheduledAt: string;
    serviceCode?: string;
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
      method: "POST",
      url: "/bookings",
      data: bookingData,
      authMode: 'required',
    });
  }

  async getBookings(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<
    ApiResponse<{
      bookings: Booking[];
      pagination: { page: number; limit: number; total: number; pages: number };
    }>
  > {
    return this.request({
      method: "GET",
      url: "/bookings",
      params,
      authMode: 'required',
    });
  }

  async getBooking(id: string): Promise<ApiResponse<{ booking: Booking }>> {
    return this.request({
      method: "GET",
      url: `/bookings/${id}`,
      authMode: 'required',
    });
  }

  async cancelBooking(id: string, reason?: string): Promise<ApiResponse<void>> {
    return this.request({
      method: "PUT",
      url: `/bookings/${id}/cancel`,
      data: { reason },
      authMode: 'required',
    });
  }

  async startSession(
    id: string,
  ): Promise<ApiResponse<{ roomUrl?: string; sessionType: string }>> {
    return this.request({
      method: "PUT",
      url: `/bookings/${id}/start`,
      authMode: 'required',
    });
  }

  async completeSession(id: string): Promise<ApiResponse<void>> {
    return this.request({
      method: "PUT",
      url: `/bookings/${id}/complete`,
      authMode: 'required',
    });
  }

  // Payments API Methods
  async createCheckoutSession(bookingId: string): Promise<ApiResponse<any>> {
    return this.request({
      method: "POST",
      url: "/payments/create-checkout-session",
      data: { bookingId },
      authMode: 'required',
    });
  }

  async verifyRazorpayPayment(paymentData: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    bookingId: string;
  }): Promise<ApiResponse<void>> {
    return this.request({
      method: "POST",
      url: "/payments/verify-razorpay",
      data: paymentData,
      authMode: 'required',
    });
  }

  async getPaymentStatus(bookingId: string): Promise<ApiResponse<any>> {
    return this.request({
      method: "GET",
      url: `/payments/booking/${bookingId}`,
      authMode: 'required',
    });
  }

  async getRazorpayOrderStatus(orderId: string): Promise<ApiResponse<any>> {
    return this.request({
      method: "GET",
      url: `/payments/order/${orderId}/status`,
      authMode: 'required',
    });
  }

  // Subscription Payment API Methods
  async createSubscriptionCheckout(
    subscriptionType: "weekly" | "monthly" | "yearly",
  ): Promise<ApiResponse<any>> {
    return this.request({
      method: "POST",
      url: "/payments/create-subscription-checkout",
      data: { subscriptionType },
      authMode: 'required',
    });
  }

  async verifySubscriptionPayment(paymentData: {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    subscriptionType: "weekly" | "monthly" | "yearly";
    orderId?: string;
  }): Promise<ApiResponse<any>> {
    return this.request({
      method: "POST",
      url: "/payments/verify-subscription-payment",
      data: paymentData,
      authMode: 'required',
    });
  }

  async getSubscriptionStatus(): Promise<ApiResponse<any>> {
    return this.request({
      method: 'GET',
      url: '/payments/subscription/status',
      authMode: 'required',
    });
  }

  // Chat API Methods
  async getChatRooms(): Promise<ApiResponse<{ chatRooms: ChatRoom[] }>> {
    return this.request({
      method: 'GET',
      url: '/chat/rooms',
      authMode: 'required',
    });
  }

  async getMessages(
    roomId: string,
    params?: { page?: number; limit?: number },
  ): Promise<
    ApiResponse<{
      messages: Message[];
      pagination: { page: number; limit: number; total: number; pages: number };
    }>
  > {
    return this.request({
      method: "GET",
      url: `/chat/rooms/${roomId}/messages`,
      params,
      authMode: 'required',
    });
  }

  async sendMessage(
    roomId: string,
    content: string,
    type: "text" | "image" | "file" = "text",
  ): Promise<ApiResponse<{ message: Message }>> {
    return this.request({
      method: "POST",
      url: `/chat/rooms/${roomId}/messages`,
      data: { content, type },
      authMode: 'required',
    });
  }

  async markMessageAsRead(
    roomId: string,
    messageId: string,
  ): Promise<ApiResponse<void>> {
    return this.request({
      method: "PUT",
      url: `/chat/rooms/${roomId}/messages/${messageId}/read`,
      authMode: 'required',
    });
  }

  async deleteMessage(
    roomId: string,
    messageId: string,
  ): Promise<ApiResponse<void>> {
    return this.request({
      method: "DELETE",
      url: `/chat/rooms/${roomId}/messages/${messageId}`,
      authMode: 'required',
    });
  }

  async sendTypingIndicator(
    roomId: string,
    isTyping: boolean,
  ): Promise<ApiResponse<void>> {
    return this.request({
      method: "POST",
      url: `/chat/rooms/${roomId}/typing`,
      data: { isTyping },
      authMode: 'required',
    });
  }

  // Get available counselors for chat
  async getAvailableCounsellors(): Promise<
    ApiResponse<{ counsellors: any[] }>
  > {
    return this.request({
      method: 'GET',
      url: '/chat/available-counsellors',
      authMode: 'required',
    });
  }

  // Start a chat with a counselor
  async startChat(counsellorId: string): Promise<ApiResponse<{ room: any }>> {
    return this.request({
      method: "POST",
      url: "/chat/start",
      data: { counsellorId },
      authMode: 'required',
    });
  }

  // Video Call API Methods
  async createVideoRoom(
    bookingId: string,
  ): Promise<ApiResponse<VideoRoomSession>> {
    return this.request({
      method: "POST",
      url: "/video/create-room",
      data: { bookingId },
      authMode: 'required',
    });
  }

  async getVideoRoom(
    bookingId: string,
  ): Promise<ApiResponse<VideoRoomSession>> {
    return this.request({
      method: "GET",
      url: `/video/room/${bookingId}`,
      authMode: 'required',
    });
  }

  async joinVideoRoom(
    bookingId: string,
  ): Promise<ApiResponse<VideoRoomSession>> {
    return this.request({
      method: "POST",
      url: `/video/room/${bookingId}/join`,
      authMode: 'required',
    });
  }

  async leaveVideoRoom(bookingId: string): Promise<ApiResponse<void>> {
    return this.request({
      method: "POST",
      url: `/video/room/${bookingId}/leave`,
      authMode: 'required',
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
      method: "PUT",
      url: "/users/profile",
      data: profileData,
      authMode: 'required',
    });
  }

  async completeProfile(phone: string): Promise<ApiResponse<{ user: User }>> {
    return this.request({
      method: 'PUT',
      url: '/users/profile/complete',
      data: { phone: phone.trim() },
      authMode: 'required',
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
        if (!value || key === "profileImage") {
          return;
        }
        formData.append(key, String(value));
      });

      if (profileData.profileImage?.uri) {
        formData.append("profileImage", {
          uri: profileData.profileImage.uri,
          name: profileData.profileImage.name || `profile-${Date.now()}.jpg`,
          type: profileData.profileImage.type || "image/jpeg",
        } as any);
      }

      const response = await this.client.put("/users/profile", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        authMode: 'required',
      } as MobileApiRequestConfig);

      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      if (errorResponse) {
        return errorResponse;
      }

      const isNetworkError =
        error.code === "ERR_NETWORK" ||
        error.code === "NETWORK_ERROR" ||
        error.message?.includes("Network Error");
      if (isNetworkError) {
        return {
          success: false,
          message:
            "Network error: Unable to upload image. Please check your internet connection and try again.",
        };
      }

      return {
        success: false,
        message: error.message || "Failed to update profile image",
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
      method: "PUT",
      url: "/users/address",
      data: addressData,
      authMode: 'required',
    });
  }

  async updateEmergencyContact(contactData: {
    name?: string;
    relationship?: string;
    phone?: string;
  }): Promise<ApiResponse<{ user: User }>> {
    return this.request({
      method: "PUT",
      url: "/users/emergency-contact",
      data: contactData,
      authMode: 'required',
    });
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<ApiResponse<void>> {
    return this.request({
      method: "PUT",
      url: "/users/change-password",
      data: { currentPassword, newPassword },
      authMode: 'required',
    });
  }

  async updateNotificationPreferences(preferences: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
  }): Promise<ApiResponse<{ user: User }>> {
    return this.request({
      method: "PUT",
      url: "/users/notification-preferences",
      data: preferences,
      authMode: 'required',
    });
  }

  async registerPushDevice(payload: {
    expoPushToken: string;
    platform: "android";
    projectId: string;
  }): Promise<ApiResponse<{ registered: boolean }>> {
    return this.request({
      method: "POST",
      url: "/users/push-devices",
      data: payload,
      authMode: 'required',
    });
  }

  async registerPushDeviceWithToken(payload: {
    expoPushToken: string;
    platform: "android";
    projectId: string;
  }, authToken: string): Promise<ApiResponse<{ registered: boolean }>> {
    return this.request({
      method: "POST",
      url: "/users/push-devices",
      data: payload,
      authMode: 'manual',
      manualAuthToken: authToken,
    });
  }

  async unregisterPushDevice(
    expoPushToken: string,
  ): Promise<ApiResponse<{ registered: boolean }>> {
    return this.request({
      method: "DELETE",
      url: "/users/push-devices",
      data: { expoPushToken },
      authMode: 'required',
    });
  }

  async unregisterPushDeviceWithToken(
    expoPushToken: string,
    authToken: string,
  ): Promise<ApiResponse<{ registered: boolean }>> {
    return this.request({
      method: "DELETE",
      url: "/users/push-devices",
      data: { expoPushToken },
      authMode: 'manual',
      manualAuthToken: authToken,
    });
  }

  async getKycStatus(): Promise<
    ApiResponse<{ status: KycStatus; verification: KycVerification | null }>
  > {
    return this.request({
      method: 'GET',
      url: '/ekyc/status',
      authMode: 'required',
    });
  }

  async submitKycVerification(payload: {
    selfie: ProfileImageUpload;
    consentAccepted: boolean;
    consentVersion: string;
  }): Promise<
    ApiResponse<{
      status: KycStatus;
      verification: KycVerification;
      kyc: User["kyc"];
    }>
  > {
    try {
      const formData = new FormData();
      formData.append(
        "consentAccepted",
        payload.consentAccepted ? "true" : "false",
      );
      formData.append("consentVersion", payload.consentVersion);
      formData.append("selfie", {
        uri: payload.selfie.uri,
        name: payload.selfie.name || `selfie-${Date.now()}.jpg`,
        type: payload.selfie.type || "image/jpeg",
      } as any);

      const response = await this.client.post("/ekyc/submit", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30000,
        authMode: 'required',
      } as MobileApiRequestConfig);

      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      const status = error.response?.status;
      if (
        status === 413 ||
        (typeof errorResponse === "string" &&
          errorResponse.includes("413 Request Entity Too Large"))
      ) {
        reportError("api.face_check_upload_limit", error);
        return {
          success: false,
          message:
            "The selfie upload is being blocked by the server upload limit. Please try again later or skip the optional face check.",
        };
      }

      if (errorResponse) {
        reportError("api.face_check_submit_failed", error);
        return errorResponse;
      }

      const isNetworkError =
        error.code === "ERR_NETWORK" ||
        error.code === "NETWORK_ERROR" ||
        error.message?.includes("Network Error");
      return {
        success: false,
        message: isNetworkError
          ? "Network error: Unable to submit the optional face check. Please check your connection and try again."
          : error.message || "The optional face check failed",
      };
    }
  }

  async updatePrivacyPreferences(preferences: {
    profileVisibility?: "public" | "counsellors" | "private";
    showEmail?: boolean;
    showPhone?: boolean;
    allowMessages?: boolean;
  }): Promise<ApiResponse<void>> {
    // TODO: Confirm the production privacy-preferences endpoint path with the backend team.
    const response = await this.request<void>({
      method: "PUT",
      url: "/users/privacy-preferences",
      data: preferences,
      authMode: 'required',
    });

    return response.message
      ? response
      : {
          ...response,
          message: response.success
            ? "Privacy preferences saved."
            : "Privacy preferences endpoint is not connected yet. Please contact support if you need this changed now.",
        };
  }

  async createAccountDeletionChallenge(): Promise<
    ApiResponse<{
      challengeId: string;
      nonce: string;
      expiresAt: string;
    }>
  > {
    return this.request({
      method: "POST",
      url: "/users/account/deletion-challenge",
      data: { method: "apple" },
      authMode: 'required',
    });
  }

  async requestAccountDeletion(
    payload:
      | { method: "password"; password: string }
      | {
          method: "apple";
          challengeId: string;
          identityToken: string;
          authorizationCode: string;
        },
  ): Promise<ApiResponse<void>> {
    if (payload.method === "password" && !payload.password.trim()) {
      return {
        success: false,
        message: "Enter your password to confirm account deletion.",
      };
    }
    return this.request<void>({
      method: "DELETE",
      url: "/users/account",
      data: payload,
      authMode: 'required',
    });
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<any>> {
    return this.request({
      method: 'GET',
      url: '/health',
      authMode: 'public',
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
    reportError("api.counsellors_fetch_failed", error);
    return [];
  }
}
