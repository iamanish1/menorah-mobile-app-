#!/usr/bin/env node

const http = require('http');
const https = require('https');

console.log('🔍 Checking API Server Status...\n');

// Check different possible API URLs
const apiUrls = [
  'http://localhost:3000/api/health',
  'http://localhost:3000/api',
  'http://127.0.0.1:3000/api/health',
  'http://192.168.1.3:3000/api/health', // Your local IP
];

async function checkApi(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, (res) => {
      console.log(`✅ ${url} - Status: ${res.statusCode}`);
      resolve({ url, status: res.statusCode, working: true });
    });
    
    req.on('error', (err) => {
      console.log(`❌ ${url} - Error: ${err.message}`);
      resolve({ url, error: err.message, working: false });
    });
    
    req.setTimeout(5000, () => {
      console.log(`⏰ ${url} - Timeout`);
      req.destroy();
      resolve({ url, error: 'Timeout', working: false });
    });
  });
}

async function checkAllApis() {
  console.log('Testing API endpoints...\n');
  
  const results = await Promise.all(apiUrls.map(checkApi));
  
  console.log('\n📊 Results Summary:');
  const working = results.filter(r => r.working);
  const notWorking = results.filter(r => !r.working);
  
  if (working.length > 0) {
    console.log(`✅ ${working.length} API endpoint(s) are working:`);
    working.forEach(r => console.log(`   - ${r.url}`));
  }
  
  if (notWorking.length > 0) {
    console.log(`❌ ${notWorking.length} API endpoint(s) are not working:`);
    notWorking.forEach(r => console.log(`   - ${r.url}: ${r.error}`));
  }
  
  console.log('\n🔧 Recommendations:');
  
  if (working.length === 0) {
    console.log('1. Start your API server:');
    console.log('   cd ../backend  # or your API directory');
    console.log('   npm start      # or your start command');
    console.log('');
    console.log('2. Check if the server is running on the correct port');
    console.log('3. Verify firewall settings');
    console.log('4. Make sure both devices are on the same network');
  } else {
    console.log('✅ API server is running! The issue might be with the app configuration.');
  }
}

checkAllApis().catch(console.error);
