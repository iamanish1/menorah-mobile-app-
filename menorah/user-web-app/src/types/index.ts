// ─── User ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  profileImage?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer-not-to-say';
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
  preferredLanguage?: string;
  timezone?: string;
  notificationPreferences?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
  };
  subscription?: {
    plan: 'free' | 'basic' | 'premium';
    subscriptionType?: 'weekly' | 'monthly' | 'yearly';
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
  };
  role: 'user' | 'counsellor' | 'admin';
}

// ─── Counsellor ───────────────────────────────────────────────────────────────
export interface Counsellor {
  id: string;
  userId?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  specialization: string;
  specializations?: string[];
  rating: number;
  reviewCount: number;
  experience: number;
  languages: string[];
  hourlyRate: number;
  currency: string;
  profileImage?: string;
  bio?: string;
  education?: Array<{
    degree: string;
    institution: string;
    year: number;
    description?: string;
  }>;
  certifications?: Array<{
    name: string;
    issuingBody: string;
    year: number;
    expiryDate?: string;
  }>;
  availability?: {
    [day: string]: {
      start: string;
      end: string;
      isAvailable: boolean;
    };
  };
  sessionDuration?: number;
  timezone?: string;
  isAvailable: boolean;
  isVerified?: boolean;
  totalSessions?: number;
  gallery?: Array<{ url: string; caption?: string; type: 'image' | 'video' }>;
}

// ─── Booking ──────────────────────────────────────────────────────────────────
export type BookingStatus = 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
export type SessionType   = 'video' | 'audio' | 'chat';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'razorpay' | 'wallet' | 'subscription';

export interface Booking {
  id: string;
  counsellorId?: string;
  counsellorName?: string;
  counsellorImage?: string;
  specialization?: string;
  sessionType: SessionType;
  sessionDuration: number;
  scheduledAt: string;
  status: BookingStatus;
  amount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  isSubscriptionBooking?: boolean;
  symptoms?: string[];
  concerns?: string;
  goals?: string[];
  preferences?: {
    gender?: 'male' | 'female' | 'any';
    sessionType?: SessionType;
  };
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
  canBeCancelled?: boolean;
  canBeRescheduled?: boolean;
  videoCall?: {
    roomId?: string;
    roomUrl?: string;
  };
  chat?: {
    roomId?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
export interface ChatRoom {
  id: string;
  counsellorName: string;
  counsellorImage?: string;
  counsellorUserId?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
  isOnline?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderImage?: string;
  content: string;
  timestamp: string;
  type: 'text' | 'image' | 'file';
  status?: 'sent' | 'delivered' | 'read';
  attachment?: {
    url: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  };
  replyTo?: string;
  isDeleted?: boolean;
}

// ─── Video ────────────────────────────────────────────────────────────────────
export interface VideoRoom {
  roomId: string;
  roomUrl: string;
  jitsiToken: string | null;
  sessionType: SessionType;
  counsellorName: string;
  userName: string;
  scheduledAt: string;
  duration: number;
  status: BookingStatus;
}

// ─── Subscription ─────────────────────────────────────────────────────────────
export interface SubscriptionPlan {
  id: string;
  name: string;
  type: 'weekly' | 'monthly' | 'yearly';
  price: number;
  currency: string;
  features: string[];
  sessionsIncluded: number;
  popular?: boolean;
}

// Articles
export type ArticleContentBlock =
  | { type: 'heading'; text: string; level?: number }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'bullet_list'; items: string[] }
  | { type: 'image'; url: string; alt?: string; caption?: string }
  | { type: 'callout'; text: string }
  | {
      type: 'unknown';
      originalType?: string;
      text?: string;
      items?: string[];
      level?: number;
      url?: string;
      alt?: string;
      caption?: string;
    };

export interface Article {
  id?: string;
  _id?: string;
  title: string;
  slug: string;
  excerpt?: string;
  category?: string;
  tags?: string[];
  coverImageUrl?: string;
  coverImagePublicId?: string;
  imagePrompt?: string;
  contentBlocks?: ArticleContentBlock[];
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  status?: string;
  generatedByAi?: boolean;
  reviewedByHuman?: boolean;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ArticlePagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}

export interface ArticleFilters {
  page?: number;
  limit?: number;
  category?: string;
  q?: string;
}

// ─── Notification ─────────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  type: 'booking_assigned' | 'booking_confirmed' | 'booking_cancelled' | 'session_reminder' | 'message' | 'article' | 'system';
  title: string;
  body: string;
  data?: Record<string, string>;
  isRead: boolean;
  createdAt: string;
}

// ─── API Response ─────────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Array<{ field?: string; message: string }>;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// ─── Counsellor Filters ───────────────────────────────────────────────────────
export interface CounsellorFilters {
  search?: string;
  specialization?: string;
  language?: string;
  minRating?: number;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'rating' | 'price' | 'experience';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
