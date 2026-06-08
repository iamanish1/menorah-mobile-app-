'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Booking } from '@/types';

// ── Query keys ────────────────────────────────────────────────────────────────
export const bookingKeys = {
  all:     ['bookings']                   as const,
  list:    (p?: object) => ['bookings', p ?? {}] as const,
  pending: (p?: object) => ['bookings', 'pending', p ?? {}] as const,
};

// ── useBookings ───────────────────────────────────────────────────────────────
// Drop-in replacement for the old manual useState/useEffect hook.
// Returns the same shape so bookings/page.tsx needs no changes.
export function useBookings(params?: {
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey:  bookingKeys.list(params),
    queryFn:   () => api.getMyBookings(params),
    staleTime: 0,   // booking state changes frequently — always re-validate
    select: (res) => ({
      bookings:   res.success ? (res.data?.bookings ?? []) as Booking[] : [],
      pagination: res.data?.pagination ?? null,
    }),
  });

  return {
    bookings:   data?.bookings   ?? [],
    pagination: data?.pagination ?? null,
    loading:    isLoading,
    error:      error?.message ?? null,
    refetch,
    isFetching,
  };
}

// ── usePendingBookings ────────────────────────────────────────────────────────
export function usePendingBookings(params?: { page?: number; limit?: number }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey:  bookingKeys.pending(params),
    queryFn:   () => api.getPendingBookings(params),
    staleTime: 0,
    select: (res) => ({
      bookings:   res.success ? (res.data?.bookings ?? []) as Booking[] : [],
      pagination: res.data?.pagination ?? null,
    }),
  });

  return {
    bookings:   data?.bookings   ?? [],
    pagination: data?.pagination ?? null,
    loading:    isLoading,
    error:      error?.message ?? null,
    refetch,
    isFetching,
  };
}

// ── Invalidation helper ───────────────────────────────────────────────────────
// Call from socket event handlers so both booking lists re-fetch.
export function useInvalidateAllBookings() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: bookingKeys.all });
}
