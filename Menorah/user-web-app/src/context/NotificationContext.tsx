'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { socketEvents } from '@/lib/socket';
import type { AppNotification } from '@/types';

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

  const addNotification = useCallback((n: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>) => {
    const newN: AppNotification = {
      ...n,
      id: `notif_${Date.now()}_${Math.random()}`,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    setNotifications((prev) => [newN, ...prev].slice(0, 50));
  }, []);

  // Subscribe to real-time booking notifications
  useEffect(() => {
    if (!socket) return;

    const onBookingAssigned = (data: { bookingId?: string; counsellorName?: string }) => {
      addNotification({
        type: 'booking_assigned',
        title: 'Counsellor Assigned',
        body: `${data.counsellorName ?? 'A counsellor'} has been assigned to your booking.`,
        data: { bookingId: data.bookingId ?? '' },
      });
    };

    const onBookingStatus = (data: { bookingId?: string; status?: string; counsellorName?: string }) => {
      addNotification({
        type: 'booking_confirmed',
        title: 'Booking Updated',
        body: `Your session status changed to ${data.status}.`,
        data: { bookingId: data.bookingId ?? '' },
      });
    };

    const onNewMessage = (data: { senderName?: string; roomId?: string }) => {
      addNotification({
        type: 'message',
        title: 'New Message',
        body: `${data.senderName ?? 'Someone'} sent you a message.`,
        data: { roomId: data.roomId ?? '' },
      });
    };

    socket.on(socketEvents.BOOKING_ASSIGNED, onBookingAssigned);
    socket.on(socketEvents.BOOKING_STATUS,   onBookingStatus);
    socket.on(socketEvents.NEW_MESSAGE,      onNewMessage);

    return () => {
      socket.off(socketEvents.BOOKING_ASSIGNED, onBookingAssigned);
      socket.off(socketEvents.BOOKING_STATUS,   onBookingStatus);
      socket.off(socketEvents.NEW_MESSAGE,      onNewMessage);
    };
  }, [socket, addNotification]);

  const markRead    = (id: string) => setNotifications((p) => p.map((n) => n.id === id ? { ...n, isRead: true } : n));
  const markAllRead = () => setNotifications((p) => p.map((n) => ({ ...n, isRead: true })));
  const clearAll    = () => setNotifications([]);
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
