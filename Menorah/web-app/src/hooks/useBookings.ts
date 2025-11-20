'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Booking } from '@/types';

export function useBookings(params?: {
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<any>(null);

  useEffect(() => {
    fetchBookings();
  }, [params?.status, params?.startDate, params?.endDate, params?.page]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const response = await api.getMyBookings(params);
      if (response.success && response.data) {
        setBookings(response.data.bookings);
        setPagination(response.data.pagination);
        setError(null);
      } else {
        setError(response.message || 'Failed to fetch bookings');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return {
    bookings,
    loading,
    error,
    pagination,
    refetch: fetchBookings,
  };
}

export function usePendingBookings(params?: { page?: number; limit?: number }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<any>(null);

  useEffect(() => {
    fetchPendingBookings();
  }, [params?.page]);

  const fetchPendingBookings = async () => {
    try {
      setLoading(true);
      const response = await api.getPendingBookings(params);
      if (response.success && response.data) {
        setBookings(response.data.bookings);
        setPagination(response.data.pagination);
        setError(null);
      } else {
        setError(response.message || 'Failed to fetch pending bookings');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return {
    bookings,
    loading,
    error,
    pagination,
    refetch: fetchPendingBookings,
  };
}

