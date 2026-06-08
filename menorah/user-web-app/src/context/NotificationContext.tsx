'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import type { AppNotification } from '@/types';

const STORAGE_KEY = 'menorah_notifications';
const MAX_NOTIFICATIONS = 50;

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
    const onNewMessage = (data: { senderName?: string; roomId?: string }) => {
      addNotification({
        type: 'message',
        title: 'New Message',
        body: `${data.senderName ?? 'Someone'} sent you a message.`,
        data: { roomId: data.roomId ?? '' },
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
  }, [socket, addNotification]);

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
