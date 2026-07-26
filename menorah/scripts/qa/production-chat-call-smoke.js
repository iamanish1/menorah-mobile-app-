#!/usr/bin/env node

/*
 * Exercises public authenticated paths with short-lived fixture accounts.
 * Credentials, JWTs, LiveKit tokens, and emails are intentionally never logged.
 */

const fs = require('fs');
const path = require('path');
const { io } = require(path.resolve(__dirname, '../../user-web-app/node_modules/socket.io-client'));
const { chromium } = require('playwright');

const API_URL = (process.env.QA_API_WEB_URL || 'https://api-web.menorah.me').replace(/\/+$/, '');
// The host's public egress may be classified as UAE by Cloudflare. Use the
// loopback API for the India fixture so this test validates the intended
// LiveKit branch; browser media still uses the public calls hostname.
const CALL_API_URL = (process.env.QA_CALL_API_URL || API_URL).replace(/\/+$/, '');
const APP_URL = (process.env.QA_APP_URL || 'https://app.menorah.me').replace(/\/+$/, '');
const password = process.env.QA_PASSWORD;
const fixture = (() => {
  try {
    return JSON.parse(process.env.QA_FIXTURE_JSON || '');
  } catch {
    return null;
  }
})();
const livekitUmd = fs.readFileSync(
  path.resolve(__dirname, '../../user-web-app/node_modules/livekit-client/dist/livekit-client.umd.js'),
  'utf8',
);

const redact = (value) => String(value || '')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
  .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/g, 'Bearer [REDACTED_TOKEN]')
  .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[REDACTED_TOKEN]');

const logPass = (message) => console.log(`PASS: ${message}`);
const fail = (message) => { throw new Error(message); };

const request = async (method, pathname, { token, body, baseUrl = API_URL } = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok || json?.success === false) {
    fail(`${method} ${pathname} failed with HTTP ${response.status}: ${json?.message || 'unexpected response'}`);
  }
  return json;
};

const login = async (email) => {
  const payload = await request('POST', '/api/auth/login', { body: { email, password } });
  const token = payload?.data?.token;
  const user = payload?.data?.user;
  if (!token || !user?.id) fail('Login response did not contain the expected authenticated session');
  return { token, user };
};

const waitForSocketEvent = (socket, event, predicate, timeoutMs = 15_000) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    socket.off(event, handler);
    reject(new Error(`Timed out waiting for Socket.IO event ${event}`));
  }, timeoutMs);
  const handler = (payload) => {
    if (!predicate || predicate(payload)) {
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(payload);
    }
  };
  socket.on(event, handler);
});

const connectSocket = (token) => new Promise((resolve, reject) => {
  const socket = io(API_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    timeout: 15_000,
  });
  const timeout = setTimeout(() => {
    socket.disconnect();
    reject(new Error('Timed out connecting Socket.IO over WebSocket'));
  }, 15_000);
  socket.once('connect', () => {
    clearTimeout(timeout);
    resolve(socket);
  });
  socket.once('connect_error', (error) => {
    clearTimeout(timeout);
    socket.disconnect();
    reject(new Error(`Socket.IO connection failed: ${error.message}`));
  });
});

const runChatCheck = async ({ userSession, counsellorSession }) => {
  const chat = await request('POST', '/api/chat/start', {
    token: userSession.token,
    body: { counsellorId: fixture.counsellorId },
  });
  const roomId = chat?.data?.room?.roomId;
  if (!roomId) fail('Chat start did not return a room ID');
  logPass('authenticated user created a chat room with the QA counsellor');

  const [userSocket, counsellorSocket] = await Promise.all([
    connectSocket(userSession.token),
    connectSocket(counsellorSession.token),
  ]);

  try {
    userSocket.emit('join_room', roomId);
    counsellorSocket.emit('join_room', roomId);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const userMessage = `QA chat from user ${Date.now()}`;
    const receiveAtCounsellor = waitForSocketEvent(
      counsellorSocket,
      'new_message',
      (message) => message?.senderId === userSession.user.id && message?.content === userMessage,
    );
    userSocket.emit('send_message', { roomId, content: userMessage, type: 'text' });
    await receiveAtCounsellor;
    logPass('Socket.IO delivered the user message to the counsellor');

    const counsellorMessage = `QA chat from counsellor ${Date.now()}`;
    const receiveAtUser = waitForSocketEvent(
      userSocket,
      'new_message',
      (message) => message?.senderId === counsellorSession.user.id && message?.content === counsellorMessage,
    );
    counsellorSocket.emit('send_message', { roomId, content: counsellorMessage, type: 'text' });
    await receiveAtUser;
    logPass('Socket.IO delivered the counsellor reply to the user');
  } finally {
    userSocket.disconnect();
    counsellorSocket.disconnect();
  }
};

const prepareLiveKitSessions = async ({ userSession, counsellorSession }) => {
  const counsellorJoin = await request('POST', `/api/video/room/${fixture.bookingId}/join`, {
    token: counsellorSession.token,
    baseUrl: CALL_API_URL,
  });
  const userJoin = await request('POST', `/api/video/room/${fixture.bookingId}/join`, {
    token: userSession.token,
    baseUrl: CALL_API_URL,
  });

  const counsellorCall = counsellorJoin?.data || counsellorJoin;
  const userCall = userJoin?.data || userJoin;
  if (
    counsellorCall?.provider !== 'livekit'
    || userCall?.provider !== 'livekit'
    || !counsellorCall?.livekitUrl
    || !counsellorCall?.token
    || !userCall?.token
    || counsellorCall.livekitUrl !== userCall.livekitUrl
  ) {
    fail('Video API did not return matching LiveKit sessions for both participants');
  }

  logPass('user and counsellor received valid LiveKit room sessions through the booking API');
  return { livekitUrl: counsellorCall.livekitUrl, counsellorToken: counsellorCall.token, userToken: userCall.token };
};

const addLiveKitToPage = async (page) => {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.addScriptTag({ content: livekitUmd });
  const available = await page.evaluate(() => Boolean(window.LivekitClient?.Room));
  if (!available) fail('LiveKit browser client did not initialise');
};

const connectLiveKit = async (page, { livekitUrl, token, publish }) => page.evaluate(async ({ url, joinToken, shouldPublish }) => {
  const { Room, RoomEvent } = window.LivekitClient;
  const room = new Room({ adaptiveStream: false, dynacast: false });
  window.__qaLivekit = { room, subscribed: [], localTracks: [] };
  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    window.__qaLivekit.subscribed.push({ kind: track.kind, identity: participant.identity });
  });
  await room.connect(url, joinToken);
  if (shouldPublish) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    for (const track of stream.getTracks()) {
      await room.localParticipant.publishTrack(track);
      window.__qaLivekit.localTracks.push(track);
    }
  }
  return {
    connected: room.state === 'connected',
    publishedTracks: room.localParticipant.trackPublications.size,
  };
}, { url: livekitUrl, joinToken: token, shouldPublish: publish });

const disconnectLiveKit = async (page) => {
  await page.evaluate(() => {
    const state = window.__qaLivekit;
    state?.localTracks?.forEach((track) => track.stop());
    state?.room?.disconnect();
  }).catch(() => {});
};

const runWebRtcCheck = async (sessions) => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const userContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const counsellorContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const userPage = await userContext.newPage();
  const counsellorPage = await counsellorContext.newPage();

  try {
    await Promise.all([addLiveKitToPage(userPage), addLiveKitToPage(counsellorPage)]);
    const counsellorConnection = await connectLiveKit(counsellorPage, {
      livekitUrl: sessions.livekitUrl,
      token: sessions.counsellorToken,
      publish: false,
    });
    if (!counsellorConnection.connected) fail('Counsellor browser did not connect to the LiveKit room');

    // Ensure the receiver is established before the fake camera/microphone start publishing.
    await new Promise((resolve) => setTimeout(resolve, 750));
    const userConnection = await connectLiveKit(userPage, {
      livekitUrl: sessions.livekitUrl,
      token: sessions.userToken,
      publish: true,
    });
    if (!userConnection.connected || userConnection.publishedTracks < 2) {
      fail('User browser did not publish the expected fake audio and video tracks');
    }

    await counsellorPage.waitForFunction(
      () => window.__qaLivekit?.subscribed?.some((track) => track.kind === 'video'),
      { timeout: 25_000 },
    );
    logPass('LiveKit connected two browser participants and delivered a WebRTC video track');
  } finally {
    await Promise.all([disconnectLiveKit(userPage), disconnectLiveKit(counsellorPage)]);
    await Promise.all([userContext.close(), counsellorContext.close()]);
    await browser.close();
  }
};

const main = async () => {
  if (!fixture?.runId?.startsWith('qa-chat-call-') || !fixture.userEmail || !fixture.counsellorEmail || !password) {
    fail('Missing QA fixture or QA password');
  }

  const [userSession, counsellorSession] = await Promise.all([
    login(fixture.userEmail),
    login(fixture.counsellorEmail),
  ]);
  if (userSession.user.role !== 'user' || counsellorSession.user.role !== 'counsellor') {
    fail('QA fixture accounts did not authenticate with the expected roles');
  }
  logPass('temporary user and counsellor authenticated through the public API');

  await runChatCheck({ userSession, counsellorSession });
  const livekitSessions = await prepareLiveKitSessions({ userSession, counsellorSession });
  await runWebRtcCheck(livekitSessions);
  console.log('PASS: authenticated production chat and LiveKit WebRTC smoke completed');
};

main().catch((error) => {
  console.error(`FAIL: ${redact(error.message || error)}`);
  process.exit(1);
});
