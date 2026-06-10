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
  kyc?: {
    status: KycStatus;
    provider?: string | null;
    submittedAt?: string;
    verifiedAt?: string;
    reviewedAt?: string;
    reviewReason?: string;
    faceCheckConfidence?: number;
  };
}

export interface PlatformStats {
  users: { total: number; newToday: number; newThisMonth: number };
  counsellors: { total: number; pending: number; approved: number; blocked: number };
  bookings: { total: number; active: number; completed: number; today: number };
  revenue: { total: number; monthly: number; weekly: number; today: number };
  kyc?: { pendingReview: number; verified: number; rejected: number };
}

export type KycStatus = 'not_started' | 'pending' | 'verified' | 'manual_review' | 'rejected';

export interface KycReview {
  id: string;
  user: Pick<User, '_id' | 'firstName' | 'lastName' | 'email' | 'phone' | 'kyc' | 'createdAt'>;
  status: KycStatus;
  provider: string;
  checkType: string;
  submittedAt?: string;
  verifiedAt?: string;
  reviewedAt?: string;
  reviewedBy?: { firstName: string; lastName: string; email: string };
  reviewReason?: string;
  failureReason?: string;
  faceCount?: number | null;
  faceCheckConfidence?: number | null;
  threshold?: number | null;
  createdAt: string;
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

export type SocialPostStatus =
  | 'draft'
  | 'needs_review'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'rejected'
  | 'failed_generation'
  | 'failed_publish'
  | 'expired_token';

export type SocialPostType = 'single_image' | 'carousel' | 'reel_cover';
export type SocialAspectRatio = '1:1' | '4:5' | '9:16';
export type SocialTemplateKey = 'thought_leadership' | 'educational_tip' | 'announcement';

export interface BrandAsset {
  id: string;
  _id?: string;
  type: 'logo' | 'font' | 'image' | 'icon' | 'template' | 'background' | 'product_image' | 'reference_post' | 'brand_guideline';
  name: string;
  filename?: string;
  url: string;
  publicId?: string;
  mimeType?: string;
  sizeBytes?: number;
  tags?: string[];
  colors?: string[];
  width?: number | null;
  height?: number | null;
  status: 'active' | 'archived';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export interface BrandGuideline {
  id: string;
  _id?: string;
  brandName: string;
  tone: string;
  audience: string;
  primaryColors: string[];
  secondaryColors: string[];
  fonts: string[];
  logoRules: {
    allowedPositions: string[];
    minWidth: number;
    clearSpace: number;
  };
  postRules: {
    maxWordsOnImage: number;
    allowedAspectRatios: SocialAspectRatio[];
    defaultAspectRatio: SocialAspectRatio;
    forbiddenWords: string[];
    ctaStyle: string;
  };
  instagramRules: {
    defaultHashtags: string[];
    bannedHashtags: string[];
    captionMaxLength: number;
  };
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
  updatedAt?: string;
}

export interface InstagramAccount {
  id: string;
  _id?: string;
  businessName: string;
  igUserId: string;
  pageId?: string;
  username?: string;
  accountType?: string;
  tokenExpiresAt?: string | null;
  status: 'connected' | 'expired' | 'revoked' | 'error';
  lastVerifiedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface SocialPost {
  id: string;
  _id?: string;
  platform: 'instagram';
  postType: SocialPostType;
  status: SocialPostStatus;
  topic: string;
  campaignName?: string;
  audience?: string;
  objective?: string;
  tone?: string;
  hookText: string;
  bodyText: string;
  ctaText: string;
  caption: string;
  hashtags: string[];
  aiPrompt?: string;
  designBrief?: string;
  templateKey?: SocialTemplateKey;
  selectedAssetIds?: BrandAsset[] | string[];
  imageUrl?: string;
  finalImageUrl?: string;
  thumbnailUrl?: string;
  aspectRatio: SocialAspectRatio;
  width?: number;
  height?: number;
  modelUsed?: string;
  promptVersion?: string;
  qualityScore?: number;
  qualityIssues?: string[];
  scheduledAt?: string | null;
  publishedAt?: string | null;
  instagramAccount?: InstagramAccount | string | null;
  instagramMediaId?: string;
  instagramPermalink?: string;
  errorLog?: { message?: string; code?: string; at?: string } | null;
  createdAt: string;
  updatedAt?: string;
}

export interface SocialGenerationJob {
  id: string;
  _id?: string;
  socialPostId?: string | null;
  status: 'queued' | 'generating_concept' | 'generating_caption' | 'generating_image' | 'rendering' | 'quality_checking' | 'completed' | 'failed';
  step?: string;
  progress?: number;
  provider?: string;
  error?: string;
  logs?: { step: string; message: string; at: string }[];
  createdAt: string;
  updatedAt?: string;
}

export interface SocialPromptSettings {
  id: string;
  _id?: string;
  key: 'default';
  textSystemPrompt: string;
  imageSystemPrompt: string;
  updatedBy?: string | User | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SocialCampaignBrief {
  id?: string;
  _id?: string;
  topic: string;
  campaignName: string;
  audience: string;
  objective: string;
  tone?: string;
  postType?: SocialPostType;
  aspectRatio?: SocialAspectRatio;
  postCount: number;
  textSystemPromptOverride?: string;
  imageSystemPromptOverride?: string;
}

export interface SocialWorkflowSchedule {
  enabled: boolean;
  type: 'none' | 'once' | 'daily' | 'weekly' | 'monthly';
  timezone: string;
  runAt?: string | null;
  timeOfDay?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  lastScheduledKey?: string;
}

export interface SocialWorkflow {
  id: string;
  _id?: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'archived';
  customMaxPosts: number;
  campaigns: SocialCampaignBrief[];
  schedule: SocialWorkflowSchedule;
  createdBy?: string | User | null;
  updatedBy?: string | User | null;
  createdAt: string;
  updatedAt?: string;
}

export interface SocialGenerationRun {
  id: string;
  _id?: string;
  source: 'manual' | 'scheduled';
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  requestedCount: number;
  completedCount: number;
  failedCount: number;
  workflow?: string | SocialWorkflow | null;
  workflowName?: string;
  campaigns: SocialCampaignBrief[];
  textSystemPrompt?: string;
  imageSystemPrompt?: string;
  timezone?: string;
  scheduleKey?: string | null;
  postIds?: string[] | SocialPost[];
  errors?: { campaignName?: string; stage?: string; message: string; at?: string }[];
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface SocialStudioStats {
  counts: Partial<Record<SocialPostStatus, number>>;
  connectedAccounts: number;
  recentPosts: SocialPost[];
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

export type PayoutStatus =
  | 'processing' | 'queued' | 'pending' | 'on_hold'
  | 'processed' | 'reversed' | 'cancelled' | 'failed';

export interface PayoutRecord {
  _id: string;
  counsellor: {
    _id: string;
    user: { firstName: string; lastName: string; email: string };
    bankDetails?: BankDetails;
  };
  initiatedBy: { firstName: string; lastName: string };
  amountPaise: number;
  amountRupees: number;
  razorpayPayoutId: string;
  razorpayFundAccountId?: string;
  referenceId?: string;
  status: PayoutStatus;
  bankDetailsSnapshot: {
    accountNumberMasked?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
  };
  notes?: string;
  failureReason?: string;
  utr?: string;
  lastWebhookAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutSummary {
  total: number;
  totalPaid: number;
  totalPending: number;
  totalFailed: number;
}
