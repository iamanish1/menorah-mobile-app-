import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { socketService, SessionStartedData, BookingStatusData, BookingConfirmedData, BookingRescheduledData, ChatMessage } from '@/lib/socket';
import { useAuth } from '@/state/useAuth';
import { navigate } from '@/services/navigationService';
import { isSafeNavigationIdentifier } from '@/lib/deepLinks';

export type AppNotificationType = 'session' | 'booking' | 'message' | 'system';

export interface AppNotification {
  id: string;
  type: AppNotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  actionLabel?: string;
  data?: {
    bookingId?: string;
    roomId?: string;
    sessionType?: 'video' | 'audio' | 'chat';
  };
}

interface NotificationsContextType {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'> & Partial<Pick<AppNotification, 'read'>>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  openNotification: (notification: AppNotification) => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const MAX_NOTIFICATIONS = 50;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useLayoutEffect(() => {
    // Notifications deliberately remain memory-only and are never shared
    // between accounts on the same device. Layout timing clears before paint.
    setNotifications([]);
  }, [user?.id]);

  const addNotification = useCallback((notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'> & Partial<Pick<AppNotification, 'read'>>) => {
    setNotifications((prev) => {
      const nextNotification: AppNotification = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        read: notification.read ?? false,
        ...notification,
      };

      return [nextNotification, ...prev].slice(0, MAX_NOTIFICATIONS);
    });
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification
      )
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const openNotification = useCallback((notification: AppNotification) => {
    if (!user?.id) {
      return;
    }

    markAsRead(notification.id);

    if (
      isSafeNavigationIdentifier(notification.data?.bookingId) &&
      notification.data?.sessionType
    ) {
      if (notification.data.sessionType === 'video') {
        navigate('PreCallCheck', { bookingId: notification.data.bookingId });
        return;
      }

      if (notification.data.sessionType === 'chat') {
        navigate('ChatThread', { roomId: notification.data.bookingId });
        return;
      }
    }

    if (isSafeNavigationIdentifier(notification.data?.roomId)) {
      navigate('ChatThread', {
        roomId: notification.data.roomId,
      });
      return;
    }

    if (isSafeNavigationIdentifier(notification.data?.bookingId)) {
      navigate('BookingReview', { bookingId: notification.data.bookingId });
      return;
    }

    navigate('Tabs', { screen: 'Bookings' });
  }, [markAsRead, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const unsubscribeSessionStarted = socketService.onSessionStarted((data: SessionStartedData) => {
      if (
        !isSafeNavigationIdentifier(data.bookingId) ||
        !['video', 'audio', 'chat'].includes(data.sessionType)
      ) {
        return;
      }

      addNotification({
        type: 'session',
        title: 'Session ready',
        body: 'Open Menorah to review your session.',
        actionLabel: 'Join Session',
        data: {
          bookingId: data.bookingId,
          sessionType: data.sessionType,
        },
      });
    });

    const unsubscribeBookingStatus = socketService.onBookingStatusChanged((data: BookingStatusData) => {
      if (!isSafeNavigationIdentifier(data.bookingId)) {
        return;
      }

      addNotification({
        type: 'booking',
        title: 'Booking Updated',
        body: 'Open Menorah to review your booking.',
        actionLabel: 'View Booking',
        data: {
          bookingId: data.bookingId,
        },
      });
    });

    const unsubscribeBookingConfirmed = socketService.onBookingConfirmed((data: BookingConfirmedData) => {
      if (!isSafeNavigationIdentifier(data.bookingId)) {
        return;
      }

      addNotification({
        type: 'booking',
        title: 'Booking confirmed',
        body: 'Open Menorah to review your booking.',
        actionLabel: 'View Booking',
        data: {
          bookingId: data.bookingId,
        },
      });
    });

    const unsubscribeBookingRescheduled = socketService.onBookingRescheduled((data: BookingRescheduledData) => {
      if (!isSafeNavigationIdentifier(data.bookingId)) {
        return;
      }

      addNotification({
        type: 'booking',
        title: 'Session Rescheduled',
        body: `Your session has been rescheduled.`,
        actionLabel: 'View Booking',
        data: {
          bookingId: data.bookingId,
        },
      });
    });

    const unsubscribeMessage = socketService.onMessage((message: ChatMessage) => {
      if (
        message.senderId === user.id ||
        !isSafeNavigationIdentifier(message.roomId)
      ) {
        return;
      }

      addNotification({
        type: 'message',
        title: 'New message',
        body: 'Open Menorah to view your message.',
        actionLabel: 'Open Chat',
        data: {
          roomId: message.roomId,
        },
      });
    });

    return () => {
      unsubscribeSessionStarted();
      unsubscribeBookingStatus();
      unsubscribeBookingConfirmed();
      unsubscribeBookingRescheduled();
      unsubscribeMessage();
    };
  }, [addNotification, user?.id]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
      openNotification,
    }),
    [notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll, openNotification]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
