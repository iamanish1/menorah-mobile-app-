# API Connection Check Guide

## Current Configuration

### Mobile App Configuration
- **API Base URL**: `http://192.168.1.3:3000/api`
- **Location**: `Menorah/mobile-app/app.config.ts` (line 39)

### Backend Server Configuration
- **Default Port**: `3000` (or from `.env` file)
- **API Routes**: `/api/auth/login`, `/api/auth/register`, etc.
- **Health Check**: `/health` and `/api/health`

## Steps to Verify API is Working

### 1. Check if Backend Server is Running

**Option A: Check if process is running**
```bash
# Windows PowerShell
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*backend*" }

# Or check if port 3000 is in use
netstat -ano | findstr :3000
```

**Option B: Start the backend server**
```bash
cd Menorah/backend
npm run dev
```

You should see:
```
🚀 Menorah Health API server running on port 3000
📱 Environment: development
🔗 API Base URL: http://localhost:3000
🔌 Socket.IO server is ready for real-time connections
📦 MongoDB Connected: ...
```

### 2. Verify Backend Configuration

**Check if `.env` file exists:**
```bash
cd Menorah/backend
if (Test-Path .env) { Write-Host "✅ .env file exists" } else { Write-Host "❌ .env file missing - create it!" }
```

**Required `.env` variables (minimum):**
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/menorah_health
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

### 3. Test API Endpoints Directly

**Test Health Check:**
```bash
# Using curl (if available)
curl http://192.168.1.3:3000/health
curl http://192.168.1.3:3000/api/health

# Using PowerShell
Invoke-WebRequest -Uri "http://192.168.1.3:3000/health" -Method GET
```

**Expected Response:**
```json
{
  "success": true,
  "status": "OK",
  "message": "Menorah Health API is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development"
}
```

### 4. Test Login Endpoint

```bash
# Test with invalid credentials (should return 401)
Invoke-WebRequest -Uri "http://192.168.1.3:3000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"test@example.com","password":"wrong"}' `
  -ErrorAction SilentlyContinue
```

### 5. Check MongoDB Connection

The backend needs MongoDB to be running. Check if MongoDB is running:
```bash
# Check if MongoDB service is running (Windows)
Get-Service -Name MongoDB* -ErrorAction SilentlyContinue

# Or check if MongoDB port is in use
netstat -ano | findstr :27017
```

**If MongoDB is not running:**
- Install MongoDB or use MongoDB Atlas (cloud)
- Update `MONGODB_URI` in `.env` file

### 6. Verify IP Address

Make sure your computer's IP address matches `192.168.1.3`:
```bash
# Windows PowerShell
ipconfig | findstr IPv4
```

If your IP is different, update `Menorah/mobile-app/app.config.ts`:
```typescript
API_BASE_URL: 'http://YOUR_ACTUAL_IP:3000/api'
```

### 7. Check CORS Configuration

The backend CORS is configured to allow:
- `http://localhost:3000`
- `http://localhost:8081`
- `http://localhost:19006`
- `http://192.168.1.2:3000`
- `http://192.168.1.3:3000`
- `http://127.0.0.1:8081`
- `http://127.0.0.1:3000`

If your IP is different, add it to `Menorah/backend/src/server.js` (line 46-54) or set `CORS_ORIGIN` in `.env`.

## Common Issues and Solutions

### Issue 1: ERR_NETWORK Error
**Cause**: Backend server is not running or not reachable
**Solution**: 
1. Start the backend server: `cd Menorah/backend && npm run dev`
2. Verify the server is running on the correct port
3. Check firewall settings

### Issue 2: CORS Error
**Cause**: Origin not allowed by CORS
**Solution**: 
1. Add your IP/port to CORS allowed origins in `server.js`
2. Or set `CORS_ORIGIN` in `.env` file

### Issue 3: MongoDB Connection Error
**Cause**: MongoDB not running or wrong connection string
**Solution**: 
1. Start MongoDB service
2. Check `MONGODB_URI` in `.env` file
3. Verify MongoDB is accessible

### Issue 4: Port Already in Use
**Cause**: Another process is using port 3000
**Solution**: 
1. Find the process: `netstat -ano | findstr :3000`
2. Kill the process or change PORT in `.env`

## Quick Test Script

I've created a test script at `Menorah/mobile-app/src/lib/testAPI.ts` that you can use to test the API connection from the mobile app.

To use it, import and call it:
```typescript
import { testAPI } from '@/lib/testAPI';

// In your component or screen
testAPI();
```

This will test:
1. Health check endpoint
2. API health endpoint  
3. Login endpoint connectivity

## Next Steps

1. ✅ Verify backend server is running
2. ✅ Check MongoDB connection
3. ✅ Test API endpoints with curl/PowerShell
4. ✅ Verify IP address matches configuration
5. ✅ Run the test script from mobile app
6. ✅ Check console logs for detailed error messages

