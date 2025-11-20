'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import Link from 'next/link';
import styles from './page.module.css';

interface ChatRoom {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  userImage: string | null;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isOnline: boolean;
}

export default function ChatListPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const { on, off } = useSocket(token);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchChatRooms();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!token || !isAuthenticated) return;

    // Set up a polling interval to refresh chat rooms periodically
    // This ensures we get updates even if Socket.IO connection fails
    const pollingInterval = setInterval(() => {
      fetchChatRooms();
    }, 10000); // Poll every 10 seconds

    const handleNewMessage = (data: any) => {
      if (data.roomId) {
        fetchChatRooms();
      }
    };

    const handleNewChat = (data: any) => {
      console.log('New chat started:', data);
      fetchChatRooms();
    };

    const handleBookingStatusChanged = (data: any) => {
      // Refresh chat rooms when booking status changes (might create new chat rooms)
      fetchChatRooms();
    };

    // Try to set up Socket.IO listeners, but don't fail if connection isn't ready
    try {
      on('new_message', handleNewMessage);
      on('new_chat_started', handleNewChat);
      on('booking_status_changed', handleBookingStatusChanged);
    } catch (error) {
      console.warn('Socket.IO listeners not available:', error);
    }

    return () => {
      clearInterval(pollingInterval);
      try {
        off('new_message', handleNewMessage);
        off('new_chat_started', handleNewChat);
        off('booking_status_changed', handleBookingStatusChanged);
      } catch (error) {
        // Ignore errors when cleaning up
      }
    };
  }, [token, on, off, isAuthenticated]);

  const fetchChatRooms = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getCounsellorChatRooms();
      if (response.success && response.data) {
        setChatRooms(response.data.chatRooms || []);
      } else {
        setError(response.message || 'Failed to load chat rooms');
      }
    } catch (error: any) {
      console.error('Failed to fetch chat rooms:', error);
      setError(error.message || 'Failed to load chat rooms');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (days === 0) {
        return format(date, 'HH:mm');
      } else if (days === 1) {
        return 'Yesterday';
      } else if (days < 7) {
        return format(date, 'EEE');
      } else {
        return format(date, 'MMM d');
      }
    } catch {
      return '';
    }
  };

  return (
    <div className={styles.container}>
      <nav className={styles.nav}>
        <div className={styles.navContainer}>
          <div className={styles.navLeft}>
            <Link href="/dashboard" className={styles.navLink}>
              Dashboard
            </Link>
            <Link href="/bookings" className={styles.navLink}>
              Bookings
            </Link>
            <Link href="/chat" className={`${styles.navLink} ${styles.active}`}>
              Chat
            </Link>
          </div>
          <div className={styles.navRight}>
            {user && (
              <span className={styles.userInfo}>
                {user.firstName} {user.lastName}
              </span>
            )}
            <button onClick={logout} className={styles.logoutBtn}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>Chat Messages</h1>
          <p className={styles.subtitle}>Connect with your clients</p>
        </div>

        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}

        {loading ? (
          <div className={styles.loading}>
            <p>Loading chat rooms...</p>
          </div>
        ) : chatRooms.length === 0 ? (
          <div className={styles.empty}>
            <p>No chat conversations yet.</p>
            <p className={styles.emptySubtext}>When users start chatting with you, conversations will appear here.</p>
          </div>
        ) : (
          <div className={styles.chatList}>
            {chatRooms.map((room) => (
              <Link
                key={room.id}
                href={`/chat/${room.roomId}`}
                className={styles.chatItem}
              >
                <div className={styles.chatItemAvatar}>
                  {room.userImage ? (
                    <img
                      src={room.userImage}
                      alt={room.userName}
                      className={styles.avatarImage}
                    />
                  ) : (
                    <div className={styles.avatarPlaceholder}>
                      {room.userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {room.isOnline && <span className={styles.onlineIndicator} />}
                </div>
                <div className={styles.chatItemContent}>
                  <div className={styles.chatItemHeader}>
                    <h3 className={styles.chatItemName}>{room.userName}</h3>
                    <span className={styles.chatItemTime}>
                      {formatTime(room.lastMessageTime)}
                    </span>
                  </div>
                  <div className={styles.chatItemFooter}>
                    <p className={styles.chatItemMessage}>
                      {room.lastMessage || 'No messages yet'}
                    </p>
                    {room.unreadCount > 0 && (
                      <span className={styles.unreadBadge}>
                        {room.unreadCount > 99 ? '99+' : room.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

