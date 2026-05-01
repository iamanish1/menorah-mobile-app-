# Menorah Health Mobile App

A React Native (Expo Dev Client) mobile application for Menorah Health, providing secure counselling services with video calls, chat, and booking functionality.

## Features

- **Authentication**: Email/phone registration, login, and verification
- **Discover**: Browse and search counsellors with filters
- **Booking**: Schedule sessions with availability picker
- **Payments**: Secure checkout via Razorpay React Native SDK (with WebView fallback for Stripe)
- **Video Calls**: Jitsi integration for secure video sessions
- **Chat**: Real-time messaging with counsellors
- **Profile**: User profile management and settings
- **Crisis Help**: Emergency resources and helplines

## Tech Stack

- **React Native** + **Expo Dev Client** (latest stable)
- **TypeScript** (strict mode)
- **React Navigation** (stack + tabs)
- **NativeWind** (Tailwind CSS for React Native)
- **React Query** (data fetching and caching)
- **Axios** (HTTP client)
- **Razorpay React Native SDK** (native payment integration)
- **WebView** (video calls and Stripe payments fallback)
- **FlashList** (high-performance lists)
- **Lucide React Native** (icons)

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI
- iOS Simulator (for iOS development)
- Android Studio (for Android development)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd menorah-health-app
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
Create a `.env` file in the root directory:
```env
API_BASE_URL=https://app-api.menorahhealth.app/api
```

4. Start the development server:
```bash
npm start
```

5. Run on device/simulator:
```bash
# iOS
npm run ios

# Android
npm run android
```

## Project Structure

```
src/
├── components/
│   ├── ui/           # Reusable UI components
│   ├── cards/        # Card components
│   └── composite/    # Complex composite components
├── screens/
│   ├── auth/         # Authentication screens
│   ├── discover/     # Counsellor discovery
│   ├── booking/      # Booking flow
│   ├── chat/         # Messaging
│   ├── call/         # Video calls
│   └── profile/      # User profile
├── navigation/       # Navigation configuration
├── lib/             # Utilities and configurations
├── hooks/           # Custom React hooks
├── state/           # State management
├── mock/            # Mock data for development
└── theme/           # Theming and styling
```

## Configuration

### Deep Links

The app uses the scheme `menorah://` for deep linking:
- Payment returns: `menorah://payments/return`
- Video calls: `menorah://call/join`

### Environment Variables

Configure in `app.config.ts`:
- `API_BASE_URL`: Backend API endpoint
- `CHECKOUT_RETURN_URL`: Payment return URL
- `JITSI_BASE_URL`: Jitsi video call URL

## Development

### Scripts

- `npm start`: Start Expo development server
- `npm run ios`: Run on iOS simulator
- `npm run android`: Run on Android emulator
- `npm run typecheck`: Run TypeScript type checking
- `npm run lint`: Run ESLint
- `npm run prettier`: Format code with Prettier

### Code Quality

- **TypeScript**: Strict mode enabled
- **ESLint**: React Native and recommended rules
- **Prettier**: Code formatting
- **Accessibility**: Minimum 44x44 touch targets, proper labels

### Backend Integration

Replace mock data in `src/mock/` with real API calls:

1. **Counsellors**: `GET /counsellors`
2. **Availability**: `GET /availability/:counsellorId`
3. **Bookings**: `GET /bookings`
4. **Payments**: `POST /payments/checkout`
5. **WebSocket**: STOMP topics for real-time updates

### Payment Integration

The app uses **Razorpay React Native SDK** for Razorpay payments (with WebView fallback) and WebView for Stripe payments.

#### Razorpay Integration (SDK)

1. Backend creates Razorpay order and returns `orderId`, `keyId`, `amount`, and `currency`
2. App uses Razorpay SDK to open native payment UI
3. User completes payment in native Razorpay interface
4. SDK returns payment data (payment_id, signature)
5. App verifies payment with backend
6. On success, navigates to booking success screen

**Requirements:**
- Development build required (cannot use Expo Go)
- `expo-dev-client` must be installed
- Build with: `npx expo run:android` or `npx expo run:ios`

**Feature Flag:**
- `USE_RAZORPAY_SDK` in `src/lib/env.ts` controls SDK usage
- Set to `false` to fallback to WebView approach
- Default: `true`

#### Stripe Integration (WebView)

1. Backend creates Stripe checkout session
2. App loads session URL in WebView
3. Payment gateway handles transaction
4. Success/cancel via postMessage or redirect URL

### Video Call Integration

Jitsi integration via WebView:

1. Backend provides room URL with JWT token
2. App loads Jitsi in WebView
3. TURN servers handled server-side
4. Secure video/audio communication

## Deployment

### Expo Dev Client

**Important:** Razorpay SDK requires a development build. You cannot test Razorpay payments with Expo Go.

1. Build development client:
```bash
# Android
npx expo run:android

# iOS
npx expo run:ios
```

2. The app will be built and installed on your device/emulator

**Note:** After installing `react-native-razorpay`, you must rebuild the app for the native module to work.

### Production Build

1. Configure production environment
2. Build standalone app:
```bash
expo build:ios --release-channel production
expo build:android --release-channel production
```

## Contributing

1. Follow TypeScript strict mode
2. Use NativeWind for styling
3. Implement proper error handling
4. Add accessibility features
5. Test on both iOS and Android

## Troubleshooting

### Common Issues

#### Network Error / API Connection Issues

If you encounter "Network Error" or "Login error: [AxiosError: Network Error]" messages:

1. **Check if the API server is running:**
   - Ensure your backend server is running on the correct port
   - Default API URL: `http://localhost:3000/api`

2. **Verify network connectivity:**
   - Use tunnel mode: `npm run start:fast`
   - Check if your device can reach the API server
   - Ensure both devices are on the same network

3. **Use the diagnostic tool:**
   ```bash
   npm run diagnose
   ```

4. **Check the troubleshooting guide:**
   - See `TROUBLESHOOTING.md` for detailed solutions

#### Navigation Errors

- **Clear cache:** `npm run clean`
- **Reset everything:** `npm run reset`
- **Check navigation dependencies**

#### Performance Issues

- **Use tunnel mode:** `npm run start:fast`
- **Clear Metro cache:** `npm run clean`
- **Check bundle size and optimization**

### Quick Fixes

- **Clear cache:** `npm run clean`
- **Reset everything:** `npm run reset`
- **Use tunnel mode:** `npm run start:fast`
- **Run diagnostics:** `npm run diagnose`

## Support

For technical support or questions, please contact the development team.

## License

Proprietary - Menorah Health
