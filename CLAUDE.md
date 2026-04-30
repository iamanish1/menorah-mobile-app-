# Menorah Health — Project Context

## What This Is

Menorah Health is a **mental health counselling platform** with three client apps and one backend:

| Component | Tech | Port | Purpose |
|-----------|------|------|---------|
| `Menorah/backend` | Node.js + Express + MongoDB | 3000 | REST API + Socket.IO server |
| `Menorah/mobile-app` | React Native (Expo SDK 54) | N/A | User-facing mobile app (Android/iOS) |
| `Menorah/user-web-app` | Next.js 15 + Tailwind | 3002 | User-facing web app (mirrors mobile) |
| `Menorah/web-app` | Next.js 16 | 3001 | **Counsellor dashboard** (manage bookings, chat, sessions) |

---

## Architecture

```
MongoDB Atlas (cloud)
       │
  Express API (port 3000)
  ├── REST routes under /api/*
  └── Socket.IO (real-time chat / session events)
       │
  ┌────┴─────────────┐
  │                  │
User clients    Counsellor web
(mobile + user-web-app)   (web-app)
```

### Backend Route Map

| Route | Purpose |
|-------|---------|
| `POST /api/auth/register` | Register user, send SMS OTP |
| `POST /api/auth/login` | Login, returns JWT |
| `POST /api/auth/verify-phone` | Verify OTP |
| `POST /api/auth/forgot-password` | Send password reset email |
| `GET /api/auth/reset-password?token=` | Deep-links to mobile app |
| `GET /api/auth/me` | Get current user (auth required) |
| `GET /api/counsellors` | List/search counsellors |
| `GET /api/counsellors/:id` | Counsellor profile |
| `GET /api/counsellors/:id/availability` | Available slots |
| `POST /api/bookings` | Create booking |
| `GET /api/bookings` | User's bookings |
| `PUT /api/bookings/:id/cancel` | Cancel booking |
| `PUT /api/bookings/:id/start` | Start session (counsellor) |
| `POST /api/payments/create-checkout-session` | Stripe or Razorpay checkout |
| `POST /api/payments/verify-razorpay` | Verify Razorpay payment signature |
| `POST /api/payments/create-subscription-checkout` | Subscription payment |
| `POST /api/payments/verify-subscription-payment` | Activate subscription |
| `GET /api/chat/rooms` | List chat rooms |
| `GET /api/chat/rooms/:id/messages` | Get messages |
| `POST /api/chat/rooms/:id/messages` | Send message |
| `POST /api/video/create-room` | Create Jitsi room |
| `POST /api/video/room/:id/join` | Join video session |
| `POST /api/video/room/:id/leave` | Leave / complete session |

### Socket.IO Events

**Emitted by client:**
- `join_room(roomId)` — join a chat room
- `send_message({ roomId, content, type })` — send chat message
- `typing_start/stop(roomId)` — typing indicators
- `mark_read({ roomId, messageId })` — read receipts
- `set_online_status(bool)` — presence

**Emitted by server:**
- `new_message` — new chat message
- `user_typing` — typing indicator
- `session_started` — counsellor started the session
- `booking_status_changed` — booking status update
- `new_booking_available` — new unassigned booking (counsellors)

---

## Data Models

### User
- `email`, `phone`, `password` (bcrypt), `firstName`, `lastName`, `dateOfBirth`, `gender`
- `isEmailVerified` (auto-true on registration), `isPhoneVerified`
- `role`: `user | counsellor | admin`
- `subscription`: `{ plan: free|basic|premium, subscriptionType: weekly|monthly|yearly, startDate, endDate, isActive }`
- `notificationPreferences`: `{ email, sms, push }`
- Account locking after 5 failed login attempts (2h lockout)

### Counsellor
- Linked to `User` via `user` ref
- `licenseNumber`, `specialization`, `specializations[]`, `experience`, `education[]`, `certifications[]`
- `availability`: per-day `{ start, end, isAvailable }`
- `hourlyRate`, `currency` (default INR), `commissionRate` (default 20%)
- `rating`, `reviewCount`, `totalSessions`
- `isVerified`, `isActive`, `isAvailable`
- `bankDetails`: for counsellor payouts
- `stats`: earnings, completed/cancelled sessions

### Booking
- Refs: `user`, `counsellor` (optional — assigned later)
- `sessionType`: `video | audio | chat`
- `sessionDuration`: 15–180 minutes
- `status`: `pending → confirmed → in-progress → completed | cancelled | no-show`
- `paymentMethod`: `stripe | razorpay | wallet | subscription`
- `paymentStatus`: `pending | paid | failed | refunded`
- `videoCall`: `{ roomId, roomUrl, startTime, endTime, duration, isRecordingEnabled }`
- `preferences`: gender preference, sessionType, categoryId (for counsellor matching)
- `isSubscriptionBooking`: boolean
- Cancellation allowed >24h before session; rescheduling >2h before

### ChatRoom / Message
- Rooms linked to bookings
- Messages: `text | image | file`, read receipts, soft-delete

---

## Feature List

### User Features (mobile-app + user-web-app)
- Onboarding → Register → SMS OTP verify → Login
- Discover counsellors (filter by specialization, language, rating, price, gender)
- Book session: pick counsellor OR match by preference, select session type (video/audio/chat), schedule, emergency contact
- Booking flow: gender selection → session review → payment (Razorpay or Stripe) → confirmation
- Subscription plans: Weekly ₹500, Monthly ₹1500, Yearly ₹12,000
- Real-time chat with counsellor (Socket.IO)
- Video/audio call (Jitsi Meet via WebView)
- Profile: edit info, change password, 2FA (UI only), notification preferences, privacy settings
- Crisis help section
- Notifications screen
- Forgot/reset password (email link → deep link back to app)

### Counsellor Features (web-app only)
- Login → Dashboard (stats: total bookings, upcoming sessions, pending assignments, monthly earnings)
- Booking management: view pending/confirmed/completed, assign to self
- Today's schedule
- Chat with users (Socket.IO)
- Booking detail: join/start session, complete session
- Profile management

### Admin (no dedicated UI yet, backend role exists)

---

## Payments

- **Razorpay only** (INR): order creation → React Native SDK or checkout URL → HMAC-SHA256 signature verification
- Webhook: `/api/payments/razorpay-webhook` — signature always required
- Subscription checkout at `/api/payments/create-subscription-checkout` (handled separately)

---

## Notifications

- **SMS**: MSG91 — OTP on registration (MSG91 manages OTP lifecycle, not stored in DB), session reminders
- **Email**: SendGrid (SENDGRID_API_KEY) — password reset
- **Push**: structure in place (notificationPreferences.push) but not wired to a push provider

---

## Video Calls

- Provider: **Jitsi Meet** (public `meet.jit.si`)
- Room ID format: `menorah-<bookingId>`
- JWT tokens generated only if `JITSI_APP_ID` + `JITSI_APP_SECRET` are set; otherwise null (public room)
- Flow: counsellor joins → status moves to `in-progress` → user can then join → counsellor leaves = session `completed`

---

## Third-Party Services

| Service | Used For | Key Env Var |
|---------|----------|-------------|
| MongoDB Atlas | Database | `MONGODB_URI` |
| MSG91 | SMS OTP + transactional SMS | `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID`, `MSG91_SMS_TEMPLATE_ID` |
| SendGrid | Email | `SENDGRID_API_KEY` |
| Razorpay | Payments (INR) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |
| ~~Stripe~~ | Removed — Razorpay only | — |
| Cloudinary | Image uploads | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Jitsi Meet | Video calls | `JITSI_BASE_URL`, `JITSI_APP_ID`, `JITSI_APP_SECRET` |

---

## Local Dev Ports

- Backend: `http://localhost:3000`
- Counsellor web-app: `http://localhost:3001`
- User web-app: `http://localhost:3002`
- Mobile app: Expo Dev Server (varies)

---

## Production Readiness Status (updated 2026-04-29)

### Resolved — all former blockers fixed

| # | Issue | Status |
|---|-------|--------|
| 1 | JWT_SECRET was placeholder | **Fixed** — add startup guard; exits if < 64 chars |
| 2 | CORS `origin: true` | **Fixed** — restricted to `ALLOWED_ORIGINS` env var |
| 3 | `NODE_ENV=development` | **Documented** — set `production` at deploy time; startup checks enforce required vars |
| 4 | `/api/auth/test-email` debug endpoint | **Removed** |
| 5 | Stripe integration | **Removed** — Razorpay only |
| 6 | Razorpay webhook secret placeholder | **Hardened** — signature is now always required |
| 7 | SMTP/nodemailer misleading warning | **Fixed** — startup now shows SendGrid key status |
| 8 | Twilio OTP | **Replaced** with MSG91 — OTP managed by MSG91, not stored in DB |
| 9 | Verbose sensitive logs in auth routes | **Removed** |
| 10 | `phoneVerificationToken` stored in DB | **Removed** from User model |
| 11 | Rate limiting bypass for dev | **Fixed** — stricter auth limits (10/15min), no skip |
| 12 | Deprecated MongoDB options | **Removed** |
| 13 | Socket.IO `origin: true` | **Fixed** — uses same `corsOrigin` function as HTTP |

### Still required before production

1. **Set real secrets in `.env`**:
   - `JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
   - `ALLOWED_ORIGINS` — comma-separated list of your actual domains
   - `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID`, `MSG91_SMS_TEMPLATE_ID`
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
   - `SENDGRID_API_KEY`

2. **Jitsi rooms are public** — `JITSI_APP_ID`/`JITSI_APP_SECRET` empty; anyone knowing `menorah-<bookingId>` can join

3. **No push notification provider** — `notificationPreferences.push` is stored but never sent

4. **No tests** — jest configured but no test files exist

5. **Mobile mock data** — `src/mock/` files may still serve hardcoded data on some screens

### LOW PRIORITY

6. Both web apps point to `localhost:3000` via `.env.local` — update to production API URL at deploy
7. `CHECKOUT_RETURN_URL` set to `https://menorahhealth.app/checkout/return` — verify domain exists

---

## Key File Locations

```
backend/
  src/server.js          — Express + Socket.IO setup
  src/routes/auth.js     — Auth endpoints
  src/routes/bookings.js — Booking CRUD
  src/routes/payments.js — Razorpay only (Stripe removed)
  src/routes/chat.js     — Chat REST + Socket.IO integration
  src/routes/video.js    — Jitsi video rooms
  src/models/User.js     — User schema
  src/models/Counsellor.js
  src/models/Booking.js
  src/models/ChatRoom.js
  src/models/Message.js
  src/middleware/auth.js  — JWT auth middleware
  .env                   — All secrets (do not commit)

mobile-app/
  src/screens/           — All screens
  src/navigation/RootNavigator.tsx — Navigation + deep link config
  src/lib/api.ts         — API client (Axios)
  src/lib/socket.ts      — Socket.IO client
  src/state/useAuth.tsx  — Auth state (Zustand or similar)

user-web-app/            — Next.js 15, user-facing
  src/app/(app)/         — Protected routes
  src/app/(auth)/        — Auth routes
  src/lib/api.ts         — API client
  src/context/           — AuthContext, SocketContext, NotificationContext

web-app/                 — Next.js 16, counsellor dashboard
  src/app/dashboard/     — Dashboard page
  src/app/bookings/      — Booking management
  src/app/chat/          — Chat interface
  src/lib/api.ts         — API client
  src/hooks/useAuth.ts   — Auth hook
```
