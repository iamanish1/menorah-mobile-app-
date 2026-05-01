# Menorah Health - API Integration Guide

This document outlines the complete integration between the Menorah Health mobile app frontend and backend API.

## Overview

The mobile app has been fully integrated with the backend API to provide a complete mental health platform with the following features:

- **Authentication**: User registration, login, email/phone verification, password reset
- **Counsellor Management**: Browse, search, and filter counsellors
- **Booking System**: Create, manage, and cancel therapy sessions
- **Payment Processing**: Stripe and Razorpay integration
- **Chat System**: Real-time messaging with counsellors
- **Video Calls**: Jitsi integration for video sessions

## Backend API Endpoints

### Authentication (`/api/auth`)
- `POST /register` - User registration
- `POST /login` - User login
- `POST /verify-email` - Email verification
- `POST /verify-phone` - Phone verification
- `POST /forgot-password` - Password reset request
- `POST /reset-password` - Password reset
- `GET /me` - Get current user
- `POST /logout` - User logout

### Counsellors (`/api/counsellors`)
- `GET /` - List counsellors with filtering
- `GET /:id` - Get counsellor details
- `GET /:id/availability` - Get counsellor availability
- `GET /specializations` - Get all specializations
- `GET /languages` - Get all languages

### Bookings (`/api/bookings`)
- `POST /` - Create booking
- `GET /` - Get user bookings
- `GET /:id` - Get booking details
- `PUT /:id/cancel` - Cancel booking
- `PUT /:id/start` - Start session
- `PUT /:id/complete` - Complete session

### Payments (`/api/payments`)
- `POST /create-checkout-session` - Create payment session
- `POST /verify-razorpay` - Verify Razorpay payment
- `GET /booking/:bookingId` - Get payment status

### Chat (`/api/chat`)
- `GET /rooms` - Get chat rooms
- `GET /rooms/:roomId/messages` - Get messages
- `POST /rooms/:roomId/messages` - Send message
- `PUT /rooms/:roomId/messages/:messageId/read` - Mark as read
- `DELETE /rooms/:roomId/messages/:messageId` - Delete message

## Frontend Integration

### API Client (`src/lib/api.ts`)

The main API client provides:
- Automatic token management
- Request/response interceptors
- Error handling
- TypeScript interfaces for all data types

```typescript
import { api } from '@/lib/api';

// Example usage
const response = await api.getCounsellors({
  search: 'anxiety',
  specialization: 'depression',
  page: 1,
  limit: 10
});
```

### Authentication State (`src/state/useAuth.ts`)

Provides authentication context throughout the app:
- User state management
- Login/logout functionality
- Token persistence
- Automatic token refresh

```typescript
import { useAuth } from '@/state/useAuth';

const { user, isAuthed, login, logout } = useAuth();
```

## Setup Instructions

### 1. Backend Setup

1. Navigate to the backend directory:
```bash
cd Menorah/backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp env.example .env
```

4. Configure environment variables in `.env`:
```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000,http://localhost:8081
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
JITSI_BASE_URL=https://meet.jit.si
```

5. Start the backend server:
```bash
npm start
```

### 2. Frontend Setup

1. Navigate to the mobile app directory:
```bash
cd Menorah/mobile-app
```

2. Install dependencies:
```bash
npm install
```

3. Update the API base URL in `app.config.ts`:
```typescript
extra: {
  API_BASE_URL: process.env.API_BASE_URL ?? 'http://localhost:3000/api',
  CHECKOUT_RETURN_URL: 'menorah://payments/return',
  JITSI_BASE_URL: 'https://meet.jit.si',
},
```

4. Start the development server:
```bash
npm start
```

## Key Features Implemented

### 1. Authentication Flow
- Complete user registration with validation
- Email and phone verification
- Secure login with JWT tokens
- Password reset functionality
- Automatic token management

### 2. Counsellor Discovery
- Advanced search and filtering
- Specialization and language filters
- Rating and price sorting
- Pagination support
- Real-time availability checking

### 3. Booking System
- Session booking with counsellor selection
- Date and time availability
- Session type selection (video, audio, chat)
- Booking management (cancel, reschedule)
- Session status tracking

### 4. Payment Integration
- Stripe payment processing
- Razorpay integration for Indian users
- Payment status tracking
- Secure payment verification

### 5. Chat System
- Real-time messaging
- Message history
- Read receipts
- Typing indicators
- File and image sharing support

### 6. Video Calls
- Jitsi Meet integration
- Pre-call checks
- Session management
- Call quality monitoring

## Error Handling

The integration includes comprehensive error handling:

- Network error detection
- API error responses
- User-friendly error messages
- Automatic retry mechanisms
- Offline state management

## Security Features

- JWT token authentication
- Secure password hashing
- Input validation and sanitization
- CORS configuration
- Rate limiting
- Request/response encryption

## Testing

To test the integration:

1. Start both backend and frontend servers
2. Register a new user account
3. Verify email and phone
4. Browse counsellors
5. Create a test booking
6. Test payment flow
7. Send test messages
8. Join a video call

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure CORS_ORIGIN includes your frontend URL
2. **Authentication Failures**: Check JWT_SECRET configuration
3. **Database Connection**: Verify MongoDB connection string
4. **Payment Issues**: Ensure payment gateway credentials are correct

### Debug Mode

Enable debug logging by setting:
```env
NODE_ENV=development
```

## Next Steps

1. **Real-time Features**: Implement WebSocket connections for live chat
2. **Push Notifications**: Add notification system for bookings and messages
3. **Analytics**: Integrate analytics for user behavior tracking
4. **Advanced Features**: Add group sessions, assessments, and progress tracking

## Support

For technical support or questions about the integration, please refer to the backend and frontend documentation or contact the development team.
