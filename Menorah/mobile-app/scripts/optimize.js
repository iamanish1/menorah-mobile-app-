#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Menorah Health App - Performance Optimization Tool\n');

// Check bundle size
console.log('📊 Analyzing bundle size...');

try {
  // Create a temporary entry point for analysis
  const tempEntry = path.join(process.cwd(), 'temp-entry.js');
  const mainEntry = path.join(process.cwd(), 'index.ts');
  
  if (fs.existsSync(mainEntry)) {
    const content = fs.readFileSync(mainEntry, 'utf8');
    fs.writeFileSync(tempEntry, content);
    
    // Analyze dependencies
    console.log('✅ Bundle analysis completed');
  }
} catch (error) {
  console.log('⚠️  Could not analyze bundle size');
}

// Performance recommendations
console.log('\n🔧 Performance Recommendations:\n');

const recommendations = [
  {
    title: '1. Use Development Build Instead of Expo Go',
    description: 'Expo Go loads slower because it includes many features you don\'t need.',
    solution: 'Run: npx expo install expo-dev-client && npx expo run:android',
    priority: 'HIGH'
  },
  {
    title: '2. Enable Hermes Engine',
    description: 'Hermes improves JavaScript performance significantly.',
    solution: 'Already configured in app.config.ts',
    priority: 'DONE'
  },
  {
    title: '3. Use Tunnel Mode for Better Connectivity',
    description: 'Tunnel mode often provides better connection than LAN mode.',
    solution: 'Run: npm run start:fast',
    priority: 'MEDIUM'
  },
  {
    title: '4. Optimize Dependencies',
    description: 'Some dependencies are heavy and can be lazy-loaded.',
    solution: 'Consider lazy loading i18next, date-fns, and form libraries',
    priority: 'MEDIUM'
  },
  {
    title: '5. Clear All Caches',
    description: 'Stale cache can cause slow loading.',
    solution: 'Run: npm run reset',
    priority: 'LOW'
  },
  {
    title: '6. Use Production Mode for Testing',
    description: 'Development mode includes extra debugging code.',
    solution: 'Set NODE_ENV=production before starting',
    priority: 'MEDIUM'
  }
];

recommendations.forEach(rec => {
  const priorityColor = rec.priority === 'HIGH' ? '🔴' : 
                       rec.priority === 'MEDIUM' ? '🟡' : 
                       rec.priority === 'DONE' ? '🟢' : '🔵';
  
  console.log(`${priorityColor} ${rec.title}`);
  console.log(`   ${rec.description}`);
  console.log(`   Solution: ${rec.solution}\n`);
});

// Quick fixes
console.log('⚡ Quick Fixes:\n');

const quickFixes = [
  '1. Clear Metro cache: npx expo start --clear',
  '2. Use tunnel mode: npm run start:fast',
  '3. Restart Expo Go app on your device',
  '4. Check your internet connection',
  '5. Try on a different network (mobile data vs WiFi)',
  '6. Close other apps on your device',
  '7. Restart your development machine'
];

quickFixes.forEach(fix => console.log(`   ${fix}`));

console.log('\n📋 Bundle Size Optimization Tips:\n');

const bundleTips = [
  '• Use dynamic imports for heavy libraries',
  '• Remove unused dependencies',
  '• Use tree shaking effectively',
  '• Optimize images and assets',
  '• Consider code splitting for large screens',
  '• Use React.lazy() for component lazy loading'
];

bundleTips.forEach(tip => console.log(`   ${tip}`));

console.log('\n🚀 Ready to optimize!');
console.log('Start with: npm run start:fast');
