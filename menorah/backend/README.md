# Menorah Health Backend API

A comprehensive Node.js/Express.js backend API for the Menorah Health mobile application, providing secure counselling services with video calls, chat, and booking functionality.

## Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **User Management**: Complete user profile management and settings
- **Counsellor Management**: Counsellor profiles, availability, and verification
- **Booking System**: Session booking with availability checking and scheduling
- **Payment Integration**: Stripe and Razorpay payment processing
- **Real-time Chat**: WebSocket-based messaging system
- **Video Calls**: Jitsi integration for secure video sessions
- **Email & SMS**: Automated notifications and reminders
- **File Upload**: Cloudinary integration for media storage
- **Rate Limiting**: API rate limiting and security measures

## Tech Stack

- **Node.js** + **Express.js**
- **MongoDB** with **Mongoose** ODM
- **JWT** for authentication
- **Socket.io** for real-time features
- **Stripe** & **Razorpay** for payments
- **Jitsi** for video calls
- **Cloudinary** for file storage
- **Nodemailer** for emails
- **Twilio** for SMS
- **Express Validator** for input validation
- **Helmet** for security headers
- **Rate Limiting** for API protection

## Prerequisites

- Node.js 18+
- MongoDB 5+
- npm or yarn

## Installation

1. **Clone the repository and navigate to backend directory:**
```bash
cd Menorah/backend
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment variables:**
```bash
cp env.example .env
```
Edit `.env` file with your configuration values.

4. **Start the development server:**
```bash
npm run dev
```

## Environment Variables

Create a `.env` file in the backend directory with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/menorah_health

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_REFRESH_EXPIRES_IN=30d

# Email Configuration (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@menorahhealth.com

# SMS Configuration (Twilio)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Payment Gateway Configuration
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-secret-key

# Cloud Storage (Cloudinary)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Video Call Configuration
JITSI_BASE_URL=https://meet.jit.si
JITSI_APP_ID=your-jitsi-app-id
JITSI_APP_SECRET=your-jitsi-app-secret

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads

# Security
BCRYPT_ROUNDS=12
CORS_ORIGIN=http://localhost:3000,https://menorahhealth.com
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/verify-email` - Verify email address
- `POST /api/auth/verify-phone` - Verify phone number
- `POST /api/auth/forgot-password` - Send password reset email
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `PUT /api/users/address` - Update user address
- `PUT /api/users/emergency-contact` - Update emergency contact
- `PUT /api/users/notification-preferences` - Update notification preferences
- `PUT /api/users/change-password` - Change password
- `DELETE /api/users/account` - Delete account

### Counsellors
- `GET /api/counsellors` - Get all counsellors with filtering
- `GET /api/counsellors/:id` - Get counsellor by ID
- `GET /api/counsellors/:id/availability` - Get counsellor availability
- `GET /api/counsellors/specializations` - Get all specializations
- `GET /api/counsellors/languages` - Get all languages

### Bookings
- `POST /api/bookings` - Create a new booking
- `GET /api/bookings` - Get user's bookings
- `GET /api/bookings/:id` - Get booking by ID
- `PUT /api/bookings/:id/cancel` - Cancel a booking
- `PUT /api/bookings/:id/start` - Start a session
- `PUT /api/bookings/:id/complete` - Complete a session

### Payments
- `POST /api/payments/create-checkout-session` - Create payment session
- `POST /api/payments/verify-razorpay` - Verify Razorpay payment
- `GET /api/payments/booking/:bookingId` - Get payment status
- `POST /api/payments/stripe-webhook` - Stripe webhook handler
- `POST /api/payments/razorpay-webhook` - Razorpay webhook handler

### Chat
- `GET /api/chat/rooms` - Get user's chat rooms
- `GET /api/chat/rooms/:roomId/messages` - Get chat messages
- `POST /api/chat/rooms/:roomId/messages` - Send a message
- `PUT /api/chat/rooms/:roomId/messages/:messageId/read` - Mark message as read
- `DELETE /api/chat/rooms/:roomId/messages/:messageId` - Delete a message
- `POST /api/chat/rooms/:roomId/typing` - Send typing indicator

### Video Calls
- `POST /api/video/create-room` - Create video call room
- `GET /api/video/room/:bookingId` - Get video room details
- `POST /api/video/room/:bookingId/join` - Join video room
- `POST /api/video/room/:bookingId/leave` - Leave video room
- `POST /api/video/room/:bookingId/recording` - Toggle recording

## Database Models

### User
- Authentication fields (email, phone, password)
- Profile information (name, date of birth, gender)
- Address and emergency contact
- Notification preferences
- Account status and security

### Counsellor
- Professional information (license, specialization, experience)
- Availability schedule
- Ratings and reviews
- Verification status
- Payment and commission settings

### Booking
- Session details (type, duration, scheduled time)
- Status tracking
- Payment information
- Video call details
- Session notes and feedback

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with configurable rounds
- **Rate Limiting**: API rate limiting to prevent abuse
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Configurable CORS settings
- **Security Headers**: Helmet.js for security headers
- **Account Locking**: Automatic account locking after failed attempts

## Development

### Scripts
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run migrate` - Run database migrations
- `npm run seed` - Seed database with sample data

### Code Quality
- **ESLint**: Code linting and formatting
- **Prettier**: Code formatting
- **TypeScript**: Type checking (optional)
- **Jest**: Unit and integration testing

## Deployment

### Production Setup
1. Set `NODE_ENV=production`
2. Configure production database
3. Set up SSL certificates
4. Configure environment variables
5. Set up monitoring and logging

### Docker Deployment
```bash
# Build Docker image
docker build -t menorah-backend .

# Run container
docker run -p 3000:3000 --env-file .env menorah-backend
```

### PM2 Deployment
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start src/server.js --name "menorah-backend"

# Monitor application
pm2 monit
```

## Monitoring & Logging

- **Health Check**: `GET /health` endpoint
- **Error Logging**: Comprehensive error logging
- **Request Logging**: Morgan for HTTP request logging
- **Performance Monitoring**: Response time tracking

## Third-party Integrations

### Payment Gateways
- **Stripe**: International payments
- **Razorpay**: Indian payments
- Webhook handling for payment status updates

### Communication
- **Nodemailer**: Email notifications
- **Twilio**: SMS notifications
- **Socket.io**: Real-time chat

### Video Calls
- **Jitsi**: Secure video conferencing
- JWT token generation for authentication
- Room management and recording

### File Storage
- **Cloudinary**: Image and file upload
- Automatic optimization and CDN

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For technical support or questions, please contact the development team.

## License

Proprietary - Menorah Health
