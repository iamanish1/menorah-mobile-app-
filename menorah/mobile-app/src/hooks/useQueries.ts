/**
 * Central React Query hooks for all API data fetching.
 *
 * QUERY_KEYS provides stable, typed keys so invalidation works correctly
 * across screens — invalidate one key and every screen using it refreshes.
 *
 * staleTime defaults match the Redis TTLs on the backend:
 *   Counsellor list / profile   → 5 min  (Redis: 5 min)
 *   Specializations / languages → 30 min (Redis: 30 min)
 *   Bookings                    → 0      (always fresh — booking state changes frequently)
 *   Chat rooms                  → 0      (always fresh — driven by socket events)
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Counsellor, Booking, ChatRoom } from '@/lib/api';
import { useAuth } from '@/state/useAuth';

// ── Query keys ─────────────────────────────────────────────────────────────
export const QUERY_KEYS = {
  counsellors:      (params?: object) => ['counsellors', params ?? {}] as const,
  counsellor:       (id: string)      => ['counsellor', id]            as const,
  bookings:         (userId: string, params?: object) => ['bookings', userId, params ?? {}] as const,
  chatRooms:        (userId: string)  => ['chatRooms', userId]         as const,
  profile:          (userId: string)  => ['profile', userId]           as const,
  specializations:  ()                => ['specializations']           as const,
  languages:        ()                => ['languages']                 as const,
};

// ── Counsellors ─────────────────────────────────────────────────────────────
export function useCounsellors(params?: {
  search?: string;
  specialization?: string;
  language?: string;
  minRating?: number;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  sortBy?: 'rating' | 'price' | 'experience' | 'name';
  sortOrder?: 'asc' | 'desc';
}) {
  return useQuery({
    queryKey:  QUERY_KEYS.counsellors(params),
    queryFn:   () => api.getCounsellors({ limit: 50, ...params }),
    staleTime: 5 * 60 * 1000,
    // Keep the previous page data visible while a new search is loading
    placeholderData: (prev) => prev,
    select: (res) => ({
      counsellors: res.success ? (res.data?.counsellors ?? []) : [] as Counsellor[],
      pagination:  res.data?.pagination,
    }),
  });
}

export function useCounsellor(counsellorId: string) {
  return useQuery({
    queryKey:  QUERY_KEYS.counsellor(counsellorId),
    queryFn:   () => api.getCounsellor(counsellorId),
    staleTime: 5 * 60 * 1000,
    enabled:   !!counsellorId,
    select:    (res) => res.success ? res.data?.counsellor ?? null : null,
  });
}

export function useSpecializations() {
  return useQuery({
    queryKey:  QUERY_KEYS.specializations(),
    queryFn:   () => api.getSpecializations(),
    staleTime: 30 * 60 * 1000,
    select:    (res) => res.success ? (res.data?.specializations ?? []) as string[] : [],
  });
}

export function useLanguages() {
  return useQuery({
    queryKey:  QUERY_KEYS.languages(),
    queryFn:   () => api.getLanguages(),
    staleTime: 30 * 60 * 1000,
    select:    (res) => res.success ? (res.data?.languages ?? []) as string[] : [],
  });
}

// ── Bookings ────────────────────────────────────────────────────────────────
export function useBookings(params?: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey:  QUERY_KEYS.bookings(userId, params),
    queryFn:   () => api.getBookings({ limit: 50, ...params }),
    enabled:   Boolean(userId),
    staleTime: 0,   // always refetch — booking state changes frequently
    select:    (res) => ({
      bookings:   res.success ? (res.data?.bookings ?? []) as Booking[] : [],
      pagination: res.data?.pagination,
    }),
  });
}

// ── Chat rooms ──────────────────────────────────────────────────────────────
export function useChatRooms() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey:  QUERY_KEYS.chatRooms(userId),
    queryFn:   () => api.getChatRooms(),
    enabled:   Boolean(userId),
    staleTime: 0,   // driven by socket events — no stale period
    select:    (res) => res.success ? (res.data?.chatRooms ?? []) as ChatRoom[] : [],
  });
}

// ── User profile ─────────────────────────────────────────────────────────────
export function useProfile() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey:  QUERY_KEYS.profile(userId),
    queryFn:   () => api.getCurrentUser(),
    enabled:   Boolean(userId),
    staleTime: 5 * 60 * 1000,
    select:    (res) => res.success ? res.data?.user ?? null : null,
  });
}

// ── Invalidation helpers ─────────────────────────────────────────────────────
// Call these from socket event handlers so affected screens re-fetch automatically.
export function useInvalidateBookings() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['bookings'] });
}

export function useInvalidateChatRooms() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['chatRooms'] });
}

export function useInvalidateCounsellorList() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['counsellors'] });
}
