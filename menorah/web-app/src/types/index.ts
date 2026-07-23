export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileImage?: string;
  role: 'user' | 'counsellor' | 'admin';
}

export interface Booking {
  accessScope: 'assigned';
  id: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  userImage?: string;
  userGender?: string;
  sessionType: 'video' | 'audio' | 'chat';
  sessionDuration: number;
  scheduledAt: string;
  status: BookingStatus;
  amount: number;
  currency: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentMethod?: 'razorpay' | 'wallet' | 'subscription';
  isSubscriptionBooking?: boolean;
  symptoms?: string[];
  concerns?: string;
  goals?: string[];
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  preferences?: BookingPreferences;
  assignedAt?: string;
  videoCall?: {
    provider?: CallProvider;
    joinMode?: CallJoinMode;
    externalProviderName?: string;
    externalJoinUrl?: string;
    externalHostUrl?: string;
    region?: 'IN' | 'AE' | 'UNKNOWN';
    status?: CallStatus;
    policyReason?: string;
    roomId?: string;
    roomUrl?: string;
  };
  createdAt?: string;
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in-progress'
  | 'completed'
  | 'cancelled'
  | 'no-show'
  | 'expired';

export interface BookingPreferences {
  gender?: 'male' | 'female' | 'any';
  sessionType?: string;
  categoryId?: string;
}

/**
 * The only booking shape a counsellor may receive before assignment.
 * Identity, contact, clinical, emergency-contact, payment, and call data are
 * intentionally absent so preview consumers cannot depend on those fields.
 */
export interface UnassignedBookingPreview {
  accessScope: 'preview';
  id: string;
  sessionType: 'video' | 'audio' | 'chat';
  sessionDuration: number;
  scheduledAt: string;
  status: Extract<BookingStatus, 'pending' | 'confirmed'>;
  canAccept: boolean;
  createdAt: string;
}

export type CounsellorBooking = Booking | UnassignedBookingPreview;

export type CallProvider = 'livekit' | 'vsee' | 'doxy' | 'zoom' | 'google_meet' | 'teams' | 'disabled';
export type CallJoinMode = 'in_app' | 'external_link' | 'disabled';
export type CallStatus = 'not_configured' | 'scheduled' | 'ready' | 'started' | 'ended' | 'cancelled' | 'disabled';

export interface VideoRoom {
  provider?: CallProvider;
  joinMode?: CallJoinMode;
  region?: 'IN' | 'AE' | 'UNKNOWN';
  bookingId?: string;
  roomName?: string;
  roomId?: string;
  livekitUrl?: string;
  token?: string;
  livekitToken?: string;
  joinUrl?: string;
  externalJoinUrl?: string;
  hostUrl?: string;
  externalHostUrl?: string;
  providerName?: string;
  externalProviderName?: string;
  sessionType: 'video' | 'audio' | 'chat';
  counsellorName: string;
  userName: string;
  scheduledAt: string;
  duration: number;
  status: string;
  message?: string;
}

export interface CounsellorStatus {
  isActive: boolean;
  isAvailable: boolean;
  isVerified: boolean;
  marketplaceEligible: boolean;
  profileMediaComplete?: boolean;
  profileImage?: string | null;
  voiceIntroUrl?: string | null;
  message: string;
}

export interface DashboardStats {
  totalBookings: number;
  upcomingSessions: number;
  pendingAssignments: number;
  monthlyEarnings: {
    amount: number;
    currency: string;
  };
}

export interface TodaySchedule {
  accessScope: 'assigned';
  id: string;
  userName: string;
  userImage?: string;
  sessionType: 'video' | 'audio' | 'chat';
  sessionDuration: number;
  scheduledAt: string;
  status: string;
}

export interface DashboardBookingSummary {
  accessScope: 'assigned';
  id: string;
  userName: string;
  userImage?: string;
  sessionType: 'video' | 'audio' | 'chat';
  scheduledAt: string;
  status: BookingStatus;
  isSubscriptionBooking?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: any[];
}

export type ArticleContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'quote'
  | 'bullet_list'
  | 'image'
  | 'callout';

export interface ArticleContentBlock {
  type: ArticleContentBlockType | string;
  text?: string | null;
  level?: number | null;
  items?: string[];
  url?: string | null;
  alt?: string | null;
  caption?: string | null;
}

export interface Article {
  id?: string;
  _id?: string;
  title: string;
  slug: string;
  excerpt?: string;
  category?: string;
  tags?: string[];
  coverImageUrl?: string | null;
  coverImagePublicId?: string | null;
  imagePrompt?: string;
  contentBlocks?: ArticleContentBlock[];
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  status?: string;
  generatedByAi?: boolean;
  reviewedByHuman?: boolean;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ArticlePagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
