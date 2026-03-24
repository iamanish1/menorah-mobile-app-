'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import Card from '@/components/ui/Card';
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
  const { isAuthenticated, isLoading } = useAuth();
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

    const pollingInterval = setInterval(() => { fetchChatRooms(); }, 10000);

    const handleNewMessage = (data: any) => { if (data.roomId) fetchChatRooms(); };
    const handleNewChat = () => { fetchChatRooms(); };

    try {
      on('new_message', handleNewMessage);
      on('new_chat_started', handleNewChat);
    } catch { }

    return () => {
      clearInterval(pollingInterval);
      try {
        off('new_message', handleNewMessage);
        off('new_chat_started', handleNewChat);
      } catch { }
    };
  }, [token, on, off, isAuthenticated]);

  const fetchChatRooms = async () => {
    try {
      setError(null);
      const response = await api.getCounsellorChatRooms();
      if (response.success && response.data) {
        setChatRooms(response.data.chatRooms || []);
      } else {
        setError(response.message || 'Failed to load chat rooms');
      }
    } catch (error: any) {
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
      if (days === 0) return format(date, 'HH:mm');
      if (days === 1) return 'Yesterday';
      if (days < 7) return format(date, 'EEE');
      return format(date, 'MMM d');
    } catch { return ''; }
  };

  if (isLoading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <AppLayout>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Chat Messages</h1>
          <p className={styles.pageSubtitle}>Connect with your clients in real-time</p>
        </div>
        <div className={styles.headerBadge}>
          {chatRooms.filter(r => r.unreadCount > 0).length > 0 && (
            <span className={styles.unreadTotal}>
              {chatRooms.reduce((sum, r) => sum + r.unreadCount, 0)} unread
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className={styles.errorAlert}>
          <svg fill="currentColor" viewBox="0 0 20 20" width="18" height="18">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {loading ? (
        <div className={styles.skeletonList}>
          {[1, 2, 3, 4].map(i => <div key={i} className={styles.skeletonItem} />)}
        </div>
      ) : chatRooms.length === 0 ? (
        <Card>
          <div className={styles.emptyState}>
            <div className={styles.emptyIconBox}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="32" height="32">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className={styles.emptyTitle}>No conversations yet</h3>
            <p className={styles.emptyText}>When users start chatting with you, conversations will appear here.</p>
          </div>
        </Card>
      ) : (
        <div className={styles.chatList}>
          {chatRooms.map((room) => (
            <Link key={room.id} href={`/chat/${room.roomId}`} className={styles.chatItem}>
              <div className={styles.avatarWrapper}>
                {room.userImage ? (
                  <img src={room.userImage} alt={room.userName} className={styles.avatarImg} />
                ) : (
                  <div className={styles.avatarPlaceholder}>
                    {room.userName.charAt(0).toUpperCase()}
                  </div>
                )}
                {room.isOnline && <span className={styles.onlineDot} />}
              </div>
              <div className={styles.chatContent}>
                <div className={styles.chatTop}>
                  <h3 className={styles.chatName}>{room.userName}</h3>
                  <span className={styles.chatTime}>{formatTime(room.lastMessageTime)}</span>
                </div>
                <div className={styles.chatBottom}>
                  <p className={styles.chatPreview}>{room.lastMessage || 'No messages yet'}</p>
                  {room.unreadCount > 0 && (
                    <span className={styles.unreadBadge}>
                      {room.unreadCount > 99 ? '99+' : room.unreadCount}
                    </span>
                  )}
                </div>
              </div>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.chatArrow}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
