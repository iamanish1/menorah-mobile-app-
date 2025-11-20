'use client';

import { useEffect, useRef, useState } from 'react';
import { socketClient } from '@/lib/socket';

export function useSocket(token: string | null) {
  const socketRef = useRef<ReturnType<typeof socketClient.getSocket>>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      socketClient.disconnect();
      setIsConnected(false);
      return;
    }

    try {
      const socket = socketClient.connect(token);
      socketRef.current = socket;

      // Update connection status
      const updateConnectionStatus = () => {
        setIsConnected(socketClient.isConnected());
      };

      socket.on('connect', () => {
        console.log('Socket.IO connected successfully');
        updateConnectionStatus();
      });
      
      socket.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected:', reason);
        updateConnectionStatus();
      });
      
      socket.on('reconnect', (attemptNumber) => {
        console.log(`Socket.IO reconnected after ${attemptNumber} attempts`);
        updateConnectionStatus();
      });

      socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error in useSocket:', error);
        setIsConnected(false);
      });

      // Initial status check
      updateConnectionStatus();
    } catch (error) {
      console.error('Error setting up Socket.IO connection:', error);
      setIsConnected(false);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        socketRef.current.off('reconnect');
        socketRef.current.off('connect_error');
      }
      socketClient.disconnect();
      setIsConnected(false);
    };
  }, [token]);

  return {
    socket: socketRef.current,
    isConnected: isConnected,
    on: socketClient.on.bind(socketClient),
    off: socketClient.off.bind(socketClient),
    emit: socketClient.emit.bind(socketClient),
  };
}

