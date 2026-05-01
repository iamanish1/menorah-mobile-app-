# Mobile App Troubleshooting Guide

## Issue: Mobile App Not Working After Web App Build

### Quick Diagnosis Steps

1. **Check if Backend Server is Running**
   ```bash
   cd Menorah/backend
   npm run dev
   ```
   The server should start on port 3000 and show:
   ```
   🚀 Menorah Health API server running on port 3000
   ```

2. **Find Your Current IP Address**
   
   **Windows:**
   ```powershell
   ipconfig
   ```
   Look for "IPv4 Address" under your active network adapter (usually WiFi or Ethernet)
   
   **Mac/Linux:**
   ```bash
   ifconfig | grep "inet "
   ```
   Or:
   ```bash
   ip addr show | grep "inet "
   ```

3. **Update IP Address in app.config.ts**
   
   Open `Menorah/mobile-app/app.config.ts` and update line 8:
   ```typescript
   const LOCAL_IP = 'YOUR_ACTUAL_IP_HERE'; // e.g., '192.168.1.5'
   ```

4. **Verify Backend is Accessible**
   
   Test the backend health endpoint:
   ```bash
   curl http://YOUR_IP:3000/api/health
   ```
   Or open in browser: `http://YOUR_IP:3000/api/health`
   
   Should return:
   ```json
   {
     "success": true,
     "status": "OK",
     "message": "Menorah Health API is running"
   }
   ```

5. **Restart Mobile App**
   ```bash
   cd Menorah/mobile-app
   npm start
   ```
   Then reload the app on your device (shake device → Reload)

### Common Issues and Solutions

#### Issue 1: "Network error: Unable to connect to server"
**Cause:** Backend server not running or wrong IP address
**Solution:**
1. Start backend: `cd Menorah/backend && npm run dev`
2. Verify IP address matches your current network IP
3. Ensure mobile device and computer are on same WiFi network

#### Issue 2: "Connection refused"
**Cause:** Firewall blocking port 3000
**Solution:**
- Windows: Allow Node.js through Windows Firewall
- Mac: System Preferences → Security → Firewall → Allow Node.js

#### Issue 3: "Cannot resolve hostname"
**Cause:** IP address changed or incorrect
**Solution:**
1. Find current IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Update `app.config.ts` with new IP
3. Restart Expo: `npm start` → Press `r` to reload

#### Issue 4: Backend works but mobile app can't connect
**Cause:** CORS or network configuration
**Solution:**
- Backend CORS is already configured to allow all origins
- Check if both devices are on same network
- Try disabling mobile data on your phone (use WiFi only)

### Testing Connection

1. **Test from Mobile Browser:**
   Open `http://YOUR_IP:3000/api/health` in your mobile browser
   - If this works, the network is fine
   - If this fails, check IP address and firewall

2. **Check Mobile App Logs:**
   Look for this in Expo console:
   ```
   Environment Configuration: {
     Platform: 'ios' or 'android',
     API_BASE_URL: 'http://YOUR_IP:3000/api',
     ...
   }
   ```

3. **Test Login Endpoint:**
   ```bash
   curl -X POST http://YOUR_IP:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}'
   ```

### Quick Fix Script

Run this to automatically find and update your IP:

**Windows PowerShell:**
```powershell
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -like "*Wi-Fi*" -or $_.InterfaceAlias -like "*Ethernet*"} | Select-Object -First 1).IPAddress
Write-Host "Your IP is: $ip"
Write-Host "Update app.config.ts line 8 with: const LOCAL_IP = '$ip';"
```

**Mac/Linux:**
```bash
ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
echo "Your IP is: $ip"
echo "Update app.config.ts line 8 with: const LOCAL_IP = '$ip';"
```

### Alternative: Use Production API

If local development is problematic, you can temporarily use the production API:

In `app.config.ts`, change:
```typescript
API_BASE_URL: isDev
  ? 'https://app-api.menorahhealth.app/api'  // Use production API
  : 'https://app-api.menorahhealth.app/api',
```

**Note:** This requires your backend to be deployed and accessible.

### Verification Checklist

- [ ] Backend server is running (`npm run dev` in backend folder)
- [ ] Backend responds to health check (`http://YOUR_IP:3000/api/health`)
- [ ] IP address in `app.config.ts` matches your current network IP
- [ ] Mobile device and computer are on same WiFi network
- [ ] Firewall allows connections on port 3000
- [ ] Mobile app has been reloaded after config change
- [ ] Check Expo console for API_BASE_URL value

### Still Not Working?

1. **Check Expo logs** for API connection errors
2. **Try tunnel mode:** `npx expo start --tunnel`
3. **Use ngrok** for testing: `ngrok http 3000`
4. **Check backend logs** for incoming requests
5. **Verify database connection** in backend

