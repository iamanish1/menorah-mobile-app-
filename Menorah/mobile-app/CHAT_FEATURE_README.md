# Menorah Health - Real-time Chat Feature

## Overview

The Menorah Health mobile app now includes a fully functional real-time chat system built with Socket.IO. This feature allows users to communicate with their counsellors in real-time with features like typing indicators, read receipts, online status, and message delivery confirmations.

## Features

### ✅ Real-time Messaging
- Instant message delivery using Socket.IO
- Message status tracking (sent, delivered, read)
- Automatic reconnection handling
- Offline message queuing

### ✅ Typing Indicators
- Real-time typing indicators
- Auto-stop typing after 3 seconds of inactivity
- Support for multiple users typing simultaneously

### ✅ Read Receipts
- Visual indicators for message read status
- Automatic marking of messages as read when viewed
- Real-time read receipt updates

### ✅ Online Status
- Real-time online/offline status
- Visual indicators in chat list and chat thread
- Connection status display

### ✅ Message Management
- Message history with pagination
- Message deletion capability
- Message status tracking
- Auto-scroll to latest messages

### ✅ UI/UX Features
- Modern chat bubble design
- Smooth animations and transitions
- Pull-to-refresh functionality
- Keyboard-aware input handling
- Dark/light theme support

## Architecture

### Backend (Node.js + Socket.IO)

#### Server Setup (`src/server.js`)
```javascript
const { createServer } = require('http');
const { Server } = require('socket.io');

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true
  }
});
```

#### Socket.IO Events
- `join_room` - Join a chat room
- `leave_room` - Leave a chat room
- `send_message` - Send a message
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `mark_read` - Mark message as read
- `set_online_status` - Set online status

#### Authentication
- JWT-based authentication for Socket.IO connections
- Automatic token validation on connection
- User context attached to socket instance

### Frontend (React Native + Socket.IO Client)

#### Socket Service (`src/lib/socket.ts`)
```typescript
class SocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  
  async connect(): Promise<void> {
    // Initialize Socket.IO connection with authentication
  }
  
  sendMessage(roomId: string, content: string): void {
    // Send message via Socket.IO
  }
  
  // Event listeners and management
}
```

#### Chat Context (`src/state/useChat.tsx`)
```typescript
interface ChatContextType {
  // Chat rooms management
  chatRooms: ChatRoom[];
  fetchChatRooms: () => Promise<void>;
  
  // Messages management
  messages: { [roomId: string]: ChatMessage[] };
  sendMessage: (roomId: string, content: string) => Promise<void>;
  
  // Real-time features
  typingUsers: { [roomId: string]: TypingIndicator[] };
  onlineUsers: { [userId: string]: UserStatus };
  isConnected: boolean;
}
```

## Components

### ChatBubble (`src/components/chat/ChatBubble.tsx`)
- Reusable message bubble component
- Message status indicators
- Timestamp display
- Long press support for actions

### TypingIndicator (`src/components/chat/TypingIndicator.tsx`)
- Animated typing indicator
- Support for multiple users typing
- Avatar display

### ChatList (`src/screens/chat/ChatList.tsx`)
- List of chat rooms
- Online status indicators
- Last message preview
- Unread message count
- Pull-to-refresh functionality

### ChatThread (`src/screens/chat/ChatThread.tsx`)
- Real-time message display
- Message input with typing indicators
- Auto-scroll to latest messages
- Connection status display

## API Endpoints

### REST API (for persistence)
- `GET /api/chat/rooms` - Get user's chat rooms
- `GET /api/chat/rooms/:roomId/messages` - Get messages for a room
- `POST /api/chat/rooms/:roomId/messages` - Send a message
- `PUT /api/chat/rooms/:roomId/messages/:messageId/read` - Mark message as read
- `DELETE /api/chat/rooms/:roomId/messages/:messageId` - Delete a message
- `POST /api/chat/rooms/:roomId/typing` - Send typing indicator
- `GET /api/chat/online-status` - Get online status

### Socket.IO Events
- `new_message` - New message received
- `user_typing` - User typing indicator
- `user_status_changed` - User online status change
- `message_read` - Message read receipt
- `message_delivered` - Message delivery confirmation
- `user_joined` - User joined room
- `user_left` - User left room

## Installation & Setup

### Backend Dependencies
```bash
npm install socket.io
```

### Frontend Dependencies
```bash
npm install socket.io-client
```

### Environment Variables
```env
# Backend
JWT_SECRET=your_jwt_secret
CORS_ORIGIN=http://localhost:3000,http://localhost:19006

# Frontend
API_BASE_URL=https://app-api.menorahhealth.app/api
```

## Usage

### Basic Chat Implementation

```typescript
import { useChat } from '@/state/useChat';

function ChatComponent() {
  const { 
    messages, 
    sendMessage, 
    isConnected, 
    typingUsers 
  } = useChat();

  const handleSendMessage = async (content: string) => {
    await sendMessage('roomId', content);
  };

  return (
    // Chat UI implementation
  );
}
```

### Socket Service Usage

```typescript
import { socketService } from '@/lib/socket';

// Connect to Socket.IO
await socketService.connect();

// Join a chat room
socketService.joinRoom('roomId');

// Send a message
socketService.sendMessage('roomId', 'Hello!');

// Listen for new messages
const unsubscribe = socketService.onMessage((message) => {
  console.log('New message:', message);
});

// Disconnect
socketService.disconnect();
```

## Data Models

### ChatMessage
```typescript
interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderImage?: string;
  content: string;
  timestamp: string;
  type: 'text' | 'image' | 'file';
  status?: 'sent' | 'delivered' | 'read';
  roomId?: string;
}
```

### TypingIndicator
```typescript
interface TypingIndicator {
  userId: string;
  userName: string;
  isTyping: boolean;
  roomId?: string;
}
```

### UserStatus
```typescript
interface UserStatus {
  userId: string;
  userName: string;
  isOnline: boolean;
  timestamp: string;
}
```

## Security Features

- JWT authentication for Socket.IO connections
- CORS configuration for secure cross-origin requests
- Rate limiting on API endpoints
- Input validation and sanitization
- Secure message transmission

## Performance Optimizations

- Message pagination for large chat histories
- Efficient reconnection handling
- Optimized re-renders with React.memo
- Lazy loading of chat components
- Memory management for long-running connections

## Error Handling

- Network error recovery
- Automatic reconnection on connection loss
- Graceful degradation when offline
- User-friendly error messages
- Connection status indicators

## Testing

### Backend Testing
```bash
# Test Socket.IO connections
npm test socket

# Test chat API endpoints
npm test chat
```

### Frontend Testing
```bash
# Test chat components
npm test chat

# Test Socket.IO integration
npm test socket
```

## Future Enhancements

- [ ] File/image sharing
- [ ] Voice messages
- [ ] Video calling integration
- [ ] Message reactions
- [ ] Message search
- [ ] Chat room creation
- [ ] Group chat support
- [ ] Message encryption
- [ ] Push notifications
- [ ] Message backup/export

## Troubleshooting

### Common Issues

1. **Socket.IO Connection Failed**
   - Check API_BASE_URL configuration
   - Verify JWT token is valid
   - Check network connectivity

2. **Messages Not Sending**
   - Verify Socket.IO connection status
   - Check message content validation
   - Ensure user is authenticated

3. **Typing Indicators Not Working**
   - Check typing timeout configuration
   - Verify event listeners are properly set up
   - Check room joining status

4. **Read Receipts Not Updating**
   - Verify message marking logic
   - Check Socket.IO event emission
   - Ensure proper message ID handling

### Debug Mode

Enable debug logging by setting:
```env
DEBUG=socket.io:*
```

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Test on both iOS and Android
5. Ensure backward compatibility

## License

This chat feature is part of the Menorah Health application and follows the same licensing terms.
