import axios from 'axios';
import { ENV } from './env';

/**
 * Test API connectivity and endpoints
 */
export async function testAPI() {
  console.log('\n🔍 ===== TESTING API CONNECTION =====');
  console.log('API Base URL:', ENV.API_BASE_URL);
  console.log('');

  const results = {
    baseURL: ENV.API_BASE_URL,
    healthCheck: false,
    loginEndpoint: false,
    errors: [] as string[],
  };

  try {
    // Test 1: Health check endpoint
    console.log('1️⃣ Testing health check endpoint...');
    try {
      const apiOrigin = ENV.API_ORIGIN || ENV.API_BASE_URL;
      const healthUrl = `${apiOrigin}/health`;
      console.log('   URL:', healthUrl);
      const healthResponse = await axios.get(healthUrl, { timeout: 5000 });
      console.log('   ✅ Health check passed:', healthResponse.data);
      results.healthCheck = true;
    } catch (error: any) {
      const errorMsg = `Health check failed: ${error.message}`;
      console.log('   ❌', errorMsg);
      results.errors.push(errorMsg);
    }

    // Test 2: API health endpoint
    console.log('\n2️⃣ Testing API health endpoint...');
    try {
      const apiHealthUrl = `${ENV.API_BASE_URL}/health`;
      console.log('   URL:', apiHealthUrl);
      const apiHealthResponse = await axios.get(apiHealthUrl, { timeout: 5000 });
      console.log('   ✅ API health check passed:', apiHealthResponse.data);
      results.healthCheck = true;
    } catch (error: any) {
      const errorMsg = `API health check failed: ${error.message}`;
      console.log('   ❌', errorMsg);
      if (!results.errors.some(e => e.includes('health'))) {
        results.errors.push(errorMsg);
      }
    }

    // Test 3: Login endpoint (test with invalid credentials - should return 401)
    console.log('\n3️⃣ Testing login endpoint (should return 401 for invalid credentials)...');
    try {
      const loginUrl = `${ENV.API_BASE_URL}/auth/login`;
      console.log('   URL:', loginUrl);
      const loginResponse = await axios.post(
        loginUrl,
        { email: 'test@example.com', password: 'wrongpassword' },
        { timeout: 5000, validateStatus: (status) => status < 500 }
      );
      console.log('   ✅ Login endpoint is reachable');
      console.log('   Response status:', loginResponse.status);
      console.log('   Response data:', loginResponse.data);
      results.loginEndpoint = true;
      
      if (loginResponse.status === 401) {
        console.log('   ✅ Expected 401 response for invalid credentials');
      }
    } catch (error: any) {
      if (error.code === 'ERR_NETWORK') {
        const errorMsg = `Login endpoint unreachable: Network error - Server may not be running`;
        console.log('   ❌', errorMsg);
        results.errors.push(errorMsg);
      } else if (error.response) {
        // Server responded but with an error status
        console.log('   ✅ Login endpoint is reachable (server responded)');
        console.log('   Response status:', error.response.status);
        console.log('   Response data:', error.response.data);
        results.loginEndpoint = true;
      } else {
        const errorMsg = `Login endpoint test failed: ${error.message}`;
        console.log('   ❌', errorMsg);
        results.errors.push(errorMsg);
      }
    }

  } catch (error: any) {
    const errorMsg = `API test failed: ${error.message}`;
    console.log('❌', errorMsg);
    results.errors.push(errorMsg);
  }

  console.log('\n📊 ===== TEST RESULTS SUMMARY =====');
  console.log('Base URL:', results.baseURL);
  console.log('Health Check:', results.healthCheck ? '✅ PASS' : '❌ FAIL');
  console.log('Login Endpoint:', results.loginEndpoint ? '✅ PASS' : '❌ FAIL');
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }
  console.log('');

  return results;
}

