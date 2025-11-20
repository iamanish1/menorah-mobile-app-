import axios, { AxiosInstance } from 'axios';
import { Booking, DashboardStats, TodaySchedule, ApiResponse } from '@/types';

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
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Only redirect on 401, but don't log other errors here
        // Let individual methods handle their own errors
        if (error.response?.status === 401) {
          // Token expired or invalid
          this.clearToken();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
        // Return the error so individual methods can handle it
        return Promise.reject(error);
      }
    );
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  }

  private setToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  public clearToken(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  // Auth methods
  async login(email: string, password: string): Promise<ApiResponse<{ user: any; token: string }>> {
    try {
      const response = await this.client.post('/auth/login', { email, password });
      if (response.data.success && response.data.data.token) {
        this.setToken(response.data.data.token);
      }
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        console.error('Login API error:', error.response.data);
      }
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Login failed',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async getCurrentUser(): Promise<ApiResponse<{ user: any }>> {
    try {
      const response = await this.client.get('/users/me');
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        console.error('Get current user API error:', error.response.data);
      }
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to get user',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async registerCounsellor(data: any): Promise<ApiResponse<{ user: any; counsellor: any; token: string }>> {
    try {
      const response = await this.client.post('/counsellors/register', data);
      if (response.data.success && response.data.data.token) {
        this.setToken(response.data.data.token);
      }
      return response.data;
    } catch (error: any) {
      const errorResponse = error.response?.data;
      return {
        success: false,
        message: errorResponse?.message || 'Registration failed',
        errors: errorResponse?.errors || [],
        errorDetails: errorResponse?.errorDetails || []
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
      if (error.response?.data) {
        console.error('My bookings API error:', error.response.data);
      }
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to get bookings',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async getPendingBookings(params?: {
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<{ bookings: Booking[]; pagination: any }>> {
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
      // Enhanced error logging for debugging
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        validationErrors: error.response?.data?.errors,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          params: error.config?.params,
        }
      };
      console.error('Pending bookings API error details:', errorDetails);
      
      // Also log validation errors separately if they exist
      if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        console.error('Validation errors:', error.response.data.errors);
      }
      
      // Extract error message with better user-friendly messages
      let errorMessage = 'Failed to get pending bookings';
      
      if (error.response?.status === 500) {
        errorMessage = 'Server error occurred. Please try again later or contact support if the problem persists.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Your session has expired. Please log in again.';
      } else if (error.response?.status === 403) {
        errorMessage = 'You do not have permission to access this resource.';
      } else if (error.response?.status === 404) {
        errorMessage = 'The requested resource was not found.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message && !error.message.includes('Network Error')) {
        errorMessage = error.message;
      }
      
      return {
        success: false,
        message: errorMessage,
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async getBookingById(bookingId: string): Promise<ApiResponse<{ booking: Booking }>> {
    try {
      const response = await this.client.get(`/counsellors/me/bookings/${bookingId}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        console.error('Get booking by ID API error:', error.response.data);
      }
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to get booking',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async acceptBooking(bookingId: string): Promise<ApiResponse<{ booking: any }>> {
    try {
      const response = await this.client.post(`/counsellors/me/bookings/${bookingId}/accept`);
      return response.data;
    } catch (error: any) {
      // Enhanced error logging for debugging
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        validationErrors: error.response?.data?.errors,
        config: {
          url: error.config?.url,
          method: error.config?.method,
        }
      };
      console.error('Accept booking API error:', errorDetails);
      
      // Extract error message with better user-friendly messages
      let errorMessage = 'Failed to accept booking';
      
      if (error.response?.status === 500) {
        errorMessage = 'Server error occurred. Please try again later or contact support if the problem persists.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Your session has expired. Please log in again.';
      } else if (error.response?.status === 403) {
        errorMessage = 'You do not have permission to accept this booking.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Booking not found.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message && !error.message.includes('Network Error')) {
        errorMessage = error.message;
      }
      
      return {
        success: false,
        message: errorMessage,
        errors: error.response?.data?.errors || [],
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
      if (error.response?.data) {
        console.error('Schedule booking API error:', error.response.data);
      }
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to schedule booking',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async getDashboard(): Promise<ApiResponse<{
    stats: DashboardStats;
    todaySchedule: TodaySchedule[];
    recentBookings: Booking[];
  }>> {
    try {
      const response = await this.client.get('/counsellors/me/dashboard');
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        console.error('Dashboard API error:', error.response.data);
      }
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to get dashboard',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  // Session management
  async startSession(bookingId: string): Promise<ApiResponse<{ roomUrl?: string; sessionType: string }>> {
    try {
      const response = await this.client.put(`/bookings/${bookingId}/start`);
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        console.error('Start session API error:', error.response.data);
      }
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to start session',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async completeSession(bookingId: string): Promise<ApiResponse<void>> {
    try {
      const response = await this.client.put(`/bookings/${bookingId}/complete`);
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        console.error('Complete session API error:', error.response.data);
      }
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to complete session',
        errors: error.response?.data?.errors || [],
      };
    }
  }

  async joinVideoRoom(bookingId: string): Promise<ApiResponse<{ roomId: string; roomUrl: string; jitsiToken: string; sessionType: string; counsellorName: string; userName: string; scheduledAt: string; duration: number; status: string }>> {
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
}

export const api = new ApiClient();

