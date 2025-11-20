# Socket.IO Troubleshooting Guide

## Common Errors and Solutions

### 1. "websocket error" / "Invalid namespace"

**Problem**: Socket.IO connection is failing to establish.

**Solutions**:

#### Check Backend Server
```bash
# Make sure your backend server is running
cd Menorah/backend
npm run dev
```

#### Verify API URL Configuration
1. Check your local IP address:
   ```bash
   # On Windows
   ipconfig
   
   # On Mac/Linux
   ifconfig
   ```

2. Update `app.config.ts` with your correct IP:
   ```typescript
   API_BASE_URL: 'http://YOUR_IP_ADDRESS:3000'
   ```

3. Restart the Expo development server:
   ```bash
   npm run start --clear
   ```

#### Check Network Connectivity
1. Ensure your mobile device and computer are on the same network
2. Try using `localhost` if running on simulator/emulator
3. Check if port 3000 is not blocked by firewall

### 2. "Network Error" / "ERR_NETWORK"

**Problem**: API requests are failing.

**Solutions**:

#### Check Backend Health
```bash
# Test if backend is responding
curl http://localhost:3000/health
```

#### Verify CORS Configuration
In `Menorah/backend/src/server.js`, ensure CORS includes your development URLs:
```javascript
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:19006',
    'http://192.168.1.2:3000', // Your IP
    'exp://192.168.1.2:19000'  // Expo dev server
  ],
  credentials: true
}));
```

### 3. "Authentication error: Token required"

**Problem**: Socket.IO authentication is failing.

**Solutions**:

#### Check Authentication Token
1. Ensure user is logged in
2. Check if token is stored in AsyncStorage
3. Verify token format and expiration

#### Debug Token Storage
```typescript
// Add this to debug token issues
import AsyncStorage from '@react-native-async-storage/async-storage';

const checkToken = async () => {
  const token = await AsyncStorage.getItem('auth_token');
  console.log('Stored token:', token ? 'exists' : 'missing');
};
```

### 4. Connection Timeout

**Problem**: Socket.IO connection times out.

**Solutions**:

#### Increase Timeout
In `src/lib/socket.ts`:
```typescript
this.socket = io(socketUrl, {
  timeout: 30000, // Increase to 30 seconds
  // ... other options
});
```

#### Check Server Load
1. Monitor backend server performance
2. Check for memory leaks
3. Ensure proper error handling

## Development Setup Checklist

### Backend Setup
- [ ] Backend server running on port 3000
- [ ] Socket.IO properly integrated
- [ ] CORS configured for development
- [ ] JWT authentication working
- [ ] Environment variables set

### Frontend Setup
- [ ] Correct API_BASE_URL in app.config.ts
- [ ] Socket.IO client installed
- [ ] Authentication token available
- [ ] Network connectivity verified

### Network Setup
- [ ] Same WiFi network for device and computer
- [ ] Firewall allows port 3000
- [ ] No VPN interference
- [ ] Correct IP address used

## Debug Commands

### Backend Debug
```bash
# Check if server is running
netstat -an | grep 3000

# Check server logs
cd Menorah/backend
npm run dev

# Test Socket.IO manually
curl -X GET http://localhost:3000/health
```

### Frontend Debug
```bash
# Clear Expo cache
npm run start --clear

# Check network requests
# Open browser dev tools and check Network tab

# Debug Socket.IO connection
# Add console.log statements in socket.ts
```

## Environment Variables

### Backend (.env)
```env
PORT=3000
JWT_SECRET=your_secret_key
CORS_ORIGIN=http://localhost:3000,http://localhost:19006,http://192.168.1.2:3000
NODE_ENV=development
```

### Frontend (app.config.ts)
```typescript
extra: {
  API_BASE_URL: 'http://192.168.1.2:3000', // Your IP
  CHECKOUT_RETURN_URL: 'http://localhost:19006/checkout/return',
  JITSI_BASE_URL: 'http://localhost:8080',
}
```

## Testing Connection

### Manual Socket.IO Test
```javascript
// In browser console
const socket = io('http://192.168.1.2:3000', {
  auth: { token: 'your_test_token' }
});

socket.on('connect', () => {
  console.log('Connected!');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});
```

### API Health Check
```bash
curl -X GET http://192.168.1.2:3000/health
```

## Common IP Addresses

### Development
- `localhost` - For simulator/emulator
- `10.0.2.2` - Android emulator to host machine
- `192.168.x.x` - Your local network IP

### Production
- `https://app-api.menorahhealth.app/api` - Production API

## Still Having Issues?

1. **Check Console Logs**: Look for detailed error messages
2. **Test with Postman**: Verify API endpoints work
3. **Use Different Device**: Test on physical device vs simulator
4. **Check Network**: Try different WiFi network
5. **Restart Everything**: Backend, frontend, and development tools

## Support

If you're still experiencing issues:
1. Check the console logs for specific error messages
2. Verify all setup steps in this guide
3. Test with a simple Socket.IO example
4. Check if the issue is environment-specific
