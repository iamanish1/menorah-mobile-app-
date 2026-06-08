import { Client } from '@stomp/stompjs';

export function createWS(token: string) {
  const client = new Client({ 
    brokerURL: 'wss://api.example.com/ws', 
    connectHeaders: { Authorization: `Bearer ${token}` } 
  });
  
  client.onConnect = () => { 
    /* client.subscribe('/topic/chat/123', msg => ...) */ 
  };
  
  return client;
}
