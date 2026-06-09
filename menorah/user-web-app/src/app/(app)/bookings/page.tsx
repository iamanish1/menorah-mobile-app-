'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, Video, MessageCircle, Headphones, Clock, CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge, Button, SegmentedControl, Spinner } from '@/components/ui';
import { formatBookingDate, formatCurrency, getStatusColor } from '@/lib/utils';
import { useSocket } from '@/context/SocketContext';

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
  const qc = useQueryClient();
  const { socket } = useSocket();

  const { data, isLoading } = useQuery({
    queryKey: ['bookings', status],
    queryFn:  () => api.getBookings({ status, limit: 20 }),
  });

  // Invalidate all booking list queries when any booking is rescheduled
  useEffect(() => {
    if (!socket) return;
    const onRescheduled = (data: { bookingId?: string }) => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      if (data.bookingId) {
        qc.invalidateQueries({ queryKey: ['booking', data.bookingId] });
      }
    };
    socket.on('booking_rescheduled', onRescheduled);
    return () => { socket.off('booking_rescheduled', onRescheduled); };
  }, [socket, qc]);

  const bookings = data?.data?.bookings ?? [];

  return (
    <div className="page-container">
      <div className="flex items-center justify-between gap-4 mb-6 rounded-[1.75rem] border border-primary-100 bg-primary-50 px-5 py-5 dark:border-primary-800 dark:bg-primary-900/70">
        <div>
          <h1 className="app-page-heading">My Bookings</h1>
          <p className="app-page-subtitle mt-0.5">Track and manage your sessions</p>
        </div>
        <Link href="/bookings/new">
          <Button size="sm">
            <Plus className="w-4 h-4" /> Book Session
          </Button>
        </Link>
      </div>

      {/* Status tabs */}
      <SegmentedControl
        ariaLabel="Booking status"
        className="mb-6"
        value={status ?? ''}
        options={statusTabs.map(({ label, value }) => ({ label, value: value ?? '' }))}
        onChange={(value) => setStatus(value || undefined)}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : bookings.length === 0 ? (
          <div className="card text-center py-20 text-gray-500 dark:text-primary-100/70">
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
            const needsPayment = booking.paymentStatus === 'pending' && !booking.isSubscriptionBooking;
            const cardContent = (
              <div className={`card p-4 hover:shadow-md transition-shadow flex gap-4 ${needsPayment ? 'border border-amber-200 dark:border-amber-700' : ''}`}>
                <div className="w-10 h-10 rounded-2xl bg-primary-50 dark:bg-primary-800 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-gray-950 dark:text-primary-50 truncate">
                      {booking.counsellorName ?? 'Counsellor to be assigned'}
                    </p>
                    {needsPayment ? (
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200">
                        Payment pending
                      </Badge>
                    ) : (
                      <Badge className={getStatusColor(booking.status)}>
                        {booking.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-primary-100/65 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {booking.scheduledAt ? formatBookingDate(booking.scheduledAt) : 'Schedule pending'}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-primary-100/50">
                    <span className="capitalize">{booking.sessionType} • {booking.sessionDuration} min</span>
                    {booking.amount && <span>{formatCurrency(booking.amount, booking.currency)}</span>}
                  </div>
                  {needsPayment && (
                    <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      <CreditCard className="w-3 h-3" />
                      Tap to complete payment
                    </div>
                  )}
                </div>
              </div>
            );

            return needsPayment ? (
              <Link key={booking.id} href={`/bookings/payment?bookingId=${booking.id}`}>
                {cardContent}
              </Link>
            ) : (
              <Link key={booking.id} href={`/bookings/${booking.id}`}>
                {cardContent}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
