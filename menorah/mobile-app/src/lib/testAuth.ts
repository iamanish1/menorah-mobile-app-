import { ENV } from './env';
import axios from 'axios';

export async function testAuthEndpoint() {
  try {
    if (__DEV__) {
      console.log('Testing auth endpoint at:', `${ENV.API_BASE_URL}/auth/login`);
    }

    const response = await axios.post(`${ENV.API_BASE_URL}/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (__DEV__) {
      console.log('✅ Auth endpoint accessible:', response.status);
    }
    return { success: true, status: response.status, data: response.data };
  } catch (error: any) {
    if (__DEV__) {
      console.error('❌ Auth endpoint test failed:', {
        error: error.message,
        status: error.response?.status,
      });
    }

    return {
      success: false,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    };
  }
}
