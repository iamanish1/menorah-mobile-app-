import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  const apiURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
  const url = process.env.NEXT_PUBLIC_SOCKET_URL || apiURL.replace(/\/api\/?$/, '');

  socket = io(url, {
    withCredentials: true,
    transports: ['polling', 'websocket'],
    reconnectionAttempts: 3,
    reconnectionDelay: 2000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error (backend may be offline):', err.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export const socketEvents = {
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  SEND_MESSAGE: 'send_message',
  NEW_MESSAGE: 'new_message',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  USER_TYPING: 'user_typing',
  MARK_READ: 'mark_read',
  MESSAGE_READ: 'message_read',
  MESSAGE_DELIVERED: 'message_delivered',
  SET_ONLINE_STATUS: 'set_online_status',
  USER_STATUS_CHANGED: 'user_status_changed',
  NEW_BOOKING: 'new_booking_available',
  BOOKING_ASSIGNED: 'booking_assigned',
  BOOKING_SCHEDULED: 'booking_scheduled',
  BOOKING_STATUS: 'booking_status_changed',
  COUNSELLOR_PROFILE_UPDATED: 'counsellor_profile_updated',
} as const;
