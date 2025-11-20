# Quick Fix: Mobile App Login Issue

## Problem Found ✅
Your mobile app configuration had the wrong IP address:
- **Configured:** `192.168.1.3`
- **Actual IP:** `192.168.1.2`

## What I Fixed
✅ Updated `app.config.ts` to use the correct IP address (`192.168.1.2`)

## Next Steps

### 1. Make Sure Backend Server is Running
```bash
cd Menorah/backend
npm run dev
```

You should see:
```
🚀 Menorah Health API server running on port 3000
```

### 2. Verify Backend is Accessible
Open in your browser: `http://192.168.1.2:3000/api/health`

Should show:
```json
{
  "success": true,
  "status": "OK",
  "message": "Menorah Health API is running"
}
```

### 3. Restart Your Mobile App
```bash
cd Menorah/mobile-app
npm start
```

Then:
- Press `r` in the terminal to reload
- Or shake your device → Reload

### 4. Try Login Again
The app should now connect to the backend successfully!

## If Still Not Working

### Check These:
1. **Backend is running** on port 3000
2. **Both devices on same WiFi** (phone and computer)
3. **Firewall allows** connections on port 3000
4. **IP address hasn't changed** (check with `ipconfig`)

### Test Connection from Phone Browser:
Open `http://192.168.1.2:3000/api/health` in your phone's browser
- ✅ If it works: Network is fine, app should work
- ❌ If it fails: Check IP address or firewall

### If IP Changes Again:
Run this to find your current IP:
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -like "192.168.*"} | Select-Object IPAddress
```

Then update `app.config.ts` line 8 with the new IP.

## Alternative: Use Production API (Temporary)
If local development is problematic, you can use production API:

In `app.config.ts`, change line 44-46:
```typescript
API_BASE_URL: isDev
  ? 'https://app-api.menorahhealth.app/api'  // Use production
  : 'https://app-api.menorahhealth.app/api',
```

**Note:** This requires your production backend to be running and accessible.

