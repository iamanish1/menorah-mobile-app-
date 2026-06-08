export interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin';
}

export interface CounsellorUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileImage?: string;
  isActive: boolean;
  createdAt: string;
}

export interface BankDetails {
  accountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  bankName?: string;
}

export interface CounsellorStats {
  totalEarnings: number;
  monthlyEarnings: number;
  completedSessions: number;
  cancelledSessions: number;
  averageSessionRating: number;
}

export interface Counsellor {
  id: string;
  _id?: string;
  user: CounsellorUser;
  licenseNumber: string;
  specialization: string;
  experience: number;
  hourlyRate: number;
  currency: string;
  rating: number;
  reviewCount: number;
  bio?: string;
  languages?: string[];
  status: 'pending' | 'approved' | 'rejected';
  isActive: boolean;
  isVerified: boolean;
  approvedBy?: { firstName: string; lastName: string; email: string };
  approvedAt?: string;
  rejectionReason?: string;
  blockedAt?: string;
  blockedReason?: string;
  commissionRate: number;
  bankDetails?: BankDetails;
  stats?: CounsellorStats;
  razorpayContactId?: string;
  razorpayFundAccountId?: string;
  lastPayoutAt?: string;
  lastPayoutAmount?: number;
  totalPaidOut?: number;
  createdAt: string;
  bookingStats?: {
    total: number;
    completed: number;
    cancelled: number;
    confirmed: number;
  };
}

export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  bookingCount?: number;
  subscription?: {
    plan: string;
    isActive: boolean;
  };
}

export interface PlatformStats {
  users: { total: number; newToday: number; newThisMonth: number };
  counsellors: { total: number; pending: number; approved: number; blocked: number };
  bookings: { total: number; active: number; completed: number; today: number };
  revenue: { total: number; monthly: number; weekly: number; today: number };
}

export interface RevenueData {
  summary: {
    today: { revenue: number; bookings: number };
    weekly: { revenue: number; bookings: number };
    monthly: { revenue: number; bookings: number };
    yearly: { revenue: number; bookings: number };
    allTime: { revenue: number; bookings: number };
  };
  dailyTrend: { date: string; revenue: number; bookings: number }[];
  monthlyTrend: { month: string; revenue: number; bookings: number }[];
}

export interface CounsellorRevenue {
  counsellorId: string;
  userId: string;
  name: string;
  email: string;
  specialization: string;
  revenue: number;
  sessions: number;
  commissionRate: number;
  counsellorEarnings: number;
  platformFee: number;
  bankDetails?: BankDetails;
  lastPayoutAt?: string;
  lastPayoutAmount?: number;
  totalPaidOut?: number;
  razorpayContactId?: string;
  razorpayFundAccountId?: string;
}

export type ArticleStatus = 'draft' | 'review' | 'published' | 'archived' | 'rejected';
export type ArticleGenerationRunStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';
export type ArticleGenerationRunSource = 'manual' | 'scheduled';

export interface ArticleContentBlock {
  type: 'heading' | 'paragraph' | 'quote' | 'bullet_list' | 'image' | 'callout';
  text?: string | null;
  level?: number | null;
  items?: string[];
  url?: string | null;
  alt?: string | null;
  caption?: string | null;
}

export interface Article {
  id: string;
  _id?: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  tags: string[];
  coverImageUrl?: string | null;
  coverImagePublicId?: string | null;
  imagePrompt?: string;
  contentBlocks?: ArticleContentBlock[];
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  status: ArticleStatus;
  generationRun?: string | null;
  wordCount?: number;
  generatedByAi?: boolean;
  reviewedByHuman?: boolean;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string;
  rejectedAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ArticleGenerationRunError {
  topic?: string;
  stage?: string;
  message: string;
  at?: string;
}

export interface ArticleGenerationRun {
  id: string;
  _id?: string;
  source: ArticleGenerationRunSource;
  status: ArticleGenerationRunStatus;
  requestedCount: number;
  completedCount: number;
  failedCount: number;
  timezone: string;
  dateKey?: string | null;
  requestedBy?: string | null;
  articleIds?: Article[];
  errors?: ArticleGenerationRunError[];
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: { field?: string; message?: string }[];
}
