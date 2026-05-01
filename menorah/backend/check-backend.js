// Quick script to check if backend is accessible
const http = require('http');

const options = {
  hostname: '192.168.1.3',
  port: 3000,
  path: '/health',
  method: 'GET',
  timeout: 3000
};

console.log('Testing backend connection at http://192.168.1.3:3000/health...');

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data);
    if (res.statusCode === 200) {
      console.log('✅ Backend is accessible!');
    } else {
      console.log('⚠️ Backend responded but with status:', res.statusCode);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Backend connection error:', error.message);
  console.log('\nPossible issues:');
  console.log('1. Backend server is not running');
  console.log('2. Backend is running on a different IP/port');
  console.log('3. Firewall is blocking the connection');
  console.log('\nTo start the backend:');
  console.log('  cd Menorah/backend');
  console.log('  npm run dev');
});

req.on('timeout', () => {
  console.error('❌ Connection timeout - backend is not reachable');
  req.destroy();
});

req.end();

