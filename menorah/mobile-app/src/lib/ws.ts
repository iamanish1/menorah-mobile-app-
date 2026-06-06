import { Client } from '@stomp/stompjs';
import { ENV } from './env';

export function createWS(token: string) {
  const apiOrigin = ENV.API_ORIGIN || ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  const brokerURL = apiOrigin.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws';

  const client = new Client({ 
    brokerURL,
    connectHeaders: { Authorization: `Bearer ${token}` } 
  });
  
  client.onConnect = () => { 
    /* client.subscribe('/topic/chat/123', msg => ...) */ 
  };
  
  return client;
}
