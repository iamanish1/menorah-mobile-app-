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
const WEBRTC_TRANSPORT = process.env.QA_WEBRTC_TRANSPORT || 'default';
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

if (!['default', 'relay', 'turn-tls'].includes(WEBRTC_TRANSPORT)) {
  throw new Error('QA_WEBRTC_TRANSPORT must be default, relay, or turn-tls');
}

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

  // Both web chat clients use REST to post and retrieve messages. Exercise
  // this path before the Socket.IO checks so a response-serialization failure
  // cannot be hidden by a successful socket delivery.
  const userRestMessage = `QA REST chat from user ${Date.now()}`;
  const userSend = await request('POST', `/api/chat/rooms/${roomId}/messages`, {
    token: userSession.token,
    body: { content: userRestMessage, type: 'text' },
  });
  if (userSend?.data?.message?.content !== userRestMessage) {
    fail('User REST chat send did not return the created message');
  }

  const counsellorHistory = await request('GET', `/api/chat/rooms/${roomId}/messages?page=1&limit=20`, {
    token: counsellorSession.token,
  });
  if (!counsellorHistory?.data?.messages?.some((message) => message?.content === userRestMessage)) {
    fail('Counsellor REST chat history did not include the user message');
  }

  const counsellorRestMessage = `QA REST chat from counsellor ${Date.now()}`;
  const counsellorSend = await request('POST', `/api/chat/rooms/${roomId}/messages`, {
    token: counsellorSession.token,
    body: { content: counsellorRestMessage, type: 'text' },
  });
  if (counsellorSend?.data?.message?.content !== counsellorRestMessage) {
    fail('Counsellor REST chat send did not return the created message');
  }

  const userHistory = await request('GET', `/api/chat/rooms/${roomId}/messages?page=1&limit=20`, {
    token: userSession.token,
  });
  if (!userHistory?.data?.messages?.some((message) => message?.content === counsellorRestMessage)) {
    fail('User REST chat history did not include the counsellor reply');
  }
  logPass('user and counsellor exchanged messages through the REST chat API');

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
  await page.evaluate((transportMode) => {
    const NativePeerConnection = window.RTCPeerConnection;
    window.__qaPeerConnections = [];
    window.__qaIceUrlSchemes = [];
    window.__qaIceUrls = [];
    window.__qaIceErrors = [];

    const prepareConfig = (originalConfig = {}) => {
      const config = { ...originalConfig };

      if (transportMode !== 'default') {
        config.iceTransportPolicy = 'relay';
      }

      if (Array.isArray(originalConfig.iceServers)) {
        config.iceServers = originalConfig.iceServers.map((server) => {
          const urls = Array.isArray(server.urls) ? server.urls : [server.urls].filter(Boolean);
          urls.forEach((url) => {
            const publicUrl = String(url);
            const scheme = publicUrl.split(':', 1)[0].toLowerCase();
            if (scheme) window.__qaIceUrlSchemes.push(scheme);
            if (/^turns?:/i.test(publicUrl)) window.__qaIceUrls.push(publicUrl);
          });
          const filteredUrls = transportMode === 'turn-tls'
            ? urls.filter((url) => String(url).toLowerCase().startsWith('turns:'))
            : urls;
          return {
            ...server,
            urls: Array.isArray(server.urls) ? filteredUrls : filteredUrls[0],
          };
        }).filter((server) => server.urls && (!Array.isArray(server.urls) || server.urls.length > 0));
      }
      return config;
    };

    window.RTCPeerConnection = new Proxy(NativePeerConnection, {
      construct(target, args) {
        const connection = Reflect.construct(target, [prepareConfig(args[0])]);
        const nativeSetConfiguration = connection.setConfiguration.bind(connection);
        connection.setConfiguration = (config) => nativeSetConfiguration(prepareConfig(config));
        connection.addEventListener('icecandidateerror', (event) => {
          window.__qaIceErrors.push({
            code: event.errorCode || null,
            urlScheme: String(event.url || '').split(':', 1)[0].toLowerCase() || null,
            url: /^turns?:/i.test(String(event.url || '')) ? String(event.url) : null,
          });
        });
        window.__qaPeerConnections.push(connection);
        return connection;
      },
    });
  }, WEBRTC_TRANSPORT);
  await page.addScriptTag({ content: livekitUmd });
  const available = await page.evaluate(() => Boolean(window.LivekitClient?.Room));
  if (!available) fail('LiveKit browser client did not initialise');
};

const getSelectedCandidateStats = async (page) => page.evaluate(async () => {
  const selectedPairs = [];
  for (const connection of window.__qaPeerConnections || []) {
    const report = await connection.getStats();
    const selectedIds = new Set();
    report.forEach((stat) => {
      if (stat.type === 'transport' && stat.selectedCandidatePairId) {
        selectedIds.add(stat.selectedCandidatePairId);
      }
    });
    report.forEach((stat) => {
      if (
        stat.type === 'candidate-pair'
        && stat.state === 'succeeded'
        && (selectedIds.has(stat.id) || stat.nominated || stat.selected)
      ) {
        const local = report.get(stat.localCandidateId);
        selectedPairs.push({
          candidateType: local?.candidateType || 'unknown',
          relayProtocol: local?.relayProtocol || null,
          bytesSent: Number(stat.bytesSent || 0),
          bytesReceived: Number(stat.bytesReceived || 0),
        });
      }
    });
  }
  return {
    selectedPairs,
    iceUrlSchemes: [...new Set(window.__qaIceUrlSchemes || [])],
  };
});

const connectLiveKit = async (page, { livekitUrl, token, publish }) => page.evaluate(async ({ url, joinToken, shouldPublish }) => {
  const { Room, RoomEvent } = window.LivekitClient;
  const room = new Room({ adaptiveStream: false, dynacast: false });
  window.__qaLivekit = { room, subscribed: [], localTracks: [] };
  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    window.__qaLivekit.subscribed.push({ kind: track.kind, identity: participant.identity });
  });
  try {
    await room.connect(url, joinToken);
  } catch (error) {
    return {
      connected: false,
      publishedTracks: 0,
      iceErrors: window.__qaIceErrors || [],
      iceUrls: [...new Set(window.__qaIceUrls || [])],
      message: error?.message || 'connection failed',
    };
  }
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
    iceErrors: window.__qaIceErrors || [],
    iceUrls: [...new Set(window.__qaIceUrls || [])],
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
    if (!counsellorConnection.connected) {
      fail(`Counsellor browser did not connect to the LiveKit room: ${JSON.stringify({ iceErrors: counsellorConnection.iceErrors || [], iceUrls: counsellorConnection.iceUrls || [] })}`);
    }

    // Ensure the receiver is established before the fake camera/microphone start publishing.
    await new Promise((resolve) => setTimeout(resolve, 750));
    const userConnection = await connectLiveKit(userPage, {
      livekitUrl: sessions.livekitUrl,
      token: sessions.userToken,
      publish: true,
    });
    if (!userConnection.connected || userConnection.publishedTracks < 2) {
      fail(`User browser did not publish the expected fake audio and video tracks: ${JSON.stringify({ iceErrors: userConnection.iceErrors || [], iceUrls: userConnection.iceUrls || [] })}`);
    }

    await counsellorPage.waitForFunction(
      () => window.__qaLivekit?.subscribed?.some((track) => track.kind === 'video'),
      { timeout: 25_000 },
    );
    logPass('LiveKit connected two browser participants and delivered a WebRTC video track');

    if (WEBRTC_TRANSPORT !== 'default') {
      const [userStats, counsellorStats] = await Promise.all([
        getSelectedCandidateStats(userPage),
        getSelectedCandidateStats(counsellorPage),
      ]);
      const selectedPairs = [...userStats.selectedPairs, ...counsellorStats.selectedPairs];
      const mediaPairs = selectedPairs.filter((pair) => pair.bytesSent > 0 || pair.bytesReceived > 0);
      console.log(`INFO: selected ICE paths ${JSON.stringify({
        candidateTypes: mediaPairs.map((pair) => pair.candidateType),
        relayProtocols: mediaPairs.map((pair) => pair.relayProtocol).filter(Boolean),
        iceUrlSchemes: [...new Set([...userStats.iceUrlSchemes, ...counsellorStats.iceUrlSchemes])],
      })}`);
      if (
        !mediaPairs.length
        || mediaPairs.some((pair) => pair.candidateType !== 'relay' && !pair.relayProtocol)
      ) {
        fail('WebRTC did not select TURN relay candidates exclusively');
      }
      if (WEBRTC_TRANSPORT === 'turn-tls') {
        const schemes = [...new Set([...userStats.iceUrlSchemes, ...counsellorStats.iceUrlSchemes])];
        if (!schemes.includes('turns')) {
          fail('LiveKit did not advertise a TURN/TLS URL');
        }
        const reportedProtocols = mediaPairs.map((pair) => pair.relayProtocol).filter(Boolean);
        if (reportedProtocols.some((protocol) => protocol !== 'tls')) {
          fail('TURN/TLS mode selected a non-TLS relay protocol');
        }
      }
      logPass(`LiveKit carried media over ${WEBRTC_TRANSPORT === 'turn-tls' ? 'TURN/TLS' : 'TURN relay'} candidates`);
    }
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
