import { io, Socket } from 'socket.io-client';
import { authStorage } from './auth';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  const token = authStorage.getToken();
  if (!token) {
    // No token — return a disconnected socket placeholder rather than
    // firing an unauthenticated connection that will always fail.
    if (socket) return socket;
  }

  const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

  // Use polling-first so that the WebSocket upgrade is a graceful upgrade
  // instead of throwing a "websocket error" on environments where the WS
  // upgrade is blocked (e.g. some proxies / Windows dev setups).
  socket = io(url, {
    auth: { token },
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
    // Only warn — this is expected when the backend is not running locally.
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

// ─── Chat helpers ─────────────────────────────────────────────────────────────
export const socketEvents = {
  JOIN_ROOM:          'join_room',
  LEAVE_ROOM:         'leave_room',
  SEND_MESSAGE:       'send_message',
  NEW_MESSAGE:        'new_message',
  TYPING_START:       'typing_start',
  TYPING_STOP:        'typing_stop',
  USER_TYPING:        'user_typing',
  MARK_READ:          'mark_read',
  MESSAGE_READ:       'message_read',
  MESSAGE_DELIVERED:  'message_delivered',
  SET_ONLINE_STATUS:  'set_online_status',
  USER_STATUS_CHANGED:'user_status_changed',
  // Booking notifications
  NEW_BOOKING:        'new_booking_available',
  BOOKING_ASSIGNED:   'booking_assigned',
  BOOKING_SCHEDULED:  'booking_scheduled',
  BOOKING_STATUS:     'booking_status_changed',
} as const;
