'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, Video, MessageCircle, Headphones, Clock, CreditCard, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge, Button, Modal, SegmentedControl, Spinner } from '@/components/ui';
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
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancellationError, setCancellationError] = useState('');
  const [cancellationNotice, setCancellationNotice] = useState('');
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

  const handleCancelPendingBooking = async () => {
    if (!cancelBookingId) return;

    setCancelling(true);
    setCancellationError('');
    const result = await api.cancelBooking(cancelBookingId, cancelReason);
    setCancelling(false);

    if (!result.success) {
      setCancellationError(result.message || 'Unable to cancel this booking. Please try again.');
      return;
    }

    setCancelBookingId(null);
    setCancelReason('');
    setCancellationNotice('Your pending booking was cancelled and the held time has been released.');
    qc.invalidateQueries({ queryKey: ['bookings'] });
    qc.invalidateQueries({ queryKey: ['booking', cancelBookingId] });
  };

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

      {cancellationNotice && (
        <div role="status" className="mb-4 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-800 dark:border-primary-700 dark:bg-primary-900/60 dark:text-primary-100">
          {cancellationNotice}
        </div>
      )}

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
            const needsPayment = booking.status === 'pending'
              && booking.paymentStatus === 'pending'
              && !booking.isSubscriptionBooking;
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
              <div key={booking.id}>
                <Link href={`/bookings/payment?bookingId=${booking.id}`} className="block">
                  {cardContent}
                </Link>
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setCancellationError('');
                      setCancelReason('');
                      setCancelBookingId(booking.id);
                    }}
                  >
                    <XCircle className="w-4 h-4" /> Cancel booking
                  </Button>
                </div>
              </div>
            ) : (
              <Link key={booking.id} href={`/bookings/${booking.id}`}>
                {cardContent}
              </Link>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(cancelBookingId)}
        onClose={() => !cancelling && setCancelBookingId(null)}
        title="Cancel pending booking"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-primary-100/75">
            Payment has not been completed. Cancelling this booking releases the held time and cannot be undone.
          </p>
          {cancellationError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {cancellationError}
            </div>
          )}
          <textarea
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Reason for cancellation (optional)"
            rows={3}
            className="input-field resize-none"
          />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth disabled={cancelling} onClick={() => setCancelBookingId(null)}>
              Keep booking
            </Button>
            <Button variant="danger" fullWidth loading={cancelling} onClick={handleCancelPendingBooking}>
              Yes, cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
