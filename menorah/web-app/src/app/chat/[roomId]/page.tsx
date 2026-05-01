'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import styles from './page.module.css';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderImage: string | null;
  content: string;
  timestamp: string;
  type: string;
  status: string;
  roomId: string;
}

export default function ChatThreadPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = params?.roomId as string;
  const { user, isAuthenticated, isLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userImage, setUserImage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const { on, off, emit } = useSocket(token);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (roomId && isAuthenticated) {
      fetchMessages();
      joinRoom();
    }

    return () => {
      if (roomId) {
        leaveRoom();
      }
    };
  }, [roomId, isAuthenticated]);

  useEffect(() => {
    if (!token || !roomId) return;

    const handleNewMessage = (data: any) => {
      if (data.roomId === roomId) {
        setMessages(prev => {
          // Check if message already exists by ID
          const exists = prev.find(m => m.id === data.id);
          if (exists) {
            // Update existing message instead of adding duplicate
            return prev.map(m => m.id === data.id ? data : m);
          }
          // Add new message only if it doesn't exist
          return [...prev, data];
        });
        scrollToBottom();
      }
    };

    const handleMessageRead = (data: any) => {
      if (data.roomId === roomId) {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === data.messageId ? { ...msg, status: 'read' } : msg
          )
        );
      }
    };

    on('new_message', handleNewMessage);
    on('message_read', handleMessageRead);

    return () => {
      off('new_message', handleNewMessage);
      off('message_read', handleMessageRead);
    };
  }, [token, roomId, on, off]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const joinRoom = () => {
    if (roomId && emit) {
      emit('join_room', roomId);
    }
  };

  const leaveRoom = () => {
    if (roomId && emit) {
      emit('leave_room', roomId);
    }
  };

  const fetchMessages = async () => {
    if (!roomId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await api.getChatMessages(roomId);
      if (response.success && response.data) {
        const msgs = response.data.messages || [];
        // Remove duplicates by ID before setting state
        const uniqueMessages = msgs.reduce((acc: Message[], msg: Message) => {
          if (!acc.find(m => m.id === msg.id)) {
            acc.push(msg);
          }
          return acc;
        }, []);
        // Sort by timestamp to ensure correct order
        uniqueMessages.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setMessages(uniqueMessages);
        
        // Get user info from first message or room
        if (uniqueMessages.length > 0) {
          // Find a message not from current user
          const userMsg = uniqueMessages.find(m => m.senderId !== user?.id);
          if (userMsg) {
            setUserName(userMsg.senderName);
            setUserImage(userMsg.senderImage);
          }
        }
      } else {
        setError(response.message || 'Failed to load messages');
      }
    } catch (error: any) {
      console.error('Failed to fetch messages:', error);
      setError(error.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !roomId || sending) return;

    const messageText = message.trim();
    setMessage('');
    setSending(true);

    try {
      const response = await api.sendChatMessage(roomId, messageText);
      if (response.success && response.data) {
        const newMessage = response.data.message;
        setMessages(prev => {
          // Check if message already exists to prevent duplicates
          const exists = prev.find(m => m.id === newMessage.id);
          if (exists) {
            return prev; // Don't add duplicate
          }
          return [...prev, newMessage];
        });
        scrollToBottom();
      } else {
        setError(response.message || 'Failed to send message');
        setMessage(messageText); // Restore message on error
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);
      setError(error.message || 'Failed to send message');
      setMessage(messageText); // Restore message on error
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return format(date, 'HH:mm');
    } catch {
      return '';
    }
  };

  const formatDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (days === 0) {
        return 'Today';
      } else if (days === 1) {
        return 'Yesterday';
      } else {
        return format(date, 'MMM d, yyyy');
      }
    } catch {
      return '';
    }
  };

  return (
    <AppLayout>
      <div className={styles.chatWrapper}>
        <div className={styles.chatContainer}>
          <div className={styles.chatHeader}>
            <Link href="/chat" className={styles.backButton}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Chats
            </Link>
            <div className={styles.chatHeaderInfo}>
            {userImage ? (
              <img src={userImage} alt={userName} className={styles.headerAvatar} />
            ) : (
              <div className={styles.headerAvatarPlaceholder}>
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className={styles.chatHeaderName}>{userName || 'User'}</h2>
              {isOnline && <span className={styles.onlineStatus}>Online</span>}
            </div>
          </div>
        </div>

        <div className={styles.messagesContainer}>
          {loading ? (
            <div className={styles.loading}>
              <p>Loading messages...</p>
            </div>
          ) : error ? (
            <div className={styles.error}>
              {error}
            </div>
          ) : messages.length === 0 ? (
            <div className={styles.empty}>
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            <div className={styles.messages}>
              {messages.map((msg, index) => {
                const isUser = msg.senderId === user?.id;
                const showDate = index === 0 || 
                  formatDate(msg.timestamp) !== formatDate(messages[index - 1].timestamp);
                
                // Use a combination of id and timestamp to ensure unique keys
                const uniqueKey = `${msg.id}-${msg.timestamp}-${index}`;
                
                return (
                  <div key={uniqueKey}>
                    {showDate && (
                      <div className={styles.dateDivider}>
                        {formatDate(msg.timestamp)}
                      </div>
                    )}
                    <div className={`${styles.message} ${isUser ? styles.messageSent : styles.messageReceived}`}>
                      {!isUser && (
                        <div className={styles.messageAvatar}>
                          {msg.senderImage ? (
                            <img src={msg.senderImage} alt={msg.senderName} />
                          ) : (
                            <div>{msg.senderName.charAt(0).toUpperCase()}</div>
                          )}
                        </div>
                      )}
                      <div className={styles.messageContent}>
                        {!isUser && (
                          <span className={styles.messageSender}>{msg.senderName}</span>
                        )}
                        <div className={styles.messageBubble}>
                          <p>{msg.content}</p>
                          <span className={styles.messageTime}>{formatTime(msg.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className={styles.inputContainer}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className={styles.messageInput}
            rows={1}
            disabled={sending}
          />
          <button
            onClick={handleSendMessage}
            disabled={!message.trim() || sending}
            className={styles.sendButton}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
        </div>
      </div>
    </AppLayout>
  );
}

