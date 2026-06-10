import axios, { AxiosInstance } from 'axios';
import { getToken, clearToken } from './auth';
import type {
  ApiResponse, PlatformStats, Counsellor, CounsellorRevenue,
  RevenueData, User, Pagination, PayoutRecord, PayoutSummary, PayoutStatus,
  Article, ArticleGenerationRun, ArticleStatus, BrandAsset, BrandGuideline,
  InstagramAccount, SocialAspectRatio, SocialGenerationJob, SocialPost,
  SocialCampaignBrief, SocialGenerationRun, SocialPostStatus, SocialPostType,
  SocialPromptSettings, SocialStudioStats, SocialWorkflow
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
    return this.request<{ counsellorId: string; status: string; username: string; password: string }>(
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
    return this.request<{ payoutId: string; payoutRecordId: string; status: string; amount: number }>(
      () => this.client.post(`/admin/payouts/${counsellorId}`, { amount, notes })
    );
  }

  getPayouts(params?: { page?: number; limit?: number; status?: PayoutStatus; counsellorId?: string }) {
    return this.request<{ payouts: PayoutRecord[]; pagination: Pagination }>(
      () => this.client.get('/admin/payouts', { params })
    );
  }

  getCounsellorPayouts(counsellorId: string) {
    return this.request<{ payouts: PayoutRecord[]; summary: PayoutSummary }>(
      () => this.client.get(`/admin/payouts/counsellor/${counsellorId}`)
    );
  }

  // Articles
  getArticles(params?: { status?: ArticleStatus | 'all'; page?: number; limit?: number; q?: string; runId?: string }) {
    return this.request<{ articles: Article[]; pagination: Pagination }>(
      () => this.client.get('/articles/admin', { params })
    );
  }

  getArticle(id: string) {
    return this.request<{ article: Article }>(
      () => this.client.get(`/articles/admin/${id}`)
    );
  }

  updateArticle(id: string, payload: Partial<Article>) {
    return this.request<{ article: Article }>(
      () => this.client.patch(`/articles/admin/${id}`, payload)
    );
  }

  publishArticle(id: string) {
    return this.request<{ article: Article }>(
      () => this.client.post(`/articles/admin/${id}/publish`)
    );
  }

  rejectArticle(id: string, reason?: string) {
    return this.request<{ article: Article }>(
      () => this.client.post(`/articles/admin/${id}/reject`, { reason })
    );
  }

  startArticleGenerationRun(count: number) {
    return this.request<{ run: ArticleGenerationRun }>(
      () => this.client.post('/articles/admin/generation-runs', { count })
    );
  }

  getArticleGenerationRun(id: string) {
    return this.request<{ run: ArticleGenerationRun }>(
      () => this.client.get(`/articles/admin/generation-runs/${id}`)
    );
  }

  // AI Social Studio
  getSocialStudioStats() {
    return this.request<SocialStudioStats>(() => this.client.get('/admin/social-studio/stats'));
  }

  generateSocialPost(payload: {
    topic: string;
    campaignName?: string;
    audience?: string;
    objective?: string;
    tone?: string;
    postType?: SocialPostType;
    aspectRatio?: SocialAspectRatio;
    textSystemPrompt?: string;
    imageSystemPrompt?: string;
    sequenceNumber?: number;
    totalCount?: number;
  }) {
    return this.request<{ post: SocialPost; job: SocialGenerationJob }>(
      () => this.client.post('/admin/social-studio/posts/generate', payload)
    );
  }

  getSocialPromptSettings() {
    return this.request<{ settings: SocialPromptSettings }>(
      () => this.client.get('/admin/social-studio/settings/prompts')
    );
  }

  updateSocialPromptSettings(payload: Partial<Pick<SocialPromptSettings, 'textSystemPrompt' | 'imageSystemPrompt'>>) {
    return this.request<{ settings: SocialPromptSettings }>(
      () => this.client.patch('/admin/social-studio/settings/prompts', payload)
    );
  }

  getSocialWorkflows() {
    return this.request<{ workflows: SocialWorkflow[] }>(
      () => this.client.get('/admin/social-studio/workflows')
    );
  }

  createSocialWorkflow(payload: Partial<SocialWorkflow> & { campaigns?: SocialCampaignBrief[] }) {
    return this.request<{ workflow: SocialWorkflow }>(
      () => this.client.post('/admin/social-studio/workflows', payload)
    );
  }

  updateSocialWorkflow(id: string, payload: Partial<SocialWorkflow> & { campaigns?: SocialCampaignBrief[] }) {
    return this.request<{ workflow: SocialWorkflow }>(
      () => this.client.patch(`/admin/social-studio/workflows/${id}`, payload)
    );
  }

  deleteSocialWorkflow(id: string) {
    return this.request<{ workflow: SocialWorkflow }>(
      () => this.client.delete(`/admin/social-studio/workflows/${id}`)
    );
  }

  runSocialWorkflow(id: string) {
    return this.request<{ run: SocialGenerationRun }>(
      () => this.client.post(`/admin/social-studio/workflows/${id}/run`)
    );
  }

  getSocialRuns(params?: { page?: number; limit?: number; workflow?: string }) {
    return this.request<{ runs: SocialGenerationRun[]; pagination: Pagination }>(
      () => this.client.get('/admin/social-studio/runs', { params })
    );
  }

  getSocialRun(id: string) {
    return this.request<{ run: SocialGenerationRun; posts: SocialPost[] }>(
      () => this.client.get(`/admin/social-studio/runs/${id}`)
    );
  }

  getSocialPosts(params?: {
    status?: SocialPostStatus | 'all';
    campaignName?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    return this.request<{ posts: SocialPost[]; pagination: Pagination }>(
      () => this.client.get('/admin/social-studio/posts', { params })
    );
  }

  getSocialPost(id: string) {
    return this.request<{ post: SocialPost }>(
      () => this.client.get(`/admin/social-studio/posts/${id}`)
    );
  }

  updateSocialPost(id: string, payload: Partial<SocialPost> & { selectedAssetIds?: string[] }) {
    return this.request<{ post: SocialPost }>(
      () => this.client.patch(`/admin/social-studio/posts/${id}`, payload)
    );
  }

  regenerateSocialCaption(id: string) {
    return this.request<{ post: SocialPost }>(
      () => this.client.post(`/admin/social-studio/posts/${id}/regenerate-caption`)
    );
  }

  regenerateSocialImage(id: string) {
    return this.request<{ post: SocialPost }>(
      () => this.client.post(`/admin/social-studio/posts/${id}/regenerate-image`)
    );
  }

  renderSocialPost(id: string) {
    return this.request<{ post: SocialPost }>(
      () => this.client.post(`/admin/social-studio/posts/${id}/render`)
    );
  }

  approveSocialPost(id: string) {
    return this.request<{ post: SocialPost }>(
      () => this.client.post(`/admin/social-studio/posts/${id}/approve`)
    );
  }

  rejectSocialPost(id: string, reason?: string) {
    return this.request<{ post: SocialPost }>(
      () => this.client.post(`/admin/social-studio/posts/${id}/reject`, { reason })
    );
  }

  scheduleSocialPost(id: string, scheduledAt: string) {
    return this.request<{ post: SocialPost }>(
      () => this.client.post(`/admin/social-studio/posts/${id}/schedule`, { scheduledAt })
    );
  }

  publishSocialPostNow(id: string) {
    return this.request<{ post: SocialPost }>(
      () => this.client.post(`/admin/social-studio/posts/${id}/publish-now`)
    );
  }

  retrySocialPost(id: string) {
    return this.request<{ post: SocialPost }>(
      () => this.client.post(`/admin/social-studio/posts/${id}/retry`)
    );
  }

  getBrandAssets(params?: { type?: string; status?: 'active' | 'archived' | 'all' }) {
    return this.request<{ assets: BrandAsset[] }>(
      () => this.client.get('/admin/social-studio/brand-assets', { params })
    );
  }

  createBrandAsset(formData: FormData) {
    return this.request<{ asset: BrandAsset }>(
      () => this.client.post('/admin/social-studio/brand-assets', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    );
  }

  updateBrandAsset(id: string, payload: Partial<BrandAsset>) {
    return this.request<{ asset: BrandAsset }>(
      () => this.client.patch(`/admin/social-studio/brand-assets/${id}`, payload)
    );
  }

  archiveBrandAsset(id: string) {
    return this.request<{ asset: BrandAsset }>(
      () => this.client.delete(`/admin/social-studio/brand-assets/${id}`)
    );
  }

  getActiveBrandGuideline() {
    return this.request<{ guideline: BrandGuideline }>(
      () => this.client.get('/admin/social-studio/brand-guidelines/active')
    );
  }

  createBrandGuideline(payload: Partial<BrandGuideline>) {
    return this.request<{ guideline: BrandGuideline }>(
      () => this.client.post('/admin/social-studio/brand-guidelines', payload)
    );
  }

  updateBrandGuideline(id: string, payload: Partial<BrandGuideline>) {
    return this.request<{ guideline: BrandGuideline }>(
      () => this.client.patch(`/admin/social-studio/brand-guidelines/${id}`, payload)
    );
  }

  getInstagramAccounts() {
    return this.request<{ accounts: InstagramAccount[] }>(
      () => this.client.get('/admin/social-studio/instagram/accounts')
    );
  }

  connectInstagramAccount(payload: {
    businessName: string;
    igUserId: string;
    pageId?: string;
    username?: string;
    accountType?: string;
    accessToken: string;
    tokenExpiresAt?: string;
  }) {
    return this.request<{ account: InstagramAccount }>(
      () => this.client.post('/admin/social-studio/instagram/accounts/manual-connect', payload)
    );
  }

  verifyInstagramAccount(id: string) {
    return this.request<{ account: InstagramAccount }>(
      () => this.client.post(`/admin/social-studio/instagram/accounts/${id}/verify`)
    );
  }

  disconnectInstagramAccount(id: string) {
    return this.request<{ account: InstagramAccount }>(
      () => this.client.delete(`/admin/social-studio/instagram/accounts/${id}`)
    );
  }

  getSocialPublishLogs() {
    return this.request<{ logs: SocialPost[] }>(
      () => this.client.get('/admin/social-studio/publish-logs')
    );
  }
}

export const api = new AdminApiClient();
