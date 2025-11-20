'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import Badge from '@/components/ui/Badge';
import styles from './NotificationCenter.module.css';

interface Notification {
  id: string;
  type: 'new_booking' | 'booking_assigned' | 'booking_scheduled' | 'status_changed';
  message: string;
  timestamp: Date;
}

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const { on, off } = useSocket(token);

  useEffect(() => {
    if (!token) return;

    const handleNewBooking = (data: any) => {
      addNotification({
        id: Date.now().toString(),
        type: 'new_booking',
        message: `New booking available: ${data.sessionType} session`,
        timestamp: new Date(),
      });
    };

    const handleBookingAssigned = (data: any) => {
      addNotification({
        id: Date.now().toString(),
        type: 'booking_assigned',
        message: 'You have been assigned to a new booking',
        timestamp: new Date(),
      });
    };

    const handleBookingScheduled = (data: any) => {
      addNotification({
        id: Date.now().toString(),
        type: 'booking_scheduled',
        message: 'A booking has been scheduled',
        timestamp: new Date(),
      });
    };

    const handleStatusChanged = (data: any) => {
      addNotification({
        id: Date.now().toString(),
        type: 'status_changed',
        message: `Booking status changed to: ${data.status}`,
        timestamp: new Date(),
      });
    };

    on('new_booking_available', handleNewBooking);
    on('booking_assigned', handleBookingAssigned);
    on('booking_scheduled', handleBookingScheduled);
    on('booking_status_changed', handleStatusChanged);

    return () => {
      off('new_booking_available', handleNewBooking);
      off('booking_assigned', handleBookingAssigned);
      off('booking_scheduled', handleBookingScheduled);
      off('booking_status_changed', handleStatusChanged);
    };
  }, [token, on, off]);

  const addNotification = (notification: Notification) => {
    setNotifications((prev) => [notification, ...prev].slice(0, 10));
    
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    }, 5000);
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const getBadgeVariant = (type: Notification['type']): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
    switch (type) {
      case 'new_booking':
        return 'info';
      case 'booking_assigned':
        return 'success';
      case 'booking_scheduled':
        return 'info';
      case 'status_changed':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <div className={styles.container}>
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={styles.notification}
        >
          <div className={styles.notificationContent}>
            <div className={styles.notificationLeft}>
              <div className={styles.badgeRow}>
                <Badge variant={getBadgeVariant(notification.type)} size="sm">
                  {notification.type.replace('_', ' ')}
                </Badge>
              </div>
              <p className={styles.message}>{notification.message}</p>
              <p className={styles.timestamp}>
                {notification.timestamp.toLocaleTimeString()}
              </p>
            </div>
            <button
              className={styles.closeButton}
              onClick={() => removeNotification(notification.id)}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
