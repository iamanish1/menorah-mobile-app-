import { ENV } from './env';
import axios from 'axios';

export async function testAuthEndpoint() {
  try {
    console.log('Testing auth endpoint at:', `${ENV.API_BASE_URL}/auth/login`);
    
    const response = await axios.post(`${ENV.API_BASE_URL}/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Auth endpoint accessible:', response.status);
    return { success: true, status: response.status, data: response.data };
  } catch (error: any) {
    console.error('❌ Auth endpoint test failed:', {
      url: `${ENV.API_BASE_URL}/auth/login`,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    return { 
      success: false, 
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    };
  }
}
