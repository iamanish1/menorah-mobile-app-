'use client';

import { useRouter } from 'next/navigation';
import { Bell, BookOpen, MessageCircle, CheckCheck, Trash2, CalendarDays, Info } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';
import { formatRelativeTime } from '@/lib/utils';
import { Button } from '@/components/ui';
import type { AppNotification } from '@/types';

const iconMap: Record<AppNotification['type'], React.ElementType> = {
  booking_assigned:  CalendarDays,
  booking_confirmed: CalendarDays,
  booking_cancelled: CalendarDays,
  session_reminder:  CalendarDays,
  message:           MessageCircle,
  system:            Info,
};

const colorMap: Record<AppNotification['type'], string> = {
  booking_assigned:  'bg-primary-50 text-primary-600',
  booking_confirmed: 'bg-blue-50 text-blue-600',
  booking_cancelled: 'bg-red-50 text-red-600',
  session_reminder:  'bg-yellow-50 text-yellow-600',
  message:           'bg-purple-50 text-purple-600',
  system:            'bg-gray-50 text-gray-600',
};

export default function NotificationsPage() {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const router = useRouter();

  const handleClick = (n: AppNotification) => {
    markRead(n.id);
    if (n.data?.bookingId) router.push(`/bookings/${n.data.bookingId}`);
    else if (n.data?.roomId) router.push(`/chat/${n.data.roomId}`);
  };

  return (
    <div className="page-container max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        {notifications.length > 0 && (
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead}>
                <CheckCheck className="w-4 h-4" /> Mark all read
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <Trash2 className="w-4 h-4" /> Clear all
            </Button>
          </div>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <Bell className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="font-medium text-gray-500">No notifications yet</p>
          <p className="text-sm mt-1">You&apos;ll see booking updates and messages here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = iconMap[n.type] ?? Info;
            const color = colorMap[n.type] ?? 'bg-gray-50 text-gray-600';
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full flex items-start gap-3 p-4 rounded-2xl text-left transition-colors
                  ${n.isRead ? 'bg-white hover:bg-gray-50' : 'bg-primary-50/60 hover:bg-primary-50'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium ${n.isRead ? 'text-gray-700' : 'text-gray-900'}`}>
                      {n.title}
                    </p>
                    {!n.isRead && (
                      <span className="w-2 h-2 bg-primary-600 rounded-full shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(n.createdAt)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
