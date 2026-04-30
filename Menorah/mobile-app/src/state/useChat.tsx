import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { socketService, ChatMessage, TypingIndicator, UserStatus, MessageReadReceipt, SessionStartedData, BookingStatusData } from '@/lib/socket';
import { api, ChatRoom, Message } from '@/lib/api';
import { useAuth } from './useAuth';

interface ChatContextType {
  // Chat rooms
  chatRooms: ChatRoom[];
  loadingRooms: boolean;
  fetchChatRooms: () => Promise<void>;
  
  // Messages
  messages: { [roomId: string]: ChatMessage[] };
  loadingMessages: boolean;
  fetchMessages: (roomId: string) => Promise<void>;
  sendMessage: (roomId: string, content: string) => Promise<void>;
  
  // Real-time features
  typingUsers: { [roomId: string]: TypingIndicator[] };
  onlineUsers: { [userId: string]: UserStatus };
  roomPresence: { [roomId: string]: { [userId: string]: boolean } };
  isConnected: boolean;
  
  // Room management
  currentRoom: string | null;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  
  // Typing indicators
  startTyping: (roomId: string) => void;
  stopTyping: (roomId: string) => void;
  
  // Message actions
  markMessageAsRead: (roomId: string, messageId: string) => void;
  deleteMessage: (roomId: string, messageId: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

interface ChatProviderProps {
  children: React.ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const { user } = useAuth();

  // State
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<{ [roomId: string]: ChatMessage[] }>({});
  const [typingUsers, setTypingUsers] = useState<{ [roomId: string]: TypingIndicator[] }>({});
  const [onlineUsers, setOnlineUsers] = useState<{ [userId: string]: UserStatus }>({});
  const [roomPresence, setRoomPresence] = useState<{ [roomId: string]: { [userId: string]: boolean } }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);

  // Loading states
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Typing timeout refs
  const typingTimeouts = React.useRef<{ [roomId: string]: NodeJS.Timeout }>({});
  // Ref so connection callbacks always see the latest currentRoom without re-registering
  const currentRoomRef = React.useRef<string | null>(null);

  // Keep currentRoomRef in sync with currentRoom state
  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  // Initialize socket connection
  useEffect(() => {
    if (user) {
      initializeSocket();
    }

    return () => {
      socketService.disconnect();
    };
  }, [user]);

  const initializeSocket = async () => {
    try {
      console.log('Initializing Socket.IO connection...');
      await socketService.connect();

      // Socket is now connected — sync state and join any room that was requested
      // before the connection was ready (common when ChatThread mounts first)
      setIsConnected(true);
      if (currentRoomRef.current) {
        socketService.joinRoom(currentRoomRef.current);
      }

      // Set up event listeners
      const unsubscribeMessage = socketService.onMessage(handleNewMessage);
      const unsubscribeTyping = socketService.onTyping(handleTyping);
      const unsubscribeStatus = socketService.onStatusChange(handleStatusChange);
      const unsubscribeReadReceipt = socketService.onReadReceipt(handleReadReceipt);
      const unsubscribeConnection = socketService.onConnectionChange(handleConnectionChange);
      const unsubscribeSessionStarted = socketService.onSessionStarted(handleSessionStarted);
      const unsubscribeBookingStatus = socketService.onBookingStatusChanged(handleBookingStatus);

      console.log('Socket.IO event listeners set up successfully');

      return () => {
        unsubscribeMessage();
        unsubscribeTyping();
        unsubscribeStatus();
        unsubscribeReadReceipt();
        unsubscribeConnection();
        unsubscribeSessionStarted();
        unsubscribeBookingStatus();
      };
    } catch (error) {
      console.error('Failed to initialize socket:', error);
      // Don't throw error, let the app continue without real-time features
      setIsConnected(false);
    }
  };

  // Event handlers
  const handleNewMessage = useCallback((message: ChatMessage) => {
    if (!message.roomId) {
      console.warn('Received message without roomId:', message);
      return;
    }
    
    setMessages(prev => {
      const roomMessages = prev[message.roomId] || [];
      // Check if message already exists to prevent duplicates
      const exists = roomMessages.find(m => m.id === message.id);
      if (exists) {
        // Update existing message instead of adding duplicate
        return {
          ...prev,
          [message.roomId]: roomMessages.map(m => m.id === message.id ? message : m)
        };
      }
      // Add new message and sort by timestamp
      const updatedMessages = [...roomMessages, message].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      return {
        ...prev,
        [message.roomId]: updatedMessages
      };
    });
  }, []);

  const handleTyping = useCallback((typing: TypingIndicator) => {
    if (!typing.roomId) {
      console.warn('Received typing indicator without roomId:', typing);
      return;
    }
    // Ignore own typing events
    if (user && typing.userId === user.id) return;

    setTypingUsers(prev => {
      const roomTyping = prev[typing.roomId] || [];
      const filtered = roomTyping.filter(t => t.userId !== typing.userId);
      
      if (typing.isTyping) {
        return {
          ...prev,
          [typing.roomId]: [...filtered, typing]
        };
      } else {
        return {
          ...prev,
          [typing.roomId]: filtered
        };
      }
    });
  }, []);

  const handleStatusChange = useCallback((status: UserStatus) => {
    setOnlineUsers(prev => ({
      ...prev,
      [status.userId]: status
    }));
    
    // Update room presence if roomId is provided
    if (status.roomId) {
      setRoomPresence(prev => ({
        ...prev,
        [status.roomId]: {
          ...(prev[status.roomId] || {}),
          [status.userId]: status.isOnline
        }
      }));
    }
  }, []);

  const handleReadReceipt = useCallback((receipt: MessageReadReceipt) => {
    setMessages(prev => {
      const roomMessages = prev[receipt.roomId] || [];
      return {
        ...prev,
        [receipt.roomId]: roomMessages.map(msg => 
          msg.id === receipt.messageId 
            ? { ...msg, status: 'read' as const }
            : msg
        )
      };
    });
  }, []);

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsConnected(connected);
    // Re-join the active room after any reconnect so incoming messages resume
    if (connected && currentRoomRef.current) {
      socketService.joinRoom(currentRoomRef.current);
    }
  }, []);

  const handleSessionStarted = useCallback((data: SessionStartedData) => {
    // This will be handled by SessionNotificationHandler component
    // We can also update local state if needed
    console.log('Session started:', data);
  }, []);

  const handleBookingStatus = useCallback((data: BookingStatusData) => {
    // Handle booking status changes
    console.log('Booking status changed:', data);
  }, []);

  // Chat room management
  const fetchChatRooms = useCallback(async () => {
    if (!user) return;
    
    setLoadingRooms(true);
    try {
      const response = await api.getChatRooms();
      if (response.success && response.data) {
        // Ensure all chat rooms have proper counsellorName
        const rooms = (response.data.chatRooms || []).map((room: ChatRoom) => {
          // Check if counsellorName is undefined, null, or the string "undefined undefined"
          let counsellorName = room.counsellorName;
          if (!counsellorName || counsellorName === 'undefined undefined' || counsellorName.trim() === '') {
            counsellorName = 'Counsellor';
          }
          return {
            ...room,
            counsellorName: counsellorName,
            counsellorImage: room.counsellorImage || null
          };
        });
        setChatRooms(rooms);
      }
    } catch (error) {
      console.error('Failed to fetch chat rooms:', error);
    } finally {
      setLoadingRooms(false);
    }
  }, [user]);

  // Message management
  const fetchMessages = useCallback(async (roomId: string) => {
    if (!user) return;
    
    setLoadingMessages(true);
    try {
      const response = await api.getMessages(roomId);
      if (response.success && response.data) {
        const msgs = response.data.messages || [];
        // Map API messages to ChatMessage format
        const mappedMessages: ChatMessage[] = msgs.map((msg: any) => ({
          id: msg.id || msg._id,
          senderId: msg.senderId || msg.sender?._id || msg.sender,
          senderName: msg.senderName || `${msg.sender?.firstName || ''} ${msg.sender?.lastName || ''}`.trim() || 'User',
          senderImage: msg.senderImage || msg.sender?.profileImage || null,
          content: msg.content || '',
          timestamp: msg.timestamp || msg.createdAt || new Date().toISOString(),
          type: msg.type || 'text',
          status: msg.status || 'sent',
          roomId: roomId
        }));
        // Remove duplicates by ID
        const uniqueMessages = mappedMessages.reduce((acc: ChatMessage[], msg: ChatMessage) => {
          if (!acc.find(m => m.id === msg.id)) {
            acc.push(msg);
          }
          return acc;
        }, []);
        // Sort by timestamp
        uniqueMessages.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setMessages(prev => ({
          ...prev,
          [roomId]: uniqueMessages
        }));
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  }, [user]);

  const sendMessage = useCallback(async (roomId: string, content: string) => {
    if (!user || !content.trim()) return;
    
    try {
      // Send via REST API for persistence (works even without Socket.IO)
      const response = await api.sendMessage(roomId, content);
      
      if (response.success && response.data) {
        const msg = response.data.message;
        // Map API message to ChatMessage format
        const newMessage: ChatMessage = {
          id: msg.id || msg._id,
          senderId: msg.senderId || msg.sender?._id || msg.sender,
          senderName: msg.senderName || `${msg.sender?.firstName || ''} ${msg.sender?.lastName || ''}`.trim() || 'User',
          senderImage: msg.senderImage || msg.sender?.profileImage || null,
          content: msg.content || '',
          timestamp: msg.timestamp || msg.createdAt || new Date().toISOString(),
          type: msg.type || 'text',
          status: msg.status || 'sent',
          roomId: roomId
        };
        // Add message optimistically
        setMessages(prev => {
          const roomMessages = prev[roomId] || [];
          // Check if message already exists to prevent duplicates
          const exists = roomMessages.find(m => m.id === newMessage.id);
          if (exists) {
            return prev; // Don't add duplicate
          }
          return {
            ...prev,
            [roomId]: [...roomMessages, newMessage]
          };
        });
      }
      
      // REST API already emits new_message via Socket.IO on the server side,
      // so no need to emit separately via socketService here.
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }, [user, isConnected]);

  const deleteMessage = useCallback(async (roomId: string, messageId: string) => {
    if (!user) return;
    
    try {
      await api.deleteMessage(roomId, messageId);
      
      // Remove from local state
      setMessages(prev => {
        const roomMessages = prev[roomId] || [];
        return {
          ...prev,
          [roomId]: roomMessages.filter(msg => msg.id !== messageId)
        };
      });
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  }, [user]);

  // Room management
  const joinRoom = useCallback((roomId: string) => {
    socketService.joinRoom(roomId);
    setCurrentRoom(roomId);
    
    // Fetch messages if not already loaded
    if (!messages[roomId]) {
      fetchMessages(roomId);
    }
  }, [messages, fetchMessages]);

  const leaveRoom = useCallback((roomId: string) => {
    socketService.leaveRoom(roomId);
    setCurrentRoom(null);
  }, []);

  // Typing indicators
  const startTyping = useCallback((roomId: string) => {
    socketService.startTyping(roomId);
    
    // Clear existing timeout
    if (typingTimeouts.current[roomId]) {
      clearTimeout(typingTimeouts.current[roomId]);
    }
  }, []);

  const stopTyping = useCallback((roomId: string) => {
    socketService.stopTyping(roomId);
    
    // Clear timeout
    if (typingTimeouts.current[roomId]) {
      clearTimeout(typingTimeouts.current[roomId]);
      delete typingTimeouts.current[roomId];
    }
  }, []);

  // Mark message as read
  const markMessageAsRead = useCallback((roomId: string, messageId: string) => {
    socketService.markMessageAsRead(roomId, messageId);
    
    // Update local state
    setMessages(prev => {
      const roomMessages = prev[roomId] || [];
      return {
        ...prev,
        [roomId]: roomMessages.map(msg => 
          msg.id === messageId 
            ? { ...msg, status: 'read' as const }
            : msg
        )
      };
    });
  }, []);

  // Auto-stop typing after delay
  const handleTypingWithTimeout = useCallback((roomId: string) => {
    startTyping(roomId);
    
    // Clear existing timeout
    if (typingTimeouts.current[roomId]) {
      clearTimeout(typingTimeouts.current[roomId]);
    }
    
    // Set new timeout
    typingTimeouts.current[roomId] = setTimeout(() => {
      stopTyping(roomId);
    }, 3000);
  }, [startTyping, stopTyping]);

  const value: ChatContextType = {
    // Chat rooms
    chatRooms,
    loadingRooms,
    fetchChatRooms,
    
    // Messages
    messages,
    loadingMessages,
    fetchMessages,
    sendMessage,
    
    // Real-time features
    typingUsers,
    onlineUsers,
    roomPresence,
    isConnected,
    
    // Room management
    currentRoom,
    joinRoom,
    leaveRoom,
    
    // Typing indicators
    startTyping: handleTypingWithTimeout,
    stopTyping,
    
    // Message actions
    markMessageAsRead,
    deleteMessage,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};
