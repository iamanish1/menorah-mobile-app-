# Expo Go Performance Optimization Guide

## 🐌 Why Expo Go Loads Slowly

Expo Go is a general-purpose development client that includes many features you don't need, making it slower than a custom development build. Here's how to fix it:

## 🚀 Quick Solutions (Try These First)

### 1. **Use Tunnel Mode** (Most Effective)
```bash
npm run start:fast
```
- Tunnel mode often provides better connectivity than LAN mode
- Works better across different networks
- Reduces connection issues

### 2. **Clear All Caches**
```bash
npm run reset
```
- Clears Metro cache, node_modules, and reinstalls dependencies
- Fixes most caching-related issues

### 3. **Use Production Mode**
```bash
npm run start:optimized
```
- Removes development overhead
- Faster bundle compilation
- Better performance

## 🔧 Advanced Optimizations

### 1. **Create a Development Build** (Recommended)
Instead of using Expo Go, create a custom development build:

```bash
# Install development client
npx expo install expo-dev-client

# Build for Android
npx expo run:android

# Build for iOS
npx expo run:ios
```

**Benefits:**
- Much faster loading
- Only includes features you need
- Better debugging capabilities
- More stable performance

### 2. **Optimize Dependencies**

#### Remove Heavy Dependencies
Consider removing or lazy-loading these heavy packages:
- `@stomp/stompjs` (WebSocket) - Load only when chat is used
- `i18next` + `react-i18next` - Load only when language changes
- `date-fns` + `date-fns-tz` - Load only when date formatting is needed
- `react-hook-form` + `zod` - Load only when forms are used

#### Use Lazy Loading
```typescript
// Instead of importing at the top
import { format } from 'date-fns';

// Use dynamic import
const formatDate = async (date: Date) => {
  const { format } = await import('date-fns');
  return format(date, 'yyyy-MM-dd');
};
```

### 3. **Bundle Size Optimization**

#### Enable Tree Shaking
```javascript
// babel.config.js
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    // Remove unused code
    ['transform-remove-console', { exclude: ['error', 'warn'] }],
    ['babel-plugin-transform-remove-undefined', { tdz: true }],
  ],
};
```

#### Optimize Images
- Use WebP format for images
- Compress images before adding to assets
- Use appropriate image sizes

### 4. **Network Optimization**

#### Check Network Connection
- Ensure both devices are on the same network
- Try switching between WiFi and mobile data
- Check firewall settings

#### Use Better Connection Mode
```bash
# Try different connection modes
npm run start:fast        # Tunnel mode
npm run start:local       # LAN mode
npm start                 # Auto mode
```

## 📊 Performance Monitoring

### 1. **Bundle Analysis**
```bash
npm run optimize
```
This will show you:
- Bundle size analysis
- Performance recommendations
- Optimization tips

### 2. **Load Time Monitoring**
The app now includes performance monitoring that logs:
- Feature load times
- Bundle compilation time
- Network request times

## 🔍 Troubleshooting Steps

### Step 1: Basic Checks
1. **Restart Expo Go app** on your device
2. **Restart development server**: `Ctrl+C` then `npm start`
3. **Check internet connection**
4. **Close other apps** on your device

### Step 2: Clear Caches
```bash
# Clear Metro cache
npx expo start --clear

# Clear all caches and reinstall
npm run reset
```

### Step 3: Try Different Modes
```bash
# Tunnel mode (often fastest)
npm run start:fast

# Local network mode
npm run start:local

# Production mode
npm run start:optimized
```

### Step 4: Network Diagnostics
```bash
# Run network diagnostics
npm run diagnose
```

### Step 5: Create Development Build
If Expo Go is still slow, create a custom development build:
```bash
npx expo install expo-dev-client
npx expo run:android  # or run:ios
```

## 🎯 Expected Performance Improvements

After implementing these optimizations:

| Optimization | Expected Improvement |
|--------------|---------------------|
| Tunnel Mode | 20-40% faster loading |
| Cache Clearing | 10-30% faster loading |
| Production Mode | 15-25% faster loading |
| Development Build | 50-80% faster loading |
| Lazy Loading | 10-20% faster initial load |
| Bundle Optimization | 5-15% smaller bundle |

## 🚨 Common Issues and Solutions

### Issue: "Metro bundler is taking too long"
**Solution:**
```bash
npm run reset
npm run start:fast
```

### Issue: "Connection timeout"
**Solution:**
- Try tunnel mode: `npm run start:fast`
- Check firewall settings
- Try different network

### Issue: "Bundle size too large"
**Solution:**
```bash
npm run optimize
# Follow the recommendations for lazy loading
```

### Issue: "Expo Go crashes"
**Solution:**
- Restart Expo Go app
- Clear app cache on device
- Try development build instead

## 📱 Device-Specific Tips

### Android
- Enable USB debugging
- Use USB connection when possible
- Clear app data if needed

### iOS
- Use Safari for debugging
- Enable developer mode
- Trust the development certificate

## 🔄 Alternative Solutions

### 1. **Use Expo Development Build**
```bash
npx expo install expo-dev-client
npx expo run:android
```

### 2. **Use Web Version for Testing**
```bash
npm run web
```

### 3. **Use Physical Device Instead of Simulator**
Physical devices often perform better than simulators.

## 📞 Getting Help

If you're still experiencing issues:

1. **Run diagnostics**: `npm run diagnose`
2. **Check optimization guide**: `npm run optimize`
3. **Review this guide** for specific solutions
4. **Contact support** with:
   - Device information
   - Network details
   - Error messages
   - Performance metrics

---

**Remember**: Expo Go is designed for quick prototyping. For better performance, consider using a development build or production build for testing.
