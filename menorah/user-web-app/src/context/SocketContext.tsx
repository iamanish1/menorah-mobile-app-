'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, socketEvents } from '@/lib/socket';
import { useAuth } from './AuthContext';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  sendMessage: (roomId: string, content: string, type?: string) => void;
  startTyping: (roomId: string) => void;
  stopTyping: (roomId: string) => void;
  markRead: (roomId: string, messageId: string) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { isAuthed, isLoading } = useAuth();
  const [socket, setSocket]           = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef      = useRef<Socket | null>(null);

  useEffect(() => {
    // Wait until auth state is resolved before touching the socket.
    // Without this guard, the socket would attempt to connect (and fail)
    // during the brief window when isLoading=true and isAuthed=false.
    if (isLoading) return;

    if (!isAuthed) {
      disconnectSocket();
      setSocket(null);
      socketRef.current = null;
      setIsConnected(false);
      return;
    }

    const s = connectSocket();
    socketRef.current = s;
    setSocket(s);

    const onConnect    = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    s.on('connect',    onConnect);
    s.on('disconnect', onDisconnect);

    if (s.connected) setIsConnected(true);

    return () => {
      s.off('connect',    onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, [isAuthed, isLoading]);

  const joinRoom = useCallback((roomId: string) => {
    socketRef.current?.emit(socketEvents.JOIN_ROOM, roomId);
  }, []);

  const leaveRoom = useCallback((roomId: string) => {
    socketRef.current?.emit(socketEvents.LEAVE_ROOM, roomId);
  }, []);

  const sendMessage = useCallback((roomId: string, content: string, type = 'text') => {
    socketRef.current?.emit(socketEvents.SEND_MESSAGE, { roomId, content, type });
  }, []);

  const stopTyping = useCallback((roomId: string) => {
    socketRef.current?.emit(socketEvents.TYPING_STOP, roomId);
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  const startTyping = useCallback((roomId: string) => {
    socketRef.current?.emit(socketEvents.TYPING_START, roomId);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => stopTyping(roomId), 3000);
  }, [stopTyping]);

  const markRead = useCallback((roomId: string, messageId: string) => {
    socketRef.current?.emit(socketEvents.MARK_READ, { roomId, messageId });
  }, []);

  return (
    <SocketContext.Provider value={{
      socket, isConnected,
      joinRoom, leaveRoom, sendMessage,
      startTyping, stopTyping, markRead,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
