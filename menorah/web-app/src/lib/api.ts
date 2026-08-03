import axios, { AxiosInstance } from 'axios';
import type {
  Article,
  ArticlePagination,
  Booking,
  CounsellorBooking,
  DashboardBookingSummary,
  DashboardStats,
  TodaySchedule,
  ApiResponse,
  CounsellorStatus,
  UnassignedBookingPreview,
  VideoRoom,
} from '@/types';

export interface CounsellorVerificationRequirements {
  consentVersion: string;
  noticeUrl: string;
}

export interface CounsellorApplicationStatus {
  status:
    | 'draft'
    | 'pending'
    | 'submitted'
    | 'under_review'
    | 'approved'
    | 'rejected'
    | 'suspended'
    | 'expired';
  rejectionReason?: string | null;
  isActive?: boolean;
  requiresFreshApplication?: boolean;
}

export interface CounsellorRegistrationPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other' | 'prefer-not-to-say';
  licenseNumber: string;
  specialization: string;
  specializations?: string[];
  experience: number;
  bio: string;
  languages: string[];
  hourlyRate: number;
  currency?: string;
  education?: unknown[];
  certifications?: unknown[];
  availability: Record<string, {
    start: string;
    end: string;
    isAvailable: boolean;
  }>;
  onboardingConsentAccepted: true;
  onboardingConsentVersion: string;
  reverificationToken?: string;
}

export const COUNSELLOR_UNAUTHORIZED_EVENT = 'menorah:counsellor-unauthorized';

const firstValidationMessage = (errors: unknown): string | undefined => {
  if (!Array.isArray(errors)) return undefined;

  for (const error of errors) {
    if (!error || typeof error !== 'object') continue;
    const candidate = 'message' in error
      ? error.message
      : 'msg' in error
        ? error.msg
        : undefined;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  return undefined;
};

class ApiClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        const requestUrl = typeof error.config?.url === 'string' ? error.config.url : '';
        const isExpectedAuthFailure = requestUrl.startsWith('/auth/') || requestUrl === '/users/me';
        if (
          error.response?.status === 401
          && !isExpectedAuthFailure
          && typeof window !== 'undefined'
        ) {
          window.dispatchEvent(new Event(COUNSELLOR_UNAUTHORIZED_EVENT));
        }
        // Return the error so individual methods can handle it
        return Promise.reject(error);
      }
    );
  }

  public clearToken(): void {
    // Browser sessions are server-issued HttpOnly cookies.
  }

  // Auth methods
  async login(email: string, password: string): Promise<ApiResponse<{ user?: any; email?: string }>> {
    try {
      const response = await this.client.post('/auth/login', { email, password, transport: 'cookie' });
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      if (errorResponse) {
        if (process.env.NODE_ENV === "development") console.error('Login API error:', errorResponse);
      }
      return {
        success: false,
        code: errorResponse?.code,
        message: errorResponse?.message || error.message || 'Login failed',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async verifyEmail(email: string, code: string): Promise<ApiResponse<void>> {
    try {
      const response = await this.client.post('/auth/verify-email', { email, code, transport: 'cookie' });
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      return {
        success: false,
        code: errorResponse?.code,
        message: errorResponse?.message || error.message || 'Email verification failed',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async resendEmailVerification(email: string): Promise<ApiResponse<void>> {
    try {
      const response = await this.client.post('/auth/resend-email-verification', { email });
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      return {
        success: false,
        code: errorResponse?.code,
        message: errorResponse?.message || error.message || 'Could not send a verification code',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async forgotPassword(email: string): Promise<ApiResponse<void>> {
    try {
      const response = await this.client.post('/auth/forgot-password', { email });
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      return {
        success: false,
        message: firstValidationMessage(errorResponse?.errors)
          || errorResponse?.message
          || error.message
          || 'Could not send password reset instructions',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async resetPassword(token: string, password: string): Promise<ApiResponse<void>> {
    try {
      const response = await this.client.post('/auth/reset-password', { token, password });
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      return {
        success: false,
        message: firstValidationMessage(errorResponse?.errors)
          || errorResponse?.message
          || error.message
          || 'Could not reset password',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async getCurrentUser(): Promise<ApiResponse<{ user: any }>> {
    try {
      const response = await this.client.get('/users/me');
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      if (errorResponse) {
        if (process.env.NODE_ENV === "development") console.error('Get current user API error:', errorResponse);
      }
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Failed to get user',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async logout(): Promise<ApiResponse<void>> {
    try {
      const response = await this.client.post('/auth/logout');
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Logout failed',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async logoutAll(): Promise<ApiResponse<void>> {
    try {
      const response = await this.client.post('/auth/logout-all');
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Failed to sign out all devices',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async getCounsellorVerificationRequirements(
    signal?: AbortSignal
  ): Promise<ApiResponse<CounsellorVerificationRequirements>> {
    try {
      const response = await this.client.get('/counsellors/verification-requirements', {
        signal,
      });
      return response.data;
    } catch (error: unknown) {
      if (axios.isCancel(error)) throw error;
      const axiosError = axios.isAxiosError(error) ? error : null;
      const errorResponse = axiosError?.response?.data;
      return {
        success: false,
        code: errorResponse?.code,
        status: axiosError?.response?.status,
        message: errorResponse?.message || axiosError?.message || 'Verification requirements are unavailable',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async getCounsellorApplicationStatus(
    statusTicket: string,
    signal?: AbortSignal
  ): Promise<ApiResponse<CounsellorApplicationStatus>> {
    try {
      const response = await this.client.get('/counsellors/application-status', {
        params: { ticket: statusTicket },
        signal,
      });
      return response.data;
    } catch (error: unknown) {
      if (axios.isCancel(error)) throw error;
      const axiosError = axios.isAxiosError(error) ? error : null;
      const errorResponse = axiosError?.response?.data;
      return {
        success: false,
        code: errorResponse?.code,
        status: axiosError?.response?.status,
        message: errorResponse?.message || axiosError?.message || 'Application status is unavailable',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async registerCounsellor(
    data: CounsellorRegistrationPayload
  ): Promise<ApiResponse<{
    applicationId: string;
    email: string;
    statusTicket: string;
    status?: 'submitted' | 'under_review';
  }>> {
    try {
      const response = await this.client.post('/counsellors/register', data);
      return response.data;
    } catch (error: unknown) {
      const axiosError = axios.isAxiosError(error) ? error : null;
      const errorResponse = axiosError?.response?.data;
      return {
        success: false,
        code: errorResponse?.code,
        status: axiosError?.response?.status,
        message: errorResponse?.message || 'Registration failed',
        errors: errorResponse?.errors || [],
      };
    }
  }

  // Counselor booking methods
  async getMyBookings(params?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<{ bookings: Booking[]; pagination: any }>> {
    try {
      // Ensure params are properly formatted
      const queryParams: Record<string, string> = {};
      if (params?.status) queryParams.status = params.status;
      if (params?.startDate) queryParams.startDate = params.startDate;
      if (params?.endDate) queryParams.endDate = params.endDate;
      if (params?.page && params.page > 0) queryParams.page = params.page.toString();
      if (params?.limit && params.limit > 0) queryParams.limit = params.limit.toString();
      
      // Always send params object (empty if no params) - axios handles this correctly
      const response = await this.client.get('/counsellors/me/bookings', { 
        params: queryParams
      });
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      if (errorResponse) {
        if (process.env.NODE_ENV === "development") console.error('My bookings API error:', errorResponse);
      }
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Failed to get bookings',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async getPendingBookings(params?: {
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<{ bookings: UnassignedBookingPreview[]; pagination: any }>> {
    try {
      // Build query params - only include if they have valid values
      const queryParams: Record<string, string> = {};
      if (params?.page && params.page > 0) {
        queryParams.page = params.page.toString();
      }
      if (params?.limit && params.limit > 0) {
        queryParams.limit = params.limit.toString();
      }
      
      // Make request - if no params, send empty object (axios will handle it correctly)
      const response = await this.client.get('/counsellors/me/bookings/pending', {
        params: queryParams
      });
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      const errorStatus = error.response?.status;
      
      // Enhanced error logging for debugging
      const errorDetails = {
        message: error.message,
        status: errorStatus,
        statusText: error.response?.statusText,
        data: errorResponse,
        validationErrors: errorResponse?.errors,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          params: error.config?.params,
        }
      };
      if (process.env.NODE_ENV === "development") console.error('Pending bookings API error details:', errorDetails);
      
      // Also log validation errors separately if they exist
      if (errorResponse?.errors && Array.isArray(errorResponse.errors)) {
        if (process.env.NODE_ENV === "development") console.error('Validation errors:', errorResponse.errors);
      }
      
      // Extract error message with better user-friendly messages
      let errorMessage = 'Failed to get pending bookings';
      
      if (errorStatus === 500) {
        errorMessage = 'Server error occurred. Please try again later or contact support if the problem persists.';
      } else if (errorStatus === 401) {
        errorMessage = 'Your session has expired. Please log in again.';
      } else if (errorStatus === 403) {
        errorMessage = 'You do not have permission to access this resource.';
      } else if (errorStatus === 404) {
        errorMessage = 'The requested resource was not found.';
      } else if (errorResponse?.message) {
        errorMessage = errorResponse.message;
      } else if (error.message && !error.message.includes('Network Error')) {
        errorMessage = error.message;
      }
      
      return {
        success: false,
        message: errorMessage,
        errors: errorResponse?.errors || [],
      };
    }
  }

  async getBookingById(bookingId: string): Promise<ApiResponse<{ booking: CounsellorBooking }>> {
    try {
      const response = await this.client.get(`/counsellors/me/bookings/${bookingId}`);
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      if (errorResponse) {
        if (process.env.NODE_ENV === "development") console.error('Get booking by ID API error:', errorResponse);
      }
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Failed to get booking',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async acceptBooking(bookingId: string): Promise<ApiResponse<{ booking: any }>> {
    try {
      const response = await this.client.post(`/counsellors/me/bookings/${bookingId}/accept`);
      return response.data;
    } catch (error: unknown) {
      // Safely extract error information
      const axiosError = error as any;
      const errorResponse = axiosError?.response?.data;
      const errorStatus = axiosError?.response?.status;
      const errorMessage = axiosError?.message || 'Unknown error';
      
      // Log error details safely (only in development)
      if (process.env.NODE_ENV === 'development') {
        try {
          if (process.env.NODE_ENV === "development") console.error('Accept booking API error:', errorMessage, {
            status: errorStatus,
            errorData: errorResponse,
          });
        } catch {
          // Silently fail if logging causes issues
        }
      }
      
      // Extract error message with better user-friendly messages
      let userMessage = 'Failed to accept booking';
      
      if (errorStatus === 500) {
        userMessage = 'Server error occurred. Please try again later or contact support if the problem persists.';
      } else if (errorStatus === 401) {
        userMessage = 'Your session has expired. Please log in again.';
      } else if (errorStatus === 403) {
        userMessage = 'You do not have permission to accept this booking.';
      } else if (errorStatus === 404) {
        userMessage = 'Booking not found.';
      } else if (errorResponse?.message) {
        userMessage = errorResponse.message;
      } else if (errorMessage && !errorMessage.includes('Network Error')) {
        userMessage = errorMessage;
      }
      
      return {
        success: false,
        message: userMessage,
        errors: errorResponse?.errors || [],
      };
    }
  }

  async scheduleBooking(bookingId: string, scheduledAt: string): Promise<ApiResponse<{ booking: any }>> {
    try {
      const response = await this.client.put(`/counsellors/me/bookings/${bookingId}/schedule`, {
        scheduledAt,
      });
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      if (errorResponse) {
        if (process.env.NODE_ENV === "development") console.error('Schedule booking API error:', errorResponse);
      }
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Failed to schedule booking',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async getDashboard(): Promise<ApiResponse<{
    counsellorStatus: CounsellorStatus;
    stats: DashboardStats;
    todaySchedule: TodaySchedule[];
    recentBookings: DashboardBookingSummary[];
  }>> {
    try {
      const response = await this.client.get('/counsellors/me/dashboard');
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      if (errorResponse) {
        if (process.env.NODE_ENV === "development") console.error('Dashboard API error:', errorResponse);
      }
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Failed to get dashboard',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async getArticles(params?: {
    page?: number;
    limit?: number;
    category?: string;
    q?: string;
  }): Promise<ApiResponse<{ articles: Article[]; pagination: ArticlePagination }>> {
    try {
      const response = await this.client.get('/articles', { params });
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Failed to load articles',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async getArticle(slug: string): Promise<ApiResponse<{ article: Article }>> {
    try {
      const response = await this.client.get(`/articles/${encodeURIComponent(slug)}`);
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Failed to load article',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async updateAvailabilityStatus(isAvailable: boolean): Promise<ApiResponse<{ isAvailable: boolean; isActive: boolean }>> {
    try {
      const response = await this.client.put('/counsellors/me/status', { isAvailable });
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Failed to update status',
        errors: errorResponse?.errors || [],
      };
    }
  }

  // Session management
  async startSession(bookingId: string): Promise<ApiResponse<{ roomUrl?: string; sessionType: string }>> {
    try {
      const response = await this.client.put(`/bookings/${bookingId}/start`);
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      if (errorResponse) {
        if (process.env.NODE_ENV === "development") console.error('Start session API error:', errorResponse);
      }
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Failed to start session',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async completeSession(bookingId: string): Promise<ApiResponse<void>> {
    try {
      const response = await this.client.put(`/bookings/${bookingId}/complete`);
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      if (errorResponse) {
        if (process.env.NODE_ENV === "development") console.error('Complete session API error:', errorResponse);
      }
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Failed to complete session',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async updateCallLink(bookingId: string, payload: {
    provider: string;
    externalJoinUrl: string;
    externalHostUrl?: string;
    externalProviderName?: string;
  }): Promise<ApiResponse<{ videoCall: Booking['videoCall'] }>> {
    try {
      const response = await this.client.patch(`/bookings/${bookingId}/call-link`, payload);
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      return {
        success: false,
        message: errorResponse?.message || error.message || 'Failed to save external session link',
        errors: errorResponse?.errors || [],
      };
    }
  }

  async joinVideoRoom(bookingId: string): Promise<ApiResponse<VideoRoom>> {
    try {
      const response = await this.client.post(`/video/room/${bookingId}/join`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to join video room',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  // Chat API Methods
  async getCounsellorChatRooms(): Promise<ApiResponse<{ chatRooms: any[] }>> {
    try {
      const response = await this.client.get('/chat/counsellor/rooms');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to get chat rooms',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async getChatMessages(roomId: string, page: number = 1, limit: number = 20): Promise<ApiResponse<{ messages: any[]; pagination: any }>> {
    try {
      const response = await this.client.get(`/chat/rooms/${roomId}/messages`, {
        params: { page, limit }
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to get messages',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async sendChatMessage(roomId: string, content: string, type: string = 'text'): Promise<ApiResponse<{ message: any }>> {
    try {
      const response = await this.client.post(`/chat/rooms/${roomId}/messages`, {
        content,
        type
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to send message',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async markMessageAsRead(roomId: string, messageId: string): Promise<ApiResponse<void>> {
    try {
      const response = await this.client.put(`/chat/rooms/${roomId}/messages/${messageId}/read`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to mark message as read',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async sendTypingIndicator(roomId: string, isTyping: boolean): Promise<ApiResponse<void>> {
    try {
      const response = await this.client.post(`/chat/rooms/${roomId}/typing`, {
        isTyping
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to send typing indicator',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async updateUserProfile(data: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    gender?: string;
  }): Promise<ApiResponse<{ user: any }>> {
    try {
      const response = await this.client.put('/users/profile', data);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to update profile',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async getSpecializations(): Promise<ApiResponse<{ specializations: string[] }>> {
    try {
      const response = await this.client.get('/counsellors/specializations');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to load specializations',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async getLanguages(): Promise<ApiResponse<{ languages: string[] }>> {
    try {
      const response = await this.client.get('/counsellors/languages');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to load languages',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async updateCounsellorProfileMedia(formData: FormData): Promise<ApiResponse<{
    counsellorProfile: {
      profileImage?: string | null;
      voiceIntroUrl?: string | null;
      voiceIntroDurationSeconds?: number | null;
      profileMediaCompletedAt?: string | null;
      profileMediaComplete: boolean;
    };
  }>> {
    try {
      const response = await fetch(`${this.baseURL.replace(/\/$/, '')}/counsellors/me/profile-media`, {
        method: 'PUT',
        credentials: 'include',
        body: formData,
      });
      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(COUNSELLOR_UNAUTHORIZED_EVENT));
        }
      }

      if (!response.ok) {
        return {
          success: false,
          message: data?.message || 'Failed to update profile media',
          errors: data?.errors || [],
        };
      }

      return data;
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to update profile media',
        errors: [],
      };
    }
  }

  async updateCounsellorProfile(data: {
    specialization?: string;
    specializations?: string[];
    experience?: number;
    hourlyRate?: number;
    bio?: string;
    languages?: string[];
    licenseNumber?: string;
    availability?: Record<string, { start: string; end: string; isAvailable: boolean }>;
  }): Promise<ApiResponse<{ counsellor: any }>> {
    try {
      const response = await this.client.put('/counsellors/me/profile', data);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to update counsellor profile',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async updateBankDetails(data: {
    accountNumber: string;
    ifscCode: string;
    accountHolderName: string;
    bankName: string;
    currentPassword: string;
  }): Promise<ApiResponse<{ bankDetails: { accountHolderName: string; bankName: string; ifscCode: string; accountNumberMasked: string } }>> {
    try {
      const response = await this.client.put('/counsellors/me/bank-details', data);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to update bank details',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async changePassword(data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<ApiResponse<void>> {
    try {
      const response = await this.client.put('/users/change-password', data);
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      return {
        success: false,
        message: firstValidationMessage(errorResponse?.errors)
          || errorResponse?.message
          || error.message
          || 'Failed to change password',
        errors: errorResponse?.errors || [],
      };
    }
  }
}

export const api = new ApiClient();
