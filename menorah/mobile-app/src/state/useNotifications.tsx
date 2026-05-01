import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { socketService, SessionStartedData, BookingStatusData, ChatMessage } from '@/lib/socket';
import { useAuth } from '@/state/useAuth';
import { navigate } from '@/services/navigationService';

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
    counsellorName?: string;
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

  const storageKey = useMemo(
    () => (user?.id ? `notifications_${user.id}` : null),
    [user?.id]
  );

  useEffect(() => {
    if (!storageKey) {
      setNotifications([]);
      return;
    }

    let isMounted = true;

    const loadNotifications = async () => {
      try {
        const stored = await AsyncStorage.getItem(storageKey);
        if (stored && isMounted) {
          setNotifications(JSON.parse(stored));
        } else if (isMounted) {
          setNotifications([]);
        }
      } catch (error) {
        console.error('Failed to load notifications:', error);
        if (isMounted) {
          setNotifications([]);
        }
      }
    };

    loadNotifications();

    return () => {
      isMounted = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    AsyncStorage.setItem(storageKey, JSON.stringify(notifications)).catch((error) => {
      console.error('Failed to persist notifications:', error);
    });
  }, [notifications, storageKey]);

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
    markAsRead(notification.id);

    if (notification.data?.bookingId && notification.data?.sessionType) {
      if (notification.data.sessionType === 'video') {
        navigate('PreCallCheck', { bookingId: notification.data.bookingId });
        return;
      }

      if (notification.data.sessionType === 'chat') {
        navigate('ChatThread', { roomId: notification.data.bookingId });
        return;
      }
    }

    if (notification.data?.roomId) {
      navigate('ChatThread', {
        roomId: notification.data.roomId,
        counsellorName: notification.data.counsellorName,
      });
      return;
    }

    if (notification.data?.bookingId) {
      navigate('BookingReview', { bookingId: notification.data.bookingId });
      return;
    }

    navigate('Bookings');
  }, [markAsRead]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const unsubscribeSessionStarted = socketService.onSessionStarted((data: SessionStartedData) => {
      addNotification({
        type: 'session',
        title: 'Session Started',
        body: `${data.counsellorName} is waiting for you now.`,
        actionLabel: 'Join Session',
        data: {
          bookingId: data.bookingId,
          sessionType: data.sessionType,
          counsellorName: data.counsellorName,
        },
      });
    });

    const unsubscribeBookingStatus = socketService.onBookingStatusChanged((data: BookingStatusData) => {
      addNotification({
        type: 'booking',
        title: 'Booking Updated',
        body: `Your booking status changed to ${data.status}.`,
        actionLabel: 'View Booking',
        data: {
          bookingId: data.bookingId,
        },
      });
    });

    const unsubscribeMessage = socketService.onMessage((message: ChatMessage) => {
      if (message.senderId === user.id) {
        return;
      }

      addNotification({
        type: 'message',
        title: message.senderName || 'New message',
        body: message.content || 'You received a new message.',
        actionLabel: 'Open Chat',
        data: {
          roomId: message.roomId,
          counsellorName: message.senderName,
        },
      });
    });

    return () => {
      unsubscribeSessionStarted();
      unsubscribeBookingStatus();
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
