'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Plus, Video, MessageCircle, Headphones, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, Badge, Button, Spinner } from '@/components/ui';
import { formatBookingDate, formatCurrency, getStatusColor } from '@/lib/utils';
import type { BookingStatus } from '@/types';

const statusTabs: { label: string; value?: string }[] = [
  { label: 'All' },
  { label: 'Upcoming', value: 'confirmed' },
  { label: 'Pending',  value: 'pending' },
  { label: 'Completed',value: 'completed' },
  { label: 'Cancelled',value: 'cancelled' },
];

const sessionIcons = { video: Video, chat: MessageCircle, audio: Headphones };

export default function BookingsPage() {
  const [status, setStatus] = useState<string | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ['bookings', status],
    queryFn:  () => api.getBookings({ status, limit: 20 }),
  });

  const bookings = data?.data?.bookings ?? [];

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Bookings</h1>
          <p className="text-gray-500 mt-0.5">Track and manage your sessions</p>
        </div>
        <Link href="/bookings/new">
          <Button size="sm">
            <Plus className="w-4 h-4" /> Book Session
          </Button>
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-6 pb-1">
        {statusTabs.map(({ label, value }) => (
          <button
            key={label}
            onClick={() => setStatus(value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 transition-colors
              ${status === value ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No bookings yet</p>
          <p className="text-sm mt-1">Book your first session with a counsellor</p>
          <Link href="/bookings/new">
            <Button className="mt-4">Book a Session</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => {
            const Icon = sessionIcons[booking.sessionType] ?? Video;
            return (
              <Link key={booking.id} href={`/bookings/${booking.id}`}>
                <div className="card p-4 hover:shadow-md transition-shadow flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-900 truncate">
                        {booking.counsellorName ?? 'Counsellor to be assigned'}
                      </p>
                      <Badge className={getStatusColor(booking.status)}>
                        {booking.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {booking.scheduledAt ? formatBookingDate(booking.scheduledAt) : 'Schedule pending'}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="capitalize">{booking.sessionType} • {booking.sessionDuration} min</span>
                      {booking.amount && <span>{formatCurrency(booking.amount, booking.currency)}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
