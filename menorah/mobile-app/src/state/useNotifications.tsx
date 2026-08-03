import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { socketService, SessionStartedData, BookingStatusData, BookingConfirmedData, BookingRescheduledData, ChatMessage } from '@/lib/socket';
import { useAuth } from '@/state/useAuth';
import { navigate } from '@/services/navigationService';
import { isSafeNavigationIdentifier } from '@/lib/deepLinks';
import { resolveBookingChatRoomId } from '@/lib/bookingChat';
import { reportError } from '@/lib/safeDiagnostics';
import { api } from '@/lib/api';
import {
  PushPermissionState,
  addPushResponseListener,
  addPushTokenChangeListener,
  clearLastPushResponseAsync,
  getAndroidPushPermissionAsync,
  getLastPushResponseAsync,
  registerAndroidPushNotificationsAsync,
  unregisterStoredPushDeviceAsync,
} from '@/services/pushNotifications';
import type { NotificationResponse } from 'expo-notifications';

export type AppNotificationType = 'article' | 'session' | 'booking' | 'message' | 'system';

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
    articleSlug?: string;
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
  pushEnabled: boolean;
  pushLoading: boolean;
  pushPermission: PushPermissionState;
  setPushNotificationsEnabled: (enabled: boolean) => Promise<boolean>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const MAX_NOTIFICATIONS = 50;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermissionState>('undetermined');

  useLayoutEffect(() => {
    // Notifications deliberately remain memory-only and are never shared
    // between accounts on the same device. Layout timing clears before paint.
    setNotifications([]);
    setPushEnabled(false);
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

  const openNotification = useCallback(async (notification: AppNotification) => {
    if (!user?.id) {
      return;
    }

    markAsRead(notification.id);

    if (isSafeNavigationIdentifier(notification.data?.articleSlug)) {
      navigate('ArticleDetail', { slug: notification.data.articleSlug });
      return;
    }

    if (
      isSafeNavigationIdentifier(notification.data?.bookingId) &&
      notification.data?.sessionType
    ) {
      if (notification.data.sessionType === 'video' || notification.data.sessionType === 'audio') {
        navigate('PreCallCheck', { bookingId: notification.data.bookingId });
        return;
      }

      if (notification.data.sessionType === 'chat') {
        try {
          const roomId = isSafeNavigationIdentifier(notification.data.roomId)
            ? notification.data.roomId
            : await resolveBookingChatRoomId(notification.data.bookingId);
          navigate('ChatThread', { roomId });
        } catch (error) {
          reportError('notification.chat_resolution_failed', error);
          navigate('BookingReview', { bookingId: notification.data.bookingId });
        }
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

  const setPushNotificationsEnabled = useCallback(async (enabled: boolean) => {
    if (!user?.id || pushLoading) return false;
    setPushLoading(true);

    try {
      if (enabled) {
        const registration = await registerAndroidPushNotificationsAsync({
          requestPermission: true,
          userId: user.id,
        });
        setPushPermission(registration.permission);
        if (!registration.enabled) return false;

        const preferenceResponse = await api.updateNotificationPreferences({ push: true });
        if (!preferenceResponse.success) {
          await unregisterStoredPushDeviceAsync(user.id);
          return false;
        }
      } else {
        const preferenceResponse = await api.updateNotificationPreferences({ push: false });
        if (!preferenceResponse.success) return false;
        const detached = await unregisterStoredPushDeviceAsync(user.id);
        if (!detached) reportError('push.preference_detachment_deferred');
      }

      setPushEnabled(enabled);
      updateUser({
        ...user,
        notificationPreferences: {
          ...user.notificationPreferences,
          push: enabled,
        },
      });
      return true;
    } catch (error) {
      reportError('push.preference_update_failed', error);
      return false;
    } finally {
      setPushLoading(false);
    }
  }, [pushLoading, updateUser, user]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const reconcilePushRegistration = async () => {
      try {
        const permission = await getAndroidPushPermissionAsync();
        if (!active) return;
        setPushPermission(permission);

        if (permission === 'granted' && user.notificationPreferences?.push !== false) {
          const registration = await registerAndroidPushNotificationsAsync({
            requestPermission: false,
            userId: user.id,
          });
          if (active) {
            setPushPermission(registration.permission);
            setPushEnabled(registration.enabled);
          }
        }
      } catch (error) {
        reportError('push.permission_check_failed', error);
      }
    };

    reconcilePushRegistration().catch(error => {
      reportError('push.registration_reconciliation_failed', error);
    });
    const tokenSubscription = addPushTokenChangeListener(() => {
      if (!active || user.notificationPreferences?.push === false) return;
      reconcilePushRegistration().catch(error => {
        reportError('push.token_rollover_failed', error);
      });
    });

    return () => {
      active = false;
      tokenSubscription.remove();
    };
  }, [user?.id, user?.notificationPreferences?.push]);

  const pushResponseToNotification = useCallback((response: NotificationResponse) => {
    const content = response.notification.request.content;
    const data = content.data || {};
    const type = ['article', 'session', 'message'].includes(String(data.notificationType))
      ? data.notificationType as AppNotificationType
      : 'system';
    const eventId = isSafeNavigationIdentifier(data.eventId)
      ? data.eventId
      : response.notification.request.identifier;

    return {
      id: eventId,
      type,
      title: typeof content.title === 'string' ? content.title : 'Menorah',
      body: typeof content.body === 'string' ? content.body : 'Open Menorah to view this update.',
      createdAt: new Date(response.notification.date).toISOString(),
      read: false,
      data: {
        ...(isSafeNavigationIdentifier(data.articleSlug)
          ? { articleSlug: data.articleSlug }
          : {}),
        ...(isSafeNavigationIdentifier(data.bookingId)
          ? { bookingId: data.bookingId }
          : {}),
        ...(isSafeNavigationIdentifier(data.roomId) ? { roomId: data.roomId } : {}),
        ...(['video', 'audio', 'chat'].includes(String(data.sessionType))
          ? { sessionType: data.sessionType as 'video' | 'audio' | 'chat' }
          : {}),
      },
    } satisfies AppNotification;
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const handleResponse = (response: NotificationResponse) => {
      if (active) {
        openNotification(pushResponseToNotification(response))
          .catch((error) => reportError('push.navigation_failed', error));
      }
    };
    const subscription = addPushResponseListener(handleResponse);

    getLastPushResponseAsync()
      .then(async (response) => {
        if (active && response) {
          await openNotification(pushResponseToNotification(response));
          await clearLastPushResponseAsync();
        }
      })
      .catch((error) => reportError('push.cold_start_navigation_failed', error));

    return () => {
      active = false;
      subscription.remove();
    };
  }, [openNotification, pushResponseToNotification, user?.id]);

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
          roomId: data.roomId,
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
      pushEnabled,
      pushLoading,
      pushPermission,
      setPushNotificationsEnabled,
    }),
    [
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
      openNotification,
      pushEnabled,
      pushLoading,
      pushPermission,
      setPushNotificationsEnabled,
    ]
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
