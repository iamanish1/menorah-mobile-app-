import { io, Socket } from 'socket.io-client';
import { secureStorage } from './secureStorage';
import { ENV } from './env';
import { reportError, reportEvent } from './safeDiagnostics';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderImage?: string | null;
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

export interface BookingConfirmedData {
  bookingId: string;
  counsellorName: string;
}

export interface BookingRescheduledData {
  bookingId: string;
  scheduledAt: string;
}

class SocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private connectionGeneration = 0;

  private isCurrentSocket(socket: Socket, generation: number): boolean {
    return this.socket === socket && this.connectionGeneration === generation;
  }

  // Event listeners
  private messageListeners: ((message: ChatMessage) => void)[] = [];
  private typingListeners: ((typing: TypingIndicator) => void)[] = [];
  private statusListeners: ((status: UserStatus) => void)[] = [];
  private readReceiptListeners: ((receipt: MessageReadReceipt) => void)[] = [];
  private connectionListeners: ((connected: boolean) => void)[] = [];
  private sessionStartedListeners: ((data: SessionStartedData) => void)[] = [];
  private bookingStatusListeners: ((data: BookingStatusData) => void)[] = [];
  private bookingConfirmedListeners: ((data: BookingConfirmedData) => void)[] = [];
  private bookingRescheduledListeners: ((data: BookingRescheduledData) => void)[] = [];

  // Initialize socket connection
  async connect(): Promise<void> {
    const generation = ++this.connectionGeneration;
    const previousSocket = this.socket;
    this.socket = null;
    this.isConnected = false;
    previousSocket?.disconnect();

    try {
      const token = await secureStorage.getToken();

      // Logout or a newer account connection superseded this attempt while
      // SecureStore was resolving. Never create a socket with the stale token.
      if (generation !== this.connectionGeneration) return;

      // Token is required — do not allow unauthenticated socket connections
      if (!token) {
        throw new Error('Authentication token required for socket connection');
      }

      // Socket.IO connects to the deployed origin (no /api prefix).
      const socketUrl = ENV.API_ORIGIN || ENV.API_BASE_URL?.replace(/\/api\/?$/, '') || 'https://api.menorah.me';

      const socket = io(socketUrl, {
        auth: { token },
        // polling first — React Native WebSocket upgrade is unreliable in Expo
        transports: ['polling', 'websocket'],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        forceNew: true,
        autoConnect: true,
      });
      this.socket = socket;

      this.setupEventListeners(socket, generation);
      
      return new Promise((resolve, reject) => {
        if (this.isCurrentSocket(socket, generation)) {
          socket.on('connect', () => {
            if (!this.isCurrentSocket(socket, generation)) return;
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.notifyConnectionListeners(true);
            resolve();
          });

          socket.on('connect_error', (error) => {
            if (!this.isCurrentSocket(socket, generation)) {
              resolve();
              return;
            }
            reportError('socket.connection_failed', error);
            this.isConnected = false;
            this.notifyConnectionListeners(false);
            
            // Don't reject immediately, let reconnection handle it
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
              reject(error);
            }
          });

          socket.on('disconnect', () => {
            if (!this.isCurrentSocket(socket, generation)) {
              resolve();
              return;
            }
            reportEvent('socket.disconnected');
            this.isConnected = false;
            this.notifyConnectionListeners(false);
          });

          socket.on('reconnect_attempt', (attemptNumber) => {
            if (!this.isCurrentSocket(socket, generation)) return;
            reportEvent('socket.reconnect_attempt');
            this.reconnectAttempts = attemptNumber;
          });

          socket.on('reconnect', () => {
            if (!this.isCurrentSocket(socket, generation)) return;
            reportEvent('socket.reconnected');
            this.isConnected = true;
            this.notifyConnectionListeners(true);
          });

          socket.on('reconnect_error', (error) => {
            if (!this.isCurrentSocket(socket, generation)) return;
            reportError('socket.reconnect_failed', error);
          });

          socket.on('reconnect_failed', () => {
            if (!this.isCurrentSocket(socket, generation)) {
              resolve();
              return;
            }
            reportError('socket.reconnect_exhausted');
            reject(new Error('Failed to reconnect to Socket.IO server'));
          });
        }
      });
    } catch (error) {
      reportError('socket.initialization_failed', error);
      throw error;
    }
  }

  // Setup socket event listeners
  private setupEventListeners(socket: Socket, generation: number): void {
    const isCurrent = () => this.isCurrentSocket(socket, generation);

    // New message received
    socket.on('new_message', (message: ChatMessage) => {
      if (!isCurrent()) return;
      reportEvent('socket.message_received');
      // Add roomId to message if not present
      const messageWithRoom = { ...message, roomId: message.roomId };
      this.notifyMessageListeners(messageWithRoom);
    });

    // Typing indicator
    socket.on('user_typing', (typing: TypingIndicator) => {
      if (!isCurrent()) return;
      reportEvent('socket.typing_received');
      // Add roomId to typing indicator if not present
      const typingWithRoom = { ...typing, roomId: typing.roomId };
      this.notifyTypingListeners(typingWithRoom);
    });

    // User status change
    socket.on('user_status_changed', (status: UserStatus) => {
      if (!isCurrent()) return;
      reportEvent('socket.status_received');
      this.notifyStatusListeners(status);
    });

    // Message read receipt
    socket.on('message_read', (receipt: MessageReadReceipt) => {
      if (!isCurrent()) return;
      reportEvent('socket.read_receipt_received');
      // Add roomId to receipt if not present
      const receiptWithRoom = { ...receipt, roomId: receipt.roomId };
      this.notifyReadReceiptListeners(receiptWithRoom);
    });

    // Message delivered confirmation
    socket.on('message_delivered', () => {
      if (!isCurrent()) return;
      reportEvent('socket.message_delivered');
      // You can update message status here
    });

    // User joined room
    socket.on('user_joined', (data: { userId: string; userName: string; roomId: string; timestamp: string }) => {
      if (!isCurrent()) return;
      reportEvent('socket.room_joined');
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
    socket.on('user_left', (data: { userId: string; userName: string; roomId: string; timestamp: string }) => {
      if (!isCurrent()) return;
      reportEvent('socket.room_left');
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
    socket.on('session_started', (data: SessionStartedData) => {
      if (!isCurrent()) return;
      reportEvent('socket.session_started');
      this.notifySessionStartedListeners(data);
    });

    // Booking status changed
    socket.on('booking_status_changed', (data: BookingStatusData) => {
      if (!isCurrent()) return;
      reportEvent('socket.booking_status_changed');
      this.notifyBookingStatusListeners(data);
    });

    // Booking confirmed by counsellor
    socket.on('booking_confirmed', (data: BookingConfirmedData) => {
      if (!isCurrent()) return;
      reportEvent('socket.booking_confirmed');
      this.notifyBookingConfirmedListeners(data);
    });

    // Booking rescheduled by counsellor
    socket.on('booking_rescheduled', (data: BookingRescheduledData) => {
      if (!isCurrent()) return;
      reportEvent('socket.booking_rescheduled');
      this.notifyBookingRescheduledListeners(data);
    });
  }

  // Join a chat room
  joinRoom(roomId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('join_room', roomId);
      reportEvent('socket.room_join_requested');
    } else {
      reportError('socket.room_join_while_disconnected');
    }
  }

  // Leave a chat room
  leaveRoom(roomId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('leave_room', roomId);
      reportEvent('socket.room_leave_requested');
    } else {
      reportError('socket.room_leave_while_disconnected');
    }
  }

  // Send a message
  sendMessage(roomId: string, content: string, type: 'text' | 'image' | 'file' = 'text'): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('send_message', { roomId, content, type });
      reportEvent('socket.message_sent');
    } else {
      reportError('socket.message_send_while_disconnected');
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
    this.connectionGeneration += 1;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      reportEvent('socket.disconnected_by_client');
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

  onBookingConfirmed(callback: (data: BookingConfirmedData) => void): () => void {
    this.bookingConfirmedListeners.push(callback);
    return () => {
      this.bookingConfirmedListeners = this.bookingConfirmedListeners.filter(cb => cb !== callback);
    };
  }

  onBookingRescheduled(callback: (data: BookingRescheduledData) => void): () => void {
    this.bookingRescheduledListeners.push(callback);
    return () => {
      this.bookingRescheduledListeners = this.bookingRescheduledListeners.filter(cb => cb !== callback);
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

  private notifyBookingConfirmedListeners(data: BookingConfirmedData): void {
    this.bookingConfirmedListeners.forEach(callback => callback(data));
  }

  private notifyBookingRescheduledListeners(data: BookingRescheduledData): void {
    this.bookingRescheduledListeners.forEach(callback => callback(data));
  }
}

// Export singleton instance
export const socketService = new SocketService();
