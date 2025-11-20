# Authentication System Troubleshooting Guide

## 🚨 **Current Issue: Network Errors**

Your authentication system is getting **Network Errors** when trying to connect to the API server:

```
ERROR  API Request Error: {"code": "ERR_NETWORK", "error": "Network Error", "method": "POST", "response": undefined, "url": "/auth/login"}
```

## 🔍 **Root Cause**

The **API server is not running** or **not accessible** from your mobile device.

## 🚀 **Step-by-Step Solutions**

### **Step 1: Check API Server Status**

Run this command to check if your API server is running:

```bash
npm run check-api
```

This will test multiple possible API endpoints and tell you which ones are working.

### **Step 2: Start Your API Server**

If the API server is not running, start it:

```bash
# Navigate to your backend directory
cd ../backend  # or wherever your API server is located

# Start the server
npm start      # or whatever command starts your API server
```

**Expected Output:**
```
Server running on https://app-api.menorahhealth.app
API endpoints available at https://app-api.menorahhealth.app/api
```

### **Step 3: Verify Network Configuration**

Your app is configured to connect to: `https://app-api.menorahhealth.app/api`

Make sure:
1. **Your computer's IP is correct** - Check with `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. **Both devices are on the same network** - Phone and computer should be on the same WiFi
3. **Firewall allows connections** - Windows Firewall might be blocking port 3000

### **Step 4: Test API Endpoints**

Once your server is running, test these endpoints in your browser:

- `https://app-api.menorahhealth.app/health`
- `https://app-api.menorahhealth.app/api`

### **Step 5: Update API Configuration (If Needed)**

If your API server is running on a different IP or port, update the configuration:

**Option A: Environment Variable**
```bash
# Create a .env file in your project root
echo "API_BASE_URL=https://app-api.menorahhealth.app/api" > .env
```

**Option B: Update app.config.ts**
```typescript
extra: {
  API_BASE_URL: process.env.API_BASE_URL ?? 'https://app-api.menorahhealth.app/api',
  // ...
}
```

### **Step 6: Restart the App**

After starting the API server:

1. **Restart the development server:**
   ```bash
   npm start
   ```

2. **Reload the app** on your device

3. **Try logging in again**

## 🔧 **Alternative Solutions**

### **Solution A: Use Tunnel Mode**

If local network doesn't work, try tunnel mode:

```bash
npm run start:fast
```

### **Solution B: Use Localhost (Simulator Only)**

If using iOS Simulator or Android Emulator:

```typescript
// In app.config.ts
API_BASE_URL: process.env.API_BASE_URL ?? 'https://app-api.menorahhealth.app/api',
```

### **Solution C: Use Your Computer's IP**

Find your computer's IP address and use it:

```bash
# Windows
ipconfig

# Mac/Linux
ifconfig
```

Then update the API URL only if directed by the backend team.

## 📱 **Device-Specific Tips**

### **Android**
- Enable USB debugging
- Use USB connection when possible
- Check if mobile data is interfering

### **iOS**
- Use Safari for debugging
- Check network settings
- Try switching between WiFi and mobile data

## 🚨 **Common Issues and Fixes**

### **Issue: "Connection refused"**
**Solution:** API server is not running - start it

### **Issue: "Timeout"**
**Solution:** 
- Check firewall settings
- Try different network
- Use tunnel mode

### **Issue: "Cannot resolve hostname"**
**Solution:** 
- Check IP address is correct
- Ensure both devices on same network
- Try using localhost for simulator

### **Issue: "CORS error"**
**Solution:** 
- Configure CORS on your API server
- Add your app's domain to allowed origins

## ✅ **Verification Steps**

After implementing the solution:

1. **API server is running** ✅
2. **Can access API from browser** ✅
3. **App can connect to API** ✅
4. **Login/Register works** ✅

## 📞 **Getting Help**

If you're still having issues:

1. **Run diagnostics:** `npm run diagnose`
2. **Check API status:** `npm run check-api`
3. **Check network:** `npm run optimize`
4. **Review this guide** for specific solutions

---

**Remember:** The authentication code is working correctly. The issue is that the API server needs to be running and accessible from your mobile device.
