import React, { createContext, useContext, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import {
  socketService,
  ChatMessage,
  TypingIndicator,
  UserStatus,
  MessageReadReceipt,
  MessageDeletedData,
} from '@/lib/socket';
import { api, ChatRoom, Message as ApiMessage } from '@/lib/api';
import { reportError, reportEvent } from '@/lib/safeDiagnostics';
import { useAuth } from './useAuth';
import { mergeChatMessages } from '@/lib/chatMessages';

interface ChatContextType {
  // Chat rooms
  chatRooms: ChatRoom[];
  loadingRooms: boolean;
  fetchChatRooms: () => Promise<void>;
  
  // Messages
  messages: { [roomId: string]: ChatMessage[] };
  messagePagination: { [roomId: string]: MessagePagination };
  loadingMessages: boolean;
  fetchMessages: (roomId: string, options?: FetchMessagesOptions) => Promise<void>;
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

interface AccountScope {
  userId: string;
  generation: number;
}

interface MessagePagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface FetchMessagesOptions {
  page?: number;
  limit?: number;
}

function mapApiMessage(message: ApiMessage, roomId: string): ChatMessage {
  const sender = typeof message.sender === 'object' && message.sender !== null
    ? message.sender
    : undefined;

  return {
    id: message.id || message._id || `${roomId}-${message.timestamp}`,
    senderId: message.senderId || sender?._id || (typeof message.sender === 'string' ? message.sender : ''),
    senderName: message.senderName
      || `${sender?.firstName || ''} ${sender?.lastName || ''}`.trim()
      || 'User',
    senderImage: message.senderImage || sender?.profileImage || null,
    content: message.content || '',
    timestamp: message.timestamp || message.createdAt || new Date().toISOString(),
    type: message.type || 'text',
    status: message.status || 'sent',
    roomId,
  };
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const renderedUserId = user?.id ?? null;
  const activeUserIdRef = React.useRef<string | null>(renderedUserId);
  const accountGenerationRef = React.useRef(0);

  // Advance during render so a response cannot land between an identity-
  // changing render and its layout-effect cleanup.
  if (activeUserIdRef.current !== renderedUserId) {
    activeUserIdRef.current = renderedUserId;
    accountGenerationRef.current += 1;
  }

  const captureAccountScope = useCallback((): AccountScope | null => {
    const userId = activeUserIdRef.current;
    return userId
      ? { userId, generation: accountGenerationRef.current }
      : null;
  }, []);

  const isAccountScopeActive = useCallback((scope: AccountScope | null) => (
    scope !== null &&
    activeUserIdRef.current === scope.userId &&
    accountGenerationRef.current === scope.generation
  ), []);

  // State
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<{ [roomId: string]: ChatMessage[] }>({});
  const [messagePagination, setMessagePagination] = useState<{ [roomId: string]: MessagePagination }>({});
  const [typingUsers, setTypingUsers] = useState<{ [roomId: string]: TypingIndicator[] }>({});
  const [onlineUsers, setOnlineUsers] = useState<{ [userId: string]: UserStatus }>({});
  const [roomPresence, setRoomPresence] = useState<{ [roomId: string]: { [userId: string]: boolean } }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);

  // Loading states
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Typing timeout refs
  const typingTimeouts = React.useRef<{ [roomId: string]: ReturnType<typeof setTimeout> }>({});
  // Ref so connection callbacks always see the latest currentRoom without re-registering
  const currentRoomRef = React.useRef<string | null>(null);

  const clearTypingTimeouts = useCallback(() => {
    Object.values(typingTimeouts.current).forEach(clearTimeout);
    typingTimeouts.current = {};
  }, []);

  const resetSensitiveChatState = useCallback(() => {
    clearTypingTimeouts();
    currentRoomRef.current = null;
    setChatRooms([]);
    setMessages({});
    setMessagePagination({});
    setTypingUsers({});
    setOnlineUsers({});
    setRoomPresence({});
    setIsConnected(false);
    setCurrentRoom(null);
    setLoadingRooms(false);
    setLoadingMessages(false);
  }, [clearTypingTimeouts]);

  // Clear before paint and before the normal socket connection effect runs.
  // App.tsx also keys the provider subtree by user ID for synchronous isolation.
  useLayoutEffect(() => {
    resetSensitiveChatState();
    return () => {
      clearTypingTimeouts();
      currentRoomRef.current = null;
    };
  }, [clearTypingTimeouts, resetSensitiveChatState, user?.id]);

  // Keep currentRoomRef in sync with currentRoom state
  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  // Event handlers
  const handleNewMessage = useCallback((message: ChatMessage) => {
    const roomId = message.roomId;
    if (!roomId) {
      reportError('chat.message_missing_room');
      return;
    }
    
    const isOwnMessage = message.senderId === activeUserIdRef.current;
    const isActiveRoom = currentRoomRef.current === roomId;

    setMessages(prev => {
      const updatedMessages = mergeChatMessages(prev[roomId] || [], [message]);
      return {
        ...prev,
        [roomId]: updatedMessages
      };
    });

    setChatRooms((previousRooms) => {
      const roomIndex = previousRooms.findIndex((room) => room.id === roomId);
      if (roomIndex === -1) return previousRooms;

      const room = previousRooms[roomIndex];
      const updatedRoom: ChatRoom = {
        ...room,
        lastMessage: message.content,
        lastMessageTime: message.timestamp,
        lastMessageSenderId: message.senderId,
        unreadCount: isOwnMessage || isActiveRoom ? 0 : (room.unreadCount || 0) + 1,
      };

      return [updatedRoom, ...previousRooms.filter((_, index) => index !== roomIndex)];
    });

    if (isActiveRoom && !isOwnMessage) {
      socketService.markMessageAsRead(roomId, message.id);
    }
  }, []);

  const handleMessageDeleted = useCallback((data: MessageDeletedData) => {
    setMessages((previousMessages) => ({
      ...previousMessages,
      [data.roomId]: (previousMessages[data.roomId] || []).filter(
        (message) => message.id !== data.messageId
      ),
    }));
  }, []);

  const handleTyping = useCallback((typing: TypingIndicator) => {
    const roomId = typing.roomId;
    if (!roomId) {
      reportError('chat.typing_missing_room');
      return;
    }
    // Ignore own typing events
    if (user?.id && typing.userId === user.id) return;

    setTypingUsers(prev => {
      const roomTyping = prev[roomId] || [];
      const filtered = roomTyping.filter((t: TypingIndicator) => t.userId !== typing.userId);
      
      if (typing.isTyping) {
        return {
          ...prev,
          [roomId]: [...filtered, typing]
        };
      } else {
        return {
          ...prev,
          [roomId]: filtered
        };
      }
    });
  }, [user?.id]);

  const handleStatusChange = useCallback((status: UserStatus) => {
    setOnlineUsers(prev => ({
      ...prev,
      [status.userId]: status
    }));
    
    // Update room presence if roomId is provided
    const roomId = status.roomId;
    if (roomId) {
      setRoomPresence(prev => ({
        ...prev,
        [roomId]: {
          ...(prev[roomId] || {}),
          [status.userId]: status.isOnline
        }
      }));
    }
  }, []);

  const handleReadReceipt = useCallback((receipt: MessageReadReceipt) => {
    const roomId = receipt.roomId;
    if (!roomId) {
      reportError('chat.receipt_missing_room');
      return;
    }

    setMessages(prev => {
      const roomMessages = prev[roomId] || [];
      return {
        ...prev,
        [roomId]: roomMessages.map((msg: ChatMessage) =>
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

  const initializeSocket = useCallback(async () => {
    const scope = captureAccountScope();
    if (!scope) return;

    try {
      reportEvent('chat.socket_initializing');
      await socketService.connect();
      if (!isAccountScopeActive(scope)) return;

      // Socket is now connected — sync state and join any room that was requested
      // before the connection was ready (common when ChatThread mounts first)
      setIsConnected(true);
      if (currentRoomRef.current) {
        socketService.joinRoom(currentRoomRef.current);
      }

      // Set up event listeners
      const whenActive = <T,>(handler: (value: T) => void) => (value: T) => {
        if (isAccountScopeActive(scope)) handler(value);
      };
      const unsubscribeMessage = socketService.onMessage(whenActive(handleNewMessage));
      const unsubscribeTyping = socketService.onTyping(whenActive(handleTyping));
      const unsubscribeStatus = socketService.onStatusChange(whenActive(handleStatusChange));
      const unsubscribeReadReceipt = socketService.onReadReceipt(whenActive(handleReadReceipt));
      const unsubscribeMessageDeleted = socketService.onMessageDeleted(whenActive(handleMessageDeleted));
      const unsubscribeConnection = socketService.onConnectionChange(whenActive(handleConnectionChange));
      reportEvent('chat.socket_listeners_ready');

      return () => {
        unsubscribeMessage();
        unsubscribeTyping();
        unsubscribeStatus();
        unsubscribeReadReceipt();
        unsubscribeMessageDeleted();
        unsubscribeConnection();
      };
    } catch (error) {
      reportError('chat.socket_initialization_failed', error);
      // Don't throw error, let the app continue without real-time features
      if (isAccountScopeActive(scope)) setIsConnected(false);
    }
  }, [
    captureAccountScope,
    handleConnectionChange,
    handleNewMessage,
    handleMessageDeleted,
    handleReadReceipt,
    handleStatusChange,
    handleTyping,
    isAccountScopeActive,
  ]);

  // Initialize socket connection
  useEffect(() => {
    let cancelled = false;
    let cleanupListeners: (() => void) | undefined;

    if (renderedUserId) {
      initializeSocket().then((cleanup) => {
        if (cancelled) {
          if (cleanup) cleanup();
          return;
        }
        if (cleanup) cleanupListeners = cleanup;
      });
    }

    return () => {
      cancelled = true;
      cleanupListeners?.();
      socketService.disconnect();
    };
  }, [initializeSocket, renderedUserId]);

  // Chat room management
  const fetchChatRooms = useCallback(async () => {
    const scope = captureAccountScope();
    if (!scope) return;
    
    setLoadingRooms(true);
    try {
      const response = await api.getChatRooms();
      if (isAccountScopeActive(scope) && response.success && response.data) {
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
      if (isAccountScopeActive(scope)) reportError('chat.rooms_fetch_failed', error);
    } finally {
      if (isAccountScopeActive(scope)) setLoadingRooms(false);
    }
  }, [captureAccountScope, isAccountScopeActive]);

  // Message management
  const fetchMessages = useCallback(async (
    roomId: string,
    { page = 1, limit = 30 }: FetchMessagesOptions = {}
  ) => {
    const scope = captureAccountScope();
    if (!scope) return;

    if (page === 1) setLoadingMessages(true);
    try {
      const response = await api.getMessages(roomId, { page, limit });
      if (isAccountScopeActive(scope) && response.success && response.data) {
        const mappedMessages = (response.data.messages || []).map(
          (message) => mapApiMessage(message, roomId)
        );
        setMessages(prev => ({
          ...prev,
          [roomId]: mergeChatMessages(prev[roomId] || [], mappedMessages),
        }));
        setMessagePagination((previousPagination) => ({
          ...previousPagination,
          [roomId]: response.data!.pagination,
        }));
        setChatRooms((previousRooms) => previousRooms.map((room) =>
          room.id === roomId ? { ...room, unreadCount: 0 } : room
        ));
      }
    } catch (error) {
      if (isAccountScopeActive(scope)) reportError('chat.messages_fetch_failed', error);
    } finally {
      if (page === 1 && isAccountScopeActive(scope)) setLoadingMessages(false);
    }
  }, [captureAccountScope, isAccountScopeActive]);

  const sendMessage = useCallback(async (roomId: string, content: string) => {
    const scope = captureAccountScope();
    if (!scope || !content.trim()) return;
    
    try {
      // Send via REST API for persistence (works even without Socket.IO)
      const response = await api.sendMessage(roomId, content);
      
      if (isAccountScopeActive(scope) && response.success && response.data) {
        const msg = response.data.message;
        const sender = typeof msg.sender === 'object' && msg.sender !== null ? msg.sender : undefined;
        const senderId = msg.senderId || sender?._id || (typeof msg.sender === 'string' ? msg.sender : undefined) || scope.userId;
        // Map API message to ChatMessage format
        const newMessage: ChatMessage = {
          id: msg.id || msg._id || `${roomId}-${Date.now()}`,
          senderId,
          senderName: msg.senderName || `${sender?.firstName || ''} ${sender?.lastName || ''}`.trim() || 'User',
          senderImage: msg.senderImage || sender?.profileImage || null,
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
      if (isAccountScopeActive(scope)) {
        reportError('chat.message_send_failed', error);
        throw error;
      }
    }
  }, [captureAccountScope, isAccountScopeActive]);

  const deleteMessage = useCallback(async (roomId: string, messageId: string) => {
    const scope = captureAccountScope();
    if (!scope) return;
    
    try {
      await api.deleteMessage(roomId, messageId);
      if (!isAccountScopeActive(scope)) return;
      
      // Remove from local state
      setMessages(prev => {
        const roomMessages = prev[roomId] || [];
        return {
          ...prev,
          [roomId]: roomMessages.filter(msg => msg.id !== messageId)
        };
      });
    } catch (error) {
      if (isAccountScopeActive(scope)) reportError('chat.message_delete_failed', error);
    }
  }, [captureAccountScope, isAccountScopeActive]);

  // Room management
  const joinRoom = useCallback((roomId: string) => {
    setCurrentRoom(roomId);
    currentRoomRef.current = roomId;
    socketService.joinRoom(roomId);
  }, []);

  const leaveRoom = useCallback((roomId: string) => {
    socketService.leaveRoom(roomId);
    if (currentRoomRef.current === roomId) currentRoomRef.current = null;
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
    messagePagination,
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
