# Troubleshooting Slow Loading in Expo Go

## Quick Fixes

### 1. Clear Cache and Restart
```bash
# Stop the current server (Ctrl+C)
npx expo start --clear
```

### 2. Use Tunnel Mode (Recommended)
```bash
npx expo start --tunnel
```

### 3. Use Local Network
```bash
npx expo start --localhost
```

### 4. Reset Everything
```bash
npm run reset
```

## Common Issues and Solutions

### Issue: App takes too long to load in Expo Go

**Solutions:**
1. **Network Issues**: Make sure your phone and computer are on the same WiFi network
2. **Firewall**: Check if your firewall is blocking the connection
3. **Antivirus**: Temporarily disable antivirus to test
4. **VPN**: Disable VPN if you're using one

### Issue: Bundle takes too long to build

**Solutions:**
1. **Clear Metro Cache**: `npx expo start --clear`
2. **Restart Development Server**: Stop and restart the server
3. **Check Network**: Use tunnel mode for better connectivity

### Issue: Expo Go crashes or freezes

**Solutions:**
1. **Update Expo Go**: Make sure you have the latest version
2. **Restart Expo Go**: Close and reopen the app
3. **Clear Expo Go Cache**: In Expo Go settings, clear cache
4. **Restart Phone**: Sometimes a phone restart helps

## Performance Optimizations Applied

### 1. Bundle Size Optimization
- Added metro configuration for better bundling
- Optimized babel configuration
- Added lazy loading for components

### 2. Network Optimization
- Added tunnel mode support
- Optimized API caching
- Reduced unnecessary re-renders

### 3. Development Optimizations
- Disabled development warnings for better performance
- Added proper error boundaries
- Optimized React Query configuration

## Testing Steps

1. **Start with tunnel mode**:
   ```bash
   npm run start:fast
   ```

2. **If still slow, try local network**:
   ```bash
   npm run start:local
   ```

3. **Check your network connection**:
   - Make sure both devices are on same WiFi
   - Try turning off mobile data on your phone
   - Check if your WiFi has restrictions

4. **Monitor the terminal**:
   - Look for any error messages
   - Check if the bundle is building properly
   - Monitor network requests

## Alternative Solutions

### Use Expo Development Build
If Expo Go continues to be slow, consider creating a development build:

```bash
npx expo install expo-dev-client
npx expo run:android  # or run:ios
```

### Use Web Version for Testing
```bash
npm run web
```

## Still Having Issues?

1. Check the Expo documentation: https://docs.expo.dev/
2. Try the Expo Discord community
3. Check if there are any known issues with your Expo SDK version
4. Consider downgrading to a stable version if needed
