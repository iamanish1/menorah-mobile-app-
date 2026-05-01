'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Video, MessageCircle, Clock, CreditCard, XCircle, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, Badge, Button, Modal, Spinner } from '@/components/ui';
import { formatBookingDate, formatCurrency, getStatusColor } from '@/lib/utils';

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason]         = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn:  () => api.getBooking(id),
  });

  const booking = data?.data?.booking;

  const handleCancel = async () => {
    setCancelling(true);
    await api.cancelBooking(id, reason);
    setCancelling(false);
    setCancelOpen(false);
    qc.invalidateQueries({ queryKey: ['booking', id] });
    qc.invalidateQueries({ queryKey: ['bookings'] });
  };

  const handleJoinCall = async () => {
    const res = await api.joinVideoRoom(id);
    if (res.success && res.data?.roomUrl) {
      window.open(res.data.roomUrl, '_blank');
    }
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>;
  if (!booking)  return <div className="page-container text-center py-20 text-gray-500">Booking not found.</div>;

  const canJoin = booking.status === 'confirmed' || booking.status === 'in-progress';

  return (
    <div className="page-container max-w-2xl">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Booking Details</h1>
        <Badge className={getStatusColor(booking.status)}>{booking.status}</Badge>
      </div>

      <div className="space-y-4">
        {/* Counsellor info */}
        <div className="card p-5 flex items-center gap-4">
          <Avatar src={booking.counsellorImage} name={booking.counsellorName ?? 'Counsellor'} size="lg" />
          <div>
            <p className="font-semibold text-gray-900">{booking.counsellorName ?? 'Awaiting assignment'}</p>
            {booking.specialization && <p className="text-sm text-primary-600">{booking.specialization}</p>}
          </div>
        </div>

        {/* Session details */}
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Session Details</h2>
          {[
            { icon: Video,      label: 'Session type',  value: booking.sessionType },
            { icon: Clock,      label: 'Duration',      value: `${booking.sessionDuration} min` },
            { icon: Clock,      label: 'Scheduled',     value: booking.scheduledAt ? formatBookingDate(booking.scheduledAt) : 'Pending' },
            { icon: CreditCard, label: 'Payment',       value: booking.amount ? formatCurrency(booking.amount, booking.currency) : 'TBD' },
            { icon: CreditCard, label: 'Payment status',value: booking.paymentStatus },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              <Icon className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-gray-500 w-32">{label}</span>
              <span className="font-medium text-gray-900 capitalize">{value}</span>
            </div>
          ))}
        </div>

        {/* Session notes */}
        {(booking.concerns || (booking.goals && booking.goals.length > 0)) && (
          <div className="card p-5 space-y-2">
            <h2 className="font-semibold text-gray-900">Your Notes</h2>
            {booking.concerns && <p className="text-sm text-gray-600">{booking.concerns}</p>}
            {booking.goals && booking.goals.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {booking.goals.map((g) => <Badge key={g} variant="primary">{g}</Badge>)}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          {canJoin && booking.sessionType === 'video' && (
            <Button fullWidth onClick={handleJoinCall}>
              <Video className="w-4 h-4" /> Join Video Call
            </Button>
          )}
          {canJoin && booking.sessionType === 'chat' && booking.chat?.roomId && (
            <Button fullWidth onClick={() => router.push(`/chat/${booking.chat!.roomId}`)}>
              <MessageCircle className="w-4 h-4" /> Open Chat
            </Button>
          )}
          {booking.canBeCancelled && (
            <Button variant="danger" fullWidth onClick={() => setCancelOpen(true)}>
              <XCircle className="w-4 h-4" /> Cancel Booking
            </Button>
          )}
          {booking.status === 'pending' && !booking.paymentStatus?.includes('paid') && (
            <Button variant="secondary" fullWidth onClick={() => router.push(`/bookings/payment?bookingId=${id}`)}>
              <CreditCard className="w-4 h-4" /> Complete Payment
            </Button>
          )}
        </div>
      </div>

      {/* Cancel modal */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel Booking">
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">Are you sure you want to cancel this session? Cancellations within 24 hours may not be refunded.</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for cancellation (optional)"
            rows={3}
            className="input-field resize-none"
          />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setCancelOpen(false)}>Keep Booking</Button>
            <Button variant="danger" fullWidth loading={cancelling} onClick={handleCancel}>
              Yes, Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
