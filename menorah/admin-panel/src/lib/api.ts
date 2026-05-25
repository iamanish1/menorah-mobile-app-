import axios, { AxiosInstance } from 'axios';
import { getToken, clearToken } from './auth';
import type {
  ApiResponse, PlatformStats, Counsellor, CounsellorRevenue,
  RevenueData, User, Pagination
} from '@/types';

class AdminApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
      headers: { 'Content-Type': 'application/json' }
    });

    this.client.interceptors.request.use((config) => {
      const token = getToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          clearToken();
          if (typeof window !== 'undefined') window.location.href = '/login';
        }
        return Promise.reject(err);
      }
    );
  }

  private async request<T>(fn: () => Promise<{ data: ApiResponse<T> }>): Promise<ApiResponse<T>> {
    try {
      const res = await fn();
      return res.data;
    } catch (err: unknown) {
      const e = err as { response?: { data?: ApiResponse<T> }; message?: string };
      return { success: false, message: e.response?.data?.message || e.message || 'Request failed' };
    }
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  login(email: string, password: string) {
    return this.request<{ user: User; token: string }>(() =>
      this.client.post('/auth/login', { email, password })
    );
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  getStats() {
    return this.request<PlatformStats>(() => this.client.get('/admin/stats'));
  }

  getUserStats() {
    return this.request<{ dailyRegistrations: { date: string; count: number }[]; byRole: Record<string, number> }>(
      () => this.client.get('/admin/stats/users')
    );
  }

  // ── Counsellors ─────────────────────────────────────────────────────────────
  getCounsellors(params?: { status?: string; page?: number; limit?: number; search?: string }) {
    return this.request<{ counsellors: Counsellor[]; pagination: Pagination }>(
      () => this.client.get('/admin/counsellors', { params })
    );
  }

  getCounsellor(id: string) {
    return this.request<{ counsellor: Counsellor; bookingStats: Record<string, unknown> }>(
      () => this.client.get(`/admin/counsellors/${id}`)
    );
  }

  approveCounsellor(id: string) {
    return this.request<{ counsellorId: string; status: string }>(
      () => this.client.put(`/admin/counsellors/${id}/approve`)
    );
  }

  rejectCounsellor(id: string, reason: string) {
    return this.request<{ counsellorId: string; status: string }>(
      () => this.client.put(`/admin/counsellors/${id}/reject`, { reason })
    );
  }

  generatePassword(id: string) {
    return this.request<{ username: string; password: string; counsellorId: string; userId: string }>(
      () => this.client.post(`/admin/counsellors/${id}/generate-password`)
    );
  }

  blockCounsellor(id: string, reason: string) {
    return this.request<{ counsellorId: string }>(
      () => this.client.put(`/admin/counsellors/${id}/block`, { reason })
    );
  }

  unblockCounsellor(id: string) {
    return this.request<{ counsellorId: string }>(
      () => this.client.put(`/admin/counsellors/${id}/unblock`)
    );
  }

  getCounsellorBookingStats(id: string, days = 30) {
    return this.request<{ dailyStats: unknown[]; overall: unknown }>(
      () => this.client.get(`/admin/counsellors/${id}/booking-stats`, { params: { days } })
    );
  }

  // ── Users ───────────────────────────────────────────────────────────────────
  getUsers(params?: { page?: number; limit?: number; search?: string; role?: string }) {
    return this.request<{ users: User[]; pagination: Pagination }>(
      () => this.client.get('/admin/users', { params })
    );
  }

  // ── Revenue ─────────────────────────────────────────────────────────────────
  getRevenue() {
    return this.request<RevenueData>(() => this.client.get('/admin/revenue'));
  }

  getCounsellorRevenue(params?: { page?: number; limit?: number; period?: string }) {
    return this.request<{ counsellors: CounsellorRevenue[]; pagination: Pagination }>(
      () => this.client.get('/admin/revenue/counsellors', { params })
    );
  }

  getCounsellorRevenueDetail(id: string) {
    return this.request<unknown>(() => this.client.get(`/admin/revenue/counsellors/${id}`));
  }

  // ── Payouts ─────────────────────────────────────────────────────────────────
  initiatePayout(counsellorId: string, amount: number, notes?: string) {
    return this.request<{ payoutId: string; status: string; amount: number }>(
      () => this.client.post(`/admin/payouts/${counsellorId}`, { amount, notes })
    );
  }
}

export const api = new AdminApiClient();
