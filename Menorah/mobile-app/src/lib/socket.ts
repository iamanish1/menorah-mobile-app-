import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from './env';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderImage?: string;
  content: string;
  timestamp: string;
  type: 'text' | 'image' | 'file';
  status?: 'sent' | 'delivered' | 'read';
  roomId?: string; // Added for context
}

export interface TypingIndicator {
  userId: string;
  userName: string;
  isTyping: boolean;
  roomId?: string; // Added for context
}

export interface UserStatus {
  userId: string;
  userName: string;
  isOnline: boolean;
  timestamp: string;
  roomId?: string; // Added for room-specific status
}

export interface MessageReadReceipt {
  messageId: string;
  readBy: string;
  readByUserName: string;
  timestamp: string;
  roomId?: string; // Added for context
}

export interface SessionStartedData {
  bookingId: string;
  status: string;
  sessionType: 'video' | 'audio' | 'chat';
  roomUrl?: string;
  counsellorName: string;
  scheduledAt: string;
  sessionDuration: number;
}

export interface BookingStatusData {
  bookingId: string;
  status: string;
}

class SocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  // Event listeners
  private messageListeners: ((message: ChatMessage) => void)[] = [];
  private typingListeners: ((typing: TypingIndicator) => void)[] = [];
  private statusListeners: ((status: UserStatus) => void)[] = [];
  private readReceiptListeners: ((receipt: MessageReadReceipt) => void)[] = [];
  private connectionListeners: ((connected: boolean) => void)[] = [];
  private sessionStartedListeners: ((data: SessionStartedData) => void)[] = [];
  private bookingStatusListeners: ((data: BookingStatusData) => void)[] = [];

  // Initialize socket connection
  async connect(): Promise<void> {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      
      if (!token) {
        console.warn('No authentication token found, attempting connection without auth');
      }

      // Create socket connection with proper URL (Socket.IO doesn't use /api prefix)
      const socketUrl = ENV.API_ORIGIN || ENV.API_BASE_URL || (__DEV__ 
        ? 'http://localhost:3000' 
        : 'https://app-api.menorahhealth.app');
      console.log('Connecting to Socket.IO at:', socketUrl);
      
      this.socket = io(socketUrl, {
        auth: token ? { token } : {},
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        forceNew: true,
        autoConnect: true,
      });

      this.setupEventListeners();
      
      return new Promise((resolve, reject) => {
        if (this.socket) {
          this.socket.on('connect', () => {
            console.log('Socket.IO connected successfully');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.notifyConnectionListeners(true);
            resolve();
          });

          this.socket.on('connect_error', (error) => {
            console.error('Socket.IO connection error:', error.message);
            this.isConnected = false;
            this.notifyConnectionListeners(false);
            
            // Don't reject immediately, let reconnection handle it
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
              reject(error);
            }
          });

          this.socket.on('disconnect', (reason) => {
            console.log('Socket.IO disconnected:', reason);
            this.isConnected = false;
            this.notifyConnectionListeners(false);
          });

          this.socket.on('reconnect_attempt', (attemptNumber) => {
            console.log(`Socket.IO reconnection attempt ${attemptNumber}`);
            this.reconnectAttempts = attemptNumber;
          });

          this.socket.on('reconnect', (attemptNumber) => {
            console.log(`Socket.IO reconnected after ${attemptNumber} attempts`);
            this.isConnected = true;
            this.notifyConnectionListeners(true);
          });

          this.socket.on('reconnect_error', (error) => {
            console.error('Socket.IO reconnection error:', error);
          });

          this.socket.on('reconnect_failed', () => {
            console.error('Socket.IO reconnection failed after all attempts');
            reject(new Error('Failed to reconnect to Socket.IO server'));
          });
        }
      });
    } catch (error) {
      console.error('Failed to connect to Socket.IO:', error);
      throw error;
    }
  }

  // Setup socket event listeners
  private setupEventListeners(): void {
    if (!this.socket) return;

    // New message received
    this.socket.on('new_message', (message: ChatMessage) => {
      console.log('New message received:', message);
      // Add roomId to message if not present
      const messageWithRoom = { ...message, roomId: message.roomId };
      this.notifyMessageListeners(messageWithRoom);
    });

    // Typing indicator
    this.socket.on('user_typing', (typing: TypingIndicator) => {
      console.log('Typing indicator:', typing);
      // Add roomId to typing indicator if not present
      const typingWithRoom = { ...typing, roomId: typing.roomId };
      this.notifyTypingListeners(typingWithRoom);
    });

    // User status change
    this.socket.on('user_status_changed', (status: UserStatus) => {
      console.log('User status changed:', status);
      this.notifyStatusListeners(status);
    });

    // Message read receipt
    this.socket.on('message_read', (receipt: MessageReadReceipt) => {
      console.log('Message read receipt:', receipt);
      // Add roomId to receipt if not present
      const receiptWithRoom = { ...receipt, roomId: receipt.roomId };
      this.notifyReadReceiptListeners(receiptWithRoom);
    });

    // Message delivered confirmation
    this.socket.on('message_delivered', (data: { messageId: string; timestamp: string }) => {
      console.log('Message delivered:', data);
      // You can update message status here
    });

    // User joined room
    this.socket.on('user_joined', (data: { userId: string; userName: string; roomId: string; timestamp: string }) => {
      console.log('User joined room:', data);
      // Notify status listeners that user is online in this room
      this.notifyStatusListeners({
        userId: data.userId,
        userName: data.userName,
        isOnline: true,
        timestamp: data.timestamp,
        roomId: data.roomId
      });
    });

    // User left room
    this.socket.on('user_left', (data: { userId: string; userName: string; roomId: string; timestamp: string }) => {
      console.log('User left room:', data);
      // Notify status listeners that user is offline in this room
      this.notifyStatusListeners({
        userId: data.userId,
        userName: data.userName,
        isOnline: false,
        timestamp: data.timestamp,
        roomId: data.roomId
      });
    });

    // Session started - counselor is waiting for user to join
    this.socket.on('session_started', (data: SessionStartedData) => {
      console.log('Session started notification:', data);
      this.notifySessionStartedListeners(data);
    });

    // Booking status changed
    this.socket.on('booking_status_changed', (data: BookingStatusData) => {
      console.log('Booking status changed:', data);
      this.notifyBookingStatusListeners(data);
    });
  }

  // Join a chat room
  joinRoom(roomId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('join_room', roomId);
      console.log('Joined room:', roomId);
    } else {
      console.warn('Socket not connected, cannot join room');
    }
  }

  // Leave a chat room
  leaveRoom(roomId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('leave_room', roomId);
      console.log('Left room:', roomId);
    } else {
      console.warn('Socket not connected, cannot leave room');
    }
  }

  // Send a message
  sendMessage(roomId: string, content: string, type: 'text' | 'image' | 'file' = 'text'): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('send_message', { roomId, content, type });
      console.log('Message sent:', { roomId, content, type });
    } else {
      console.warn('Socket not connected, cannot send message');
    }
  }

  // Start typing indicator
  startTyping(roomId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('typing_start', roomId);
    }
  }

  // Stop typing indicator
  stopTyping(roomId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('typing_stop', roomId);
    }
  }

  // Mark message as read
  markMessageAsRead(roomId: string, messageId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('mark_read', { roomId, messageId });
    }
  }

  // Set online status
  setOnlineStatus(isOnline: boolean): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('set_online_status', isOnline);
    }
  }

  // Disconnect socket
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      console.log('Socket.IO disconnected');
    }
  }

  // Check if connected
  getConnected(): boolean {
    return this.isConnected;
  }

  // Event listener management
  onMessage(callback: (message: ChatMessage) => void): () => void {
    this.messageListeners.push(callback);
    return () => {
      this.messageListeners = this.messageListeners.filter(cb => cb !== callback);
    };
  }

  onTyping(callback: (typing: TypingIndicator) => void): () => void {
    this.typingListeners.push(callback);
    return () => {
      this.typingListeners = this.typingListeners.filter(cb => cb !== callback);
    };
  }

  onStatusChange(callback: (status: UserStatus) => void): () => void {
    this.statusListeners.push(callback);
    return () => {
      this.statusListeners = this.statusListeners.filter(cb => cb !== callback);
    };
  }

  onReadReceipt(callback: (receipt: MessageReadReceipt) => void): () => void {
    this.readReceiptListeners.push(callback);
    return () => {
      this.readReceiptListeners = this.readReceiptListeners.filter(cb => cb !== callback);
    };
  }

  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.push(callback);
    return () => {
      this.connectionListeners = this.connectionListeners.filter(cb => cb !== callback);
    };
  }

  onSessionStarted(callback: (data: SessionStartedData) => void): () => void {
    this.sessionStartedListeners.push(callback);
    return () => {
      this.sessionStartedListeners = this.sessionStartedListeners.filter(cb => cb !== callback);
    };
  }

  onBookingStatusChanged(callback: (data: BookingStatusData) => void): () => void {
    this.bookingStatusListeners.push(callback);
    return () => {
      this.bookingStatusListeners = this.bookingStatusListeners.filter(cb => cb !== callback);
    };
  }

  // Notify listeners
  private notifyMessageListeners(message: ChatMessage): void {
    this.messageListeners.forEach(callback => callback(message));
  }

  private notifyTypingListeners(typing: TypingIndicator): void {
    this.typingListeners.forEach(callback => callback(typing));
  }

  private notifyStatusListeners(status: UserStatus): void {
    this.statusListeners.forEach(callback => callback(status));
  }

  private notifyReadReceiptListeners(receipt: MessageReadReceipt): void {
    this.readReceiptListeners.forEach(callback => callback(receipt));
  }

  private notifyConnectionListeners(connected: boolean): void {
    this.connectionListeners.forEach(callback => callback(connected));
  }

  private notifySessionStartedListeners(data: SessionStartedData): void {
    this.sessionStartedListeners.forEach(callback => callback(data));
  }

  private notifyBookingStatusListeners(data: BookingStatusData): void {
    this.bookingStatusListeners.forEach(callback => callback(data));
  }
}

// Export singleton instance
export const socketService = new SocketService();
