'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { api } from '@/lib/api';
import type { AppNotification, Article, User } from '@/types';

const STORAGE_KEY = 'menorah_notifications';
const LATEST_ARTICLE_STORAGE_KEY = 'menorah_latest_article_key';
const MAX_NOTIFICATIONS = 50;
const ARTICLE_POLL_INTERVAL_MS = 60_000;

function loadFromStorage(): AppNotification[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(notifications: AppNotification[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {}
}

type UserWithMongoId = User & {
  _id?: string | { toString: () => string };
};

function getUserId(user: User | null): string {
  const rawId = user?.id ?? (user as UserWithMongoId | null)?._id;
  if (!rawId) return '';
  return typeof rawId === 'string' ? rawId : rawId.toString();
}

function getUserName(user: User | null): string {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
}

function getArticleNotificationKey(article: Article | null | undefined): string {
  if (!article?.slug) return '';
  return [article.id ?? article._id ?? article.slug, article.publishedAt ?? article.createdAt ?? ''].filter(Boolean).join(':');
}

function getStoredLatestArticleKey(): string {
  try {
    return sessionStorage.getItem(LATEST_ARTICLE_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeLatestArticleKey(key: string) {
  try {
    sessionStorage.setItem(LATEST_ARTICLE_STORAGE_KEY, key);
  } catch {}
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const { socket } = useSocket();
  const { user, isAuthed } = useAuth();
  const currentUserId = getUserId(user);
  const currentUserName = getUserName(user);

  // Load persisted notifications on mount
  useEffect(() => {
    setNotifications(loadFromStorage());
  }, []);

  const updateNotifications = useCallback((updater: (prev: AppNotification[]) => AppNotification[]) => {
    setNotifications((prev) => {
      const next = updater(prev);
      saveToStorage(next);
      return next;
    });
  }, []);

  const addNotification = useCallback((n: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>) => {
    const newN: AppNotification = {
      ...n,
      id: `notif_${Date.now()}_${Math.random()}`,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    updateNotifications((prev) => [newN, ...prev].slice(0, MAX_NOTIFICATIONS));
  }, [updateNotifications]);

  useEffect(() => {
    if (!currentUserId && !currentUserName) return;

    updateNotifications((prev) =>
      prev.filter((n) => {
        if (n.type !== 'message') return true;
        if (currentUserId && n.data?.senderId === currentUserId) return false;
        if (currentUserName && n.body === `${currentUserName} sent you a message.`) return false;
        return true;
      })
    );
  }, [currentUserId, currentUserName, updateNotifications]);

  useEffect(() => {
    if (!isAuthed) return;

    let cancelled = false;

    const checkLatestArticle = async () => {
      const res = await api.getArticles({ page: 1, limit: 1 });
      if (cancelled || !res.success) return;

      const latestArticle = res.data?.articles?.[0];
      const latestKey = getArticleNotificationKey(latestArticle);
      if (!latestArticle?.slug || !latestKey) return;

      const storedKey = getStoredLatestArticleKey();

      if (!storedKey) {
        storeLatestArticleKey(latestKey);
        return;
      }

      if (storedKey === latestKey) return;

      storeLatestArticleKey(latestKey);
      updateNotifications((prev) => {
        if (prev.some((n) => n.type === 'article' && n.data?.articleSlug === latestArticle.slug)) {
          return prev;
        }

        const newN: AppNotification = {
          id: `notif_article_${Date.now()}_${latestArticle.slug}`,
          type: 'article',
          title: 'New Article',
          body: latestArticle.title,
          data: {
            articleSlug: latestArticle.slug,
            articleTitle: latestArticle.title,
          },
          isRead: false,
          createdAt: new Date().toISOString(),
        };

        return [newN, ...prev].slice(0, MAX_NOTIFICATIONS);
      });
    };

    checkLatestArticle();
    const intervalId = window.setInterval(checkLatestArticle, ARTICLE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isAuthed, updateNotifications]);

  // Subscribe to real-time notifications from backend
  useEffect(() => {
    if (!socket) return;

    // Counsellor accepted the booking → confirmed
    const onBookingConfirmed = (data: { bookingId?: string; counsellorName?: string }) => {
      addNotification({
        type: 'booking_confirmed',
        title: 'Booking Confirmed',
        body: `${data.counsellorName ?? 'A counsellor'} has accepted your booking.`,
        data: { bookingId: data.bookingId ?? '' },
      });
    };

    // booking_assigned (also emitted in some paths)
    const onBookingAssigned = (data: { bookingId?: string; counsellorName?: string }) => {
      addNotification({
        type: 'booking_assigned',
        title: 'Counsellor Assigned',
        body: `${data.counsellorName ?? 'A counsellor'} has been assigned to your booking.`,
        data: { bookingId: data.bookingId ?? '' },
      });
    };

    // Generic booking status changes (cancel, complete, etc.)
    const onBookingStatus = (data: { bookingId?: string; status?: string }) => {
      const statusLabels: Record<string, string> = {
        confirmed: 'confirmed',
        cancelled: 'cancelled',
        completed: 'completed',
        'in-progress': 'started',
        'no-show': 'marked as no-show',
      };
      const label = statusLabels[data.status ?? ''] ?? data.status ?? 'updated';
      const type = data.status === 'cancelled' ? 'booking_cancelled' : 'booking_confirmed';
      addNotification({
        type,
        title: 'Booking Updated',
        body: `Your session has been ${label}.`,
        data: { bookingId: data.bookingId ?? '' },
      });
    };

    // Session started by counsellor
    const onSessionStarted = (data: { bookingId?: string; roomUrl?: string }) => {
      addNotification({
        type: 'session_reminder',
        title: 'Session Started',
        body: 'Your counsellor has started the session. Join now!',
        data: { bookingId: data.bookingId ?? '' },
      });
    };

    // Counsellor rescheduled
    const onBookingRescheduled = (data: { bookingId?: string; scheduledAt?: string; counsellorName?: string }) => {
      const who = data.counsellorName ?? 'Your counsellor';
      const when = data.scheduledAt
        ? new Date(data.scheduledAt).toLocaleString('en-IN', {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit',
          })
        : null;
      addNotification({
        type: 'booking_confirmed',
        title: 'Session Rescheduled',
        body: when
          ? `${who} rescheduled your session to ${when}.`
          : `${who} rescheduled your session.`,
        data: { bookingId: data.bookingId ?? '' },
      });
    };

    // New chat message
    const onNewMessage = (data: { senderId?: string; senderName?: string; roomId?: string }) => {
      if (currentUserId && data.senderId === currentUserId) return;
      if (!data.senderId && currentUserName && data.senderName === currentUserName) return;

      addNotification({
        type: 'message',
        title: 'New Message',
        body: `${data.senderName ?? 'Someone'} sent you a message.`,
        data: { roomId: data.roomId ?? '', senderId: data.senderId ?? '' },
      });
    };

    socket.on('booking_confirmed',       onBookingConfirmed);
    socket.on('booking_assigned',        onBookingAssigned);
    socket.on('booking_status_changed',  onBookingStatus);
    socket.on('session_started',         onSessionStarted);
    socket.on('booking_rescheduled',     onBookingRescheduled);
    socket.on('new_message',             onNewMessage);

    return () => {
      socket.off('booking_confirmed',       onBookingConfirmed);
      socket.off('booking_assigned',        onBookingAssigned);
      socket.off('booking_status_changed',  onBookingStatus);
      socket.off('session_started',         onSessionStarted);
      socket.off('booking_rescheduled',     onBookingRescheduled);
      socket.off('new_message',             onNewMessage);
    };
  }, [socket, addNotification, currentUserId, currentUserName]);

  const markRead    = (id: string) => updateNotifications((p) => p.map((n) => n.id === id ? { ...n, isRead: true } : n));
  const markAllRead = () => updateNotifications((p) => p.map((n) => ({ ...n, isRead: true })));
  const clearAll    = () => updateNotifications(() => []);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markAllRead, markRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
