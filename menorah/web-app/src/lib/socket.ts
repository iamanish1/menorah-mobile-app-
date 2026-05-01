import { io, Socket } from 'socket.io-client';

class SocketClient {
  private socket: Socket | null = null;
  private socketURL: string;

  constructor() {
    // Get socket URL from environment or derive from API URL
    const apiURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    // Remove /api suffix if present and use as base URL for Socket.IO
    this.socketURL = process.env.NEXT_PUBLIC_SOCKET_URL || apiURL.replace('/api', '');
    console.log('Socket.IO connecting to:', this.socketURL);
  }

  connect(token: string): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    // Disconnect existing socket if any
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(this.socketURL, {
      auth: {
        token,
      },
      transports: ['polling', 'websocket'], // Try polling first, then websocket
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 20000,
      forceNew: true,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      console.error('Socket URL:', this.socketURL);
      console.error('Error details:', {
        message: error.message,
        type: error.type,
        description: error.description
      });
      // Don't show error to user, just log it
      // The socket will automatically retry with polling
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Socket reconnection attempt ${attemptNumber}`);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`Socket reconnected after ${attemptNumber} attempts`);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('Socket reconnection error:', error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('Socket reconnection failed after all attempts');
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  on(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  emit(event: string, data: any): void {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const socketClient = new SocketClient();

