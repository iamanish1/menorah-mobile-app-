import { ENV } from './env';
import axios from 'axios';

export async function testAPIConnection() {
  try {
    console.log('Testing API connection to:', ENV.API_BASE_URL);
    
    const origin = ENV.API_ORIGIN || ENV.API_BASE_URL;

    const response = await axios.get(`${origin}/health`, {
      timeout: 5000,
    });
    
    console.log('✅ API Connection successful:', response.data);
    return { success: true, data: response.data };
  } catch (error: any) {
    console.error('❌ API Connection failed:', {
      url: ENV.API_BASE_URL,
      error: error.message,
      code: error.code,
      response: error.response?.data
    });
    
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
}

export async function testSocketConnection() {
  try {
    const origin = ENV.API_ORIGIN || ENV.API_BASE_URL;
    console.log('Testing Socket.IO connection to:', origin);
    
    // Test if the Socket.IO endpoint is accessible
    const response = await axios.get(`${origin}/socket.io/`, {
      timeout: 5000,
    });
    
    console.log('✅ Socket.IO endpoint accessible:', response.status);
    return { success: true, status: response.status };
  } catch (error: any) {
    console.error('❌ Socket.IO connection failed:', {
      url: ENV.API_BASE_URL,
      error: error.message,
      code: error.code
    });
    
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
}
