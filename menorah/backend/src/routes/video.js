const express = require('express');
const crypto = require('crypto');
const { body, param, query, validationResult } = require('express-validator');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
// Note: VideoGrant was removed in livekit-server-sdk v2. Grant options are passed
// as a plain object to token.addGrant() instead.
const Booking = require('../models/Booking');
const { auth } = require('../middleware/auth');
const { getRedisClient } = require('../config/redis');
const {
  assertLiveKitAllowed,
  providerDisplayName,
  resolveCallPolicy
} = require('../services/callPolicyService');
const {
  evaluateCallAccess,
} = require('../services/sessionAuthorizationPolicy');
const { recordSecurityEvent } = require('../utils/securityAudit');
const {
  recordCallMediaOutcome,
  recordCallProviderOperation,
} = require('../utils/reliabilityMetrics');

const router = express.Router();
const configuredMeetTicketTtl = Number(process.env.VIDEO_MEET_TICKET_TTL_SECONDS);
const MEET_TICKET_TTL_SECONDS = Number.isSafeInteger(configuredMeetTicketTtl)
  ? Math.min(Math.max(configuredMeetTicketTtl, 30), 300)
  : 120;

// ── LiveKit client (server-to-server API calls) ────────────────────────────
// LIVEKIT_API_URL  = https://calls.menorah.me  (HTTP, for room management)
// LIVEKIT_URL      = wss://calls.menorah.me    (WebSocket, returned to clients)
const getLivekitClient = () => {
  const apiUrl    = process.env.LIVEKIT_API_URL;
  const apiKey    = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiUrl || !apiKey || !apiSecret) {
    throw new Error('LiveKit is not configured. Set LIVEKIT_API_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.');
  }
  return new RoomServiceClient(apiUrl, apiKey, apiSecret);
};

// Generate a LiveKit participant JWT token.
// identity  = unique string per participant (userId)
// name      = display name shown in the call
// roomName  = LiveKit room name
// isModerator = counsellors are moderators (can remove participants)
const generateLivekitToken = async (identity, name, roomName, isModerator = false, guardInput = {}) => {
  assertLiveKitAllowed(guardInput);

  const apiKey    = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('LiveKit API key/secret not configured.');
  }

  const tokenExpiresAt = guardInput.tokenExpiresAt instanceof Date
    ? guardInput.tokenExpiresAt
    : null;
  const remainingSeconds = tokenExpiresAt
    ? Math.ceil((tokenExpiresAt.getTime() - Date.now()) / 1000)
    : null;
  const ttl = Number.isSafeInteger(remainingSeconds)
    ? Math.min(Math.max(remainingSeconds, 1), 4 * 60 * 60)
    : '4h';

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
    ttl,
  });

  // In livekit-server-sdk v2, addGrant() accepts a plain VideoGrant object —
  // the VideoGrant class was removed; all properties are passed directly.
  token.addGrant({
    roomJoin:       true,
    room:           roomName,
    canPublish:     true,        // publish audio/video
    canSubscribe:   true,        // receive audio/video
    canPublishData: true,        // data channel (chat)
    roomAdmin:      isModerator, // counsellors can mute/remove participants
  });

  try {
    const signedToken = await token.toJwt();
    recordCallProviderOperation({
      provider: 'livekit',
      operation: 'token_create',
      outcome: 'success',
    });
    return signedToken;
  } catch (error) {
    recordCallProviderOperation({
      provider: 'livekit',
      operation: 'token_create',
      outcome: 'failure',
    });
    throw error;
  }
};

const hashMeetTicket = (ticket) =>
  crypto.createHash('sha256').update(ticket).digest('hex');

const meetTicketKey = (ticket) => `video:meet-ticket:${hashMeetTicket(ticket)}`;
const mediaTelemetryKey = (token) =>
  `video:media-telemetry:${hashMeetTicket(token)}`;

const createMeetTicket = async ({
  livekitToken,
  livekitUrl,
  name,
  type,
  bookingId,
  participantId,
}) => {
  const ticket = crypto.randomBytes(32).toString('base64url');
  const payload = {
    livekitToken,
    livekitUrl,
    name: String(name || 'Participant').slice(0, 80),
    type: type === 'audio' ? 'audio' : 'video',
    bookingId: String(bookingId || ''),
    participantId: String(participantId || ''),
    createdAt: new Date().toISOString(),
  };

  await getRedisClient().setEx(meetTicketKey(ticket), MEET_TICKET_TTL_SECONDS, JSON.stringify(payload));
  return ticket;
};

const redeemMeetTicket = async (ticket) => {
  if (!ticket || typeof ticket !== 'string') return null;
  const redis = getRedisClient();
  const key = meetTicketKey(ticket);
  let raw = null;

  if (typeof redis.getDel === 'function') {
    raw = await redis.getDel(key);
  } else if (typeof redis.eval === 'function') {
    raw = await redis.eval(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      { keys: [key], arguments: [] }
    );
  } else {
    throw new Error('Atomic video ticket consumption is unavailable');
  }

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const createMediaTelemetryToken = async (media) => {
  const token = crypto.randomBytes(32).toString('base64url');
  await getRedisClient().setEx(
    mediaTelemetryKey(token),
    MEET_TICKET_TTL_SECONDS,
    media === 'audio' ? 'audio' : 'video'
  );
  return token;
};

const consumeMediaTelemetryToken = async (token) => {
  if (!token || typeof token !== 'string') return null;
  const redis = getRedisClient();
  const key = mediaTelemetryKey(token);
  if (typeof redis.getDel === 'function') return redis.getDel(key);
  if (typeof redis.eval === 'function') {
    return redis.eval(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      { keys: [key], arguments: [] }
    );
  }
  throw new Error('Atomic media telemetry token consumption is unavailable');
};

const buildMeetUrl = (req, ticket, type = 'video') => {
  const origin = process.env.PUBLIC_API_ORIGIN
    || `${req.protocol}://${req.get('host')}`;
  const url = new URL('/api/video/meet', origin);
  url.searchParams.set('type', type === 'audio' ? 'audio' : 'video');
  // Keep the bearer ticket in the URL fragment so browsers do not send it in
  // the HTTP request line, reverse-proxy logs, or Referer headers.
  url.hash = new URLSearchParams({ ticket }).toString();
  return url.toString();
};

const originFromUrl = (value) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const getMeetPageConnectSrc = () => {
  const origins = new Set(["'self'"]);
  [process.env.LIVEKIT_URL, process.env.LIVEKIT_API_URL].forEach((value) => {
    const origin = originFromUrl(value);
    if (origin) origins.add(origin);
  });

  const callsDomain = process.env.CALLS_DOMAIN;
  if (callsDomain) {
    origins.add(`https://${callsDomain}`);
    origins.add(`wss://${callsDomain}`);
  }

  return Array.from(origins);
};

// ── Helper: load and authorise booking ────────────────────────────────────
const loadBooking = async (bookingId, requestUserId) => {
  const booking = await Booking.findById(bookingId)
    .populate({
      path: 'counsellor',
      select: 'user status isActive professionalVerification',
      populate: {
        path: 'user',
        select: 'firstName lastName phone address country accountRegion region role isActive',
      },
    })
    .populate(
      'user',
      'firstName lastName phone address country accountRegion region role isActive'
    );

  if (!booking) return { booking: null, isUser: false, isCounsellor: false, error: 'Booking not found' };

  const isUser = booking.user?._id?.toString?.() === requestUserId.toString();
  const isCounsellor =
    booking.counsellor?.user?._id?.toString?.() === requestUserId.toString();

  return { booking, isUser, isCounsellor, error: null };
};

const callDenialResponse = (reason) => {
  if (reason === 'CALL_TOO_EARLY') {
    return {
      statusCode: 409,
      code: reason,
      message: 'The session join window has not opened yet',
    };
  }
  if (reason === 'CALL_TOO_LATE') {
    return {
      statusCode: 410,
      code: reason,
      message: 'The session join window has closed',
    };
  }
  if (reason === 'BOOKING_PARTICIPANT_MISMATCH') {
    return { statusCode: 403, code: reason, message: 'Access denied' };
  }
  return {
    statusCode: 403,
    code: reason,
    message: 'This session is not currently available',
  };
};

const recordCallDenial = (
  req,
  reason,
  bookingId,
  user = req.user,
  statusCode = callDenialResponse(reason).statusCode
) => {
  try {
    recordSecurityEvent('call_authorization_denied', {
      req,
      user,
      outcome: 'failure',
      statusCode,
      details: {
        reason,
        resource: 'booking_call',
        targetId: bookingId,
      },
    });
    if (req?.res?.locals) req.res.locals.securityAuthorizationLogged = true;
  } catch {
    // The request still fails closed if audit output is unavailable.
  }
};

const authorizeLoadedCall = ({ req, res, booking, requesterUserId = req.user?._id }) => {
  const access = evaluateCallAccess({
    booking,
    requesterUserId,
    now: new Date(),
  });
  if (access.allowed) return access;

  const denial = callDenialResponse(access.reason);
  recordCallDenial(req, access.reason, booking?._id || req.params?.bookingId || req.body?.bookingId);
  res.locals.securityAuthorizationLogged = true;
  res.status(denial.statusCode).json({
    success: false,
    code: denial.code,
    message: denial.message,
  });
  return null;
};

const buildGuardInput = (req, booking, access) => ({
  user: booking.user,
  booking,
  tokenExpiresAt: access?.closesAt,
  req: {
    clientCountry: req.clientCountry,
    user: req.user
  }
});

const updateBookingPolicy = async (booking, policy) => {
  booking.videoCall = booking.videoCall || {};
  const configuredExternalProvider = policy.joinMode === 'external_link'
    && booking.videoCall.provider
    && !['livekit', 'disabled'].includes(booking.videoCall.provider);
  booking.videoCall.provider = configuredExternalProvider ? booking.videoCall.provider : policy.provider;
  booking.videoCall.joinMode = policy.joinMode;
  booking.videoCall.region = policy.region;
  booking.videoCall.policyReason = policy.reason;
  booking.videoCall.lastPolicyCheckAt = new Date();

  if (policy.joinMode === 'disabled') {
    booking.videoCall.status = 'disabled';
  } else if (policy.joinMode === 'external_link' && !booking.videoCall.externalJoinUrl) {
    booking.videoCall.status = 'not_configured';
  } else if (policy.joinMode === 'external_link') {
    booking.videoCall.status = 'ready';
  }
};

const baseCallPayload = ({ booking, policy }) => ({
  provider: policy.provider,
  joinMode: policy.joinMode,
  region: policy.region,
  status: booking.videoCall?.status || (policy.joinMode === 'disabled' ? 'disabled' : 'scheduled'),
  bookingId: booking._id.toString(),
  sessionType: booking.sessionType,
  counsellorName: `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`,
  userName: `${booking.user.firstName} ${booking.user.lastName}`,
  scheduledAt: booking.scheduledAt,
  duration: booking.sessionDuration
});

const externalPayload = ({ booking, policy, includeHostUrl = false }) => {
  const provider = booking.videoCall?.provider || policy.provider;
  const payload = {
    ...baseCallPayload({ booking, policy: { ...policy, provider, joinMode: 'external_link' } }),
    provider,
    providerName: booking.videoCall?.externalProviderName || providerDisplayName(provider),
    externalProviderName: booking.videoCall?.externalProviderName || providerDisplayName(provider),
    joinUrl: booking.videoCall?.externalJoinUrl,
    externalJoinUrl: booking.videoCall?.externalJoinUrl
  };

  if (includeHostUrl) {
    payload.hostUrl = booking.videoCall?.externalHostUrl;
    payload.externalHostUrl = booking.videoCall?.externalHostUrl;
  }

  if (!payload.joinUrl) {
    recordCallProviderOperation({
      provider,
      operation: 'regional_fallback',
      outcome: 'failure',
    });
    return {
      ...payload,
      success: false,
      status: 'not_configured',
      message: 'Your secure video session link is not ready yet. Please wait for the counsellor/admin to prepare it.'
    };
  }

  recordCallProviderOperation({
    provider,
    operation: 'regional_fallback',
    outcome: 'success',
  });
  return {
    ...payload,
    success: true,
    status: 'ready'
  };
};

const disabledPayload = ({ booking, policy }) => {
  recordCallProviderOperation({
    provider: 'disabled',
    operation: 'regional_fallback',
    outcome: 'disabled',
  });
  return {
    ...baseCallPayload({ booking, policy }),
    success: false,
    status: 'disabled',
    message: 'Video calling is not available until your region is verified.'
  };
};

const livekitPayload = async ({ req, booking, roomName, livekitUrl, livekitToken, policy, displayName }) => {
  const ticket = await createMeetTicket({
    livekitToken,
    livekitUrl,
    name: displayName,
    type: booking.sessionType === 'audio' ? 'audio' : 'video',
    bookingId: booking._id,
    participantId: req.user._id,
  });

  return {
    success: true,
    provider: 'livekit',
    joinMode: 'in_app',
    region: policy.region,
    livekitUrl,
    meetTicket: ticket,
    meetUrl: buildMeetUrl(req, ticket, booking.sessionType === 'audio' ? 'audio' : 'video'),
    roomName,
    roomId: roomName,
    bookingId: booking._id.toString(),
    sessionType: booking.sessionType,
    counsellorName: `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`,
    userName: `${booking.user.firstName} ${booking.user.lastName}`,
    scheduledAt: booking.scheduledAt,
    duration: booking.sessionDuration,
    status: booking.status
  };
};

const respondWithCallPayload = (res, payload, statusCode = 200) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return res.status(statusCode).json({
    ...payload,
    data: payload
  });
};

const ensureLivekitRoom = async (booking, roomName) => {
  const client = getLivekitClient();
  await client.createRoom({
    name: roomName,
    emptyTimeout: 300,
    maxParticipants: 10,
    metadata: JSON.stringify({ bookingId: booking._id.toString() }),
  });
};

const getCallPolicy = (req, booking) => resolveCallPolicy(buildGuardInput(req, booking));

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/video/create-room
// @desc    Create a LiveKit room for a booking and return a one-time meet ticket
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post('/create-room', [
  body('bookingId').isMongoId().withMessage('Invalid booking ID'),
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { bookingId } = req.body;
    const { booking, error } = await loadBooking(bookingId, req.user._id);

    if (error) return res.status(error === 'Booking not found' ? 404 : 400).json({ success: false, message: error });
    const access = authorizeLoadedCall({ req, res, booking });
    if (!access) return;
    const isUser = access.participantRole === 'user';
    const isCounsellor = access.participantRole === 'counsellor';

    const policy = getCallPolicy(req, booking);
    await updateBookingPolicy(booking, policy);
    if (policy.joinMode === 'external_link') {
      await booking.save();
      const payload = externalPayload({ booking, policy, includeHostUrl: isCounsellor });
      return respondWithCallPayload(res, payload, payload.success ? 200 : 409);
    }
    if (policy.joinMode === 'disabled') {
      await booking.save();
      return respondWithCallPayload(res, disabledPayload({ booking, policy }), 403);
    }

    const roomName   = `menorah-${booking._id}`;
    const livekitUrl = process.env.LIVEKIT_URL || 'wss://calls.menorah.me';

    try {
      await ensureLivekitRoom(booking, roomName);
      recordCallProviderOperation({
        provider: 'livekit',
        operation: 'room_create',
        outcome: 'success',
      });
    } catch (livekitErr) {
      if (!livekitErr.message?.includes('already exists')) {
        recordCallProviderOperation({
          provider: 'livekit',
          operation: 'room_create',
          outcome: 'failure',
        });
        console.error(
          'LiveKit createRoom error:',
          livekitErr?.code || 'LIVEKIT_ROOM_CREATE_FAILED'
        );
        return res.status(503).json({ success: false, message: 'Video service unavailable. Please try again.' });
      }
      recordCallProviderOperation({
        provider: 'livekit',
        operation: 'room_create',
        outcome: 'success',
      });
    }

    const displayName = isUser
      ? `${booking.user.firstName} ${booking.user.lastName}`
      : `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`;

    const livekitToken = await generateLivekitToken(
      req.user._id.toString(),
      displayName,
      roomName,
      isCounsellor,
      buildGuardInput(req, booking, access)
    );

    // Persist room details on the booking document
    booking.videoCall.roomId   = roomName;
    booking.videoCall.roomUrl  = `${livekitUrl}/${roomName}`;
    booking.videoCall.status   = booking.status === 'in-progress' ? 'started' : 'scheduled';
    await booking.save();

    return respondWithCallPayload(res, await livekitPayload({
      req,
      booking,
      roomName,
      livekitUrl,
      livekitToken,
      policy,
      displayName
    }));
  } catch (err) {
    console.error('Create video room error:', err?.code || 'VIDEO_ROOM_CREATE_FAILED');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/video/room/:bookingId
// @desc    Get video room details + fresh token for a booking
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.get('/room/:bookingId', [
  param('bookingId').isMongoId().withMessage('Invalid booking ID'),
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { booking, error } = await loadBooking(req.params.bookingId, req.user._id);

    if (error) return res.status(error === 'Booking not found' ? 404 : 400).json({ success: false, message: error });
    const access = authorizeLoadedCall({ req, res, booking });
    if (!access) return;
    const isUser = access.participantRole === 'user';
    const isCounsellor = access.participantRole === 'counsellor';
    const policy = getCallPolicy(req, booking);
    await updateBookingPolicy(booking, policy);
    if (policy.joinMode === 'external_link') {
      await booking.save();
      const payload = externalPayload({ booking, policy, includeHostUrl: isCounsellor });
      return respondWithCallPayload(res, payload, payload.success ? 200 : 409);
    }
    if (policy.joinMode === 'disabled') {
      await booking.save();
      return respondWithCallPayload(res, disabledPayload({ booking, policy }), 403);
    }

    if (!booking.videoCall.roomId) {
      await booking.save();
      return res.status(404).json({ success: false, message: 'Video room not created yet' });
    }

    const livekitUrl   = process.env.LIVEKIT_URL || 'wss://calls.menorah.me';
    const displayName  = isUser
      ? `${booking.user.firstName} ${booking.user.lastName}`
      : `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`;

    const livekitToken = await generateLivekitToken(
      req.user._id.toString(),
      displayName,
      booking.videoCall.roomId,
      isCounsellor,
      buildGuardInput(req, booking, access)
    );

    await booking.save();

    return respondWithCallPayload(res, await livekitPayload({
      req,
      booking,
      roomName: booking.videoCall.roomId,
      livekitUrl,
      livekitToken,
      policy,
      displayName
    }));
  } catch (err) {
    console.error('Get video room error:', err?.code || 'VIDEO_ROOM_READ_FAILED');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/video/room/:bookingId/join
// @desc    Join a video room — counsellor joining moves booking → in-progress
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post('/room/:bookingId/join', [
  param('bookingId').isMongoId().withMessage('Invalid booking ID'),
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { booking, error } = await loadBooking(req.params.bookingId, req.user._id);

    if (error) return res.status(error === 'Booking not found' ? 404 : 400).json({ success: false, message: error });
    const access = authorizeLoadedCall({ req, res, booking });
    if (!access) return;
    const isUser = access.participantRole === 'user';
    const isCounsellor = access.participantRole === 'counsellor';

    const policy = getCallPolicy(req, booking);
    await updateBookingPolicy(booking, policy);

    if (policy.joinMode === 'external_link') {
      if (booking.status === 'confirmed' && isCounsellor) {
        await booking.startSession();
        booking.videoCall.status = booking.videoCall.externalJoinUrl ? 'started' : 'not_configured';
      }
      await booking.save();

      const io = req.app.get('io');
      if (io && isCounsellor && booking.status === 'in-progress') {
        const counsellorName = `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`;
        io.to(`user_${booking.user._id}`).emit('session_started', {
          bookingId: booking._id.toString(),
          status: 'in-progress',
          sessionType: booking.sessionType,
          provider: policy.provider,
          joinMode: policy.joinMode,
          counsellorName,
          scheduledAt: booking.scheduledAt.toISOString(),
          sessionDuration: booking.sessionDuration,
        });
        io.to(`user_${booking.user._id}`).emit('booking_status_changed', {
          bookingId: booking._id.toString(),
          status: 'in-progress',
        });
      }

      const payload = externalPayload({ booking, policy, includeHostUrl: isCounsellor });
      return respondWithCallPayload(res, payload, payload.success ? 200 : 409);
    }

    if (policy.joinMode === 'disabled') {
      await booking.save();
      return respondWithCallPayload(res, disabledPayload({ booking, policy }), 403);
    }

    if (booking.status === 'confirmed') {
      if (isCounsellor) {
        await booking.startSession();

        const io = req.app.get('io');
        if (io) {
          const counsellorName = `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`;
          io.to(`user_${booking.user._id}`).emit('session_started', {
            bookingId:       booking._id.toString(),
            status:          'in-progress',
            sessionType:     booking.sessionType,
            provider:        'livekit',
            joinMode:        'in_app',
            counsellorName,
            scheduledAt:     booking.scheduledAt.toISOString(),
            sessionDuration: booking.sessionDuration,
          });
          io.to(`user_${booking.user._id}`).emit('booking_status_changed', {
            bookingId: booking._id.toString(),
            status:    'in-progress',
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Session has not been started by the counsellor yet',
        });
      }
    }

    const livekitUrl = process.env.LIVEKIT_URL || 'wss://calls.menorah.me';

    if (booking.status === 'in-progress' && !booking.videoCall.roomId && booking.sessionType === 'video' && isCounsellor) {
      const roomName = `menorah-${booking._id}`;
      try {
        await ensureLivekitRoom(booking, roomName);
        recordCallProviderOperation({
          provider: 'livekit',
          operation: 'room_create',
          outcome: 'success',
        });
      } catch (livekitErr) {
        if (!livekitErr.message?.includes('already exists')) {
          recordCallProviderOperation({
            provider: 'livekit',
            operation: 'room_create',
            outcome: 'failure',
          });
          console.error(
            'LiveKit createRoom error (in-progress path):',
            livekitErr?.code || 'LIVEKIT_ROOM_CREATE_FAILED'
          );
          return res.status(503).json({ success: false, message: 'Video service unavailable. Please try again.' });
        }
        recordCallProviderOperation({
          provider: 'livekit',
          operation: 'room_create',
          outcome: 'success',
        });
      }
      booking.videoCall.roomId  = roomName;
      booking.videoCall.roomUrl = `${livekitUrl}/${roomName}`;
      booking.videoCall.status  = 'started';
      await booking.save();
    }

    if (booking.sessionType === 'video' && !booking.videoCall.roomId) {
      return res.status(400).json({ success: false, message: 'Video room not available for this session' });
    }

    const displayName  = isUser
      ? `${booking.user.firstName} ${booking.user.lastName}`
      : `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`;

    const livekitToken = await generateLivekitToken(
      req.user._id.toString(),
      displayName,
      booking.videoCall.roomId,
      isCounsellor,
      buildGuardInput(req, booking, access)
    );

    return respondWithCallPayload(res, {
      ...(await livekitPayload({
        req,
        booking,
        roomName: booking.videoCall.roomId,
        livekitUrl,
        livekitToken,
        policy,
        displayName
      })),
      message: 'Joined video room successfully'
    });
  } catch (err) {
    console.error('Join video room error:', err?.code || 'VIDEO_ROOM_JOIN_FAILED');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/video/room/:bookingId/leave
// @desc    Leave a video room — counsellor leaving completes the session
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post('/room/:bookingId/leave', [
  param('bookingId').isMongoId().withMessage('Invalid booking ID'),
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { booking, error } = await loadBooking(req.params.bookingId, req.user._id);

    if (error) return res.status(error === 'Booking not found' ? 404 : 400).json({ success: false, message: error });
    const access = authorizeLoadedCall({ req, res, booking });
    if (!access) return;
    const isCounsellor = access.participantRole === 'counsellor';

    if (booking.status === 'in-progress' && isCounsellor) {
      await booking.complete();
      booking.videoCall.status = 'ended';

      // Delete LiveKit room so it doesn't linger
      if (booking.videoCall.roomId) {
        try {
          const client = getLivekitClient();
          await client.deleteRoom(booking.videoCall.roomId);
        } catch (livekitErr) {
          // Room may have already been deleted — not fatal
          console.warn(
            'LiveKit deleteRoom warning:',
            livekitErr?.code || 'LIVEKIT_ROOM_DELETE_FAILED'
          );
        }
      }
      await booking.save();

      // Notify user via Socket.IO
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${booking.user._id}`).emit('booking_status_changed', {
          bookingId: booking._id.toString(),
          status:    'completed',
        });
      }
    }

    return res.json({ success: true, message: 'Left video room successfully' });
  } catch (err) {
    console.error('Leave video room error:', err?.code || 'VIDEO_ROOM_LEAVE_FAILED');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/video/room/:bookingId/recording
// @desc    Recording is deliberately unavailable
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post('/room/:bookingId/recording', [
  param('bookingId').isMongoId().withMessage('Invalid booking ID'),
  body('enable').isBoolean().withMessage('enable must be a boolean'),
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { booking, error } = await loadBooking(req.params.bookingId, req.user._id);

    if (error) return res.status(error === 'Booking not found' ? 404 : 400).json({ success: false, message: error });
    const access = authorizeLoadedCall({ req, res, booking });
    if (!access) return;
    if (access.participantRole !== 'counsellor') {
      return res.status(403).json({
        success: false,
        code: 'CALL_RECORDING_FORBIDDEN',
        message: 'Access denied',
      });
    }

    return res.status(501).json({
      success: false,
      code: 'CALL_RECORDING_DISABLED',
      isRecordingEnabled: false,
      message: 'Session recording is not available',
    });
  } catch (err) {
    console.error('Recording status error:', err?.code || 'VIDEO_RECORDING_STATUS_FAILED');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/video/meet/redeem
// @desc    Redeem a short-lived one-time ticket for LiveKit connection details
// @access  Public (ticket is one-time and expires quickly)
router.post('/meet/redeem', [
  body('ticket').isString().trim().isLength({ min: 20, max: 128 }).withMessage('ticket is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Invalid video session ticket' });
  }

  try {
    const session = await redeemMeetTicket(req.body.ticket);
    if (!session) {
      return res.status(410).json({ success: false, message: 'Video session ticket expired or already used' });
    }
    if (!session.bookingId || !session.participantId) {
      recordCallDenial(req, 'MEET_TICKET_BINDING_INVALID', session.bookingId, {
        _id: session.participantId,
        role: 'ticket',
      }, 410);
      return res.status(410).json({
        success: false,
        message: 'Video session ticket expired or already used',
      });
    }

    const { booking, error } = await loadBooking(
      session.bookingId,
      session.participantId
    );
    const access = !error && evaluateCallAccess({
      booking,
      requesterUserId: session.participantId,
      now: new Date(),
    });
    const policy = access?.allowed ? getCallPolicy(req, booking) : null;
    if (
      !access?.allowed
      || policy?.provider !== 'livekit'
      || policy?.joinMode !== 'in_app'
    ) {
      recordCallDenial(
        req,
        access?.reason || (error ? 'MEET_TICKET_BOOKING_INVALID' : 'LIVEKIT_POLICY_CHANGED'),
        session.bookingId,
        { _id: session.participantId, role: 'ticket' },
        410
      );
      return res.status(410).json({
        success: false,
        message: 'Video session ticket expired or already used',
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const telemetryToken = await createMediaTelemetryToken(session.type);
    const redemption = {
      success: true,
      livekitUrl: session.livekitUrl,
      livekitToken: session.livekitToken,
      token: session.livekitToken,
      telemetryToken,
      name: session.name,
      type: session.type,
    };
    return res.json({
      ...redemption,
      data: redemption,
    });
  } catch (error) {
    console.error(
      'Redeem video meet ticket error:',
      error?.code || 'VIDEO_TICKET_REDEEM_FAILED'
    );
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/meet/media-outcome', [
  body('telemetryToken').matches(/^[A-Za-z0-9_-]{32,128}$/),
  body('phase').isIn(['connect', 'media']),
  body('outcome').isIn(['success', 'failure']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Invalid media outcome' });
  }

  try {
    const media = await consumeMediaTelemetryToken(req.body.telemetryToken);
    if (!media) {
      return res.status(410).json({ success: false, message: 'Media outcome token expired' });
    }
    if (req.body.phase === 'connect') {
      recordCallProviderOperation({
        provider: 'livekit',
        operation: 'connect',
        outcome: req.body.outcome,
      });
    } else {
      recordCallProviderOperation({
        provider: 'livekit',
        operation: 'connect',
        outcome: 'success',
      });
      recordCallMediaOutcome({
        provider: 'livekit',
        media,
        outcome: req.body.outcome,
      });
    }
    return res.json({ success: true });
  } catch (_error) {
    return res.status(503).json({
      success: false,
      message: 'Media outcome temporarily unavailable',
    });
  }
});

// @route   GET /api/video/meet
// @desc    Serve the LiveKit meet HTML page for mobile WebView
// @access  Public (short-lived ticket must be redeemed by POST)
// @query   type      — session type: 'video' | 'audio'
// @fragment ticket   — short-lived ticket redeemed once by the page
// ─────────────────────────────────────────────────────────────────────────────
router.get('/meet', [
  query('type').optional().isIn(['video', 'audio']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).send('<h1>Invalid video session type</h1>');
  }

  const { type = 'video' } = req.query;
  const videoOnly = type === 'video';

  const safeName  = 'Participant';
  const cspNonce = crypto.randomBytes(16).toString('base64');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Menorah Session</title>
  <style nonce="${cspNonce}">
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    html,body{width:100%;height:100vh;background:#0a0f1e;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;overflow:hidden;touch-action:manipulation}
    #app{position:fixed;inset:0;display:flex;flex-direction:column}

    /* ── Video area ── */
    #videos{position:relative;flex:1;background:#0a0f1e;overflow:hidden}

    /* Remote: fullscreen */
    #remote-tile{position:absolute;inset:0;background:#111827;display:flex;align-items:center;justify-content:center}
    #remote-tile video,#remote-tile audio{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}

    /* Local PiP */
    #local-tile{
      position:absolute;top:16px;right:16px;
      width:88px;height:132px;
      border-radius:14px;overflow:hidden;
      background:#1a2235;
      border:2px solid rgba(255,255,255,0.18);
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
      z-index:6
    }
    #local-tile video{width:100%;height:100%;object-fit:cover}

    /* Avatar placeholder */
    .avatar-wrap{
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:10px;width:100%;height:100%
    }
    .avatar-circle{
      width:72px;height:72px;border-radius:50%;
      background:linear-gradient(135deg,#2d7a5c,#3d9470);
      display:flex;align-items:center;justify-content:center;
      font-size:28px;font-weight:700;color:#fff;
      box-shadow:0 4px 20px rgba(61,148,112,0.4)
    }
    .avatar-circle.sm{width:36px;height:36px;font-size:14px}
    .avatar-label{font-size:13px;color:rgba(255,255,255,0.6);font-weight:500;text-align:center;padding:0 8px}

    /* Name badge on remote */
    #remote-name{
      position:absolute;bottom:100px;left:16px;
      background:rgba(0,0,0,0.55);
      backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      padding:5px 12px;border-radius:20px;
      font-size:13px;color:#fff;font-weight:500;
      display:none
    }

    /* Mic-off badge on remote */
    #remote-mic-off{
      position:absolute;top:16px;left:16px;
      background:rgba(239,68,68,0.85);border-radius:50%;
      width:32px;height:32px;
      display:none;align-items:center;justify-content:center;z-index:5
    }

    /* Status bar (top gradient) */
    #status-bar{
      position:absolute;top:0;left:0;right:0;
      height:56px;
      background:linear-gradient(to bottom,rgba(10,15,30,0.92) 0%,transparent 100%);
      display:flex;align-items:center;justify-content:center;gap:8px;
      z-index:10;pointer-events:none
    }
    #conn-dot{
      width:8px;height:8px;border-radius:50%;
      background:#f59e0b;flex-shrink:0;
      transition:background 0.4s
    }
    #conn-dot.live{background:#10b981;animation:pulse-dot 2.5s infinite}
    @keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:.4}}
    #status-text{font-size:13px;color:rgba(255,255,255,0.75);font-weight:500}

    /* Timer */
    #timer{
      position:absolute;top:16px;right:${videoOnly ? '120px' : '16px'};
      background:rgba(0,0,0,0.45);
      backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
      padding:4px 10px;border-radius:20px;
      font-size:12px;color:rgba(255,255,255,0.8);
      font-family:monospace;letter-spacing:0.5px;
      z-index:10;display:none
    }

    /* Controls bar (bottom) */
    #controls{
      position:absolute;bottom:0;left:0;right:0;
      padding:20px 24px 40px;
      background:linear-gradient(to top,rgba(10,15,30,0.96) 0%,transparent 100%);
      display:flex;align-items:center;justify-content:center;gap:18px;
      z-index:10
    }
    .ctrl-btn{
      width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;
      display:flex;align-items:center;justify-content:center;
      transition:transform 0.12s,background 0.2s;
      box-shadow:0 4px 16px rgba(0,0,0,0.3);
      outline:none
    }
    .ctrl-btn:active{transform:scale(0.88)}
    .ctrl-btn.active{background:rgba(255,255,255,0.14)}
    .ctrl-btn.muted{background:rgba(239,68,68,0.9)}
    .ctrl-btn.cam-off{background:rgba(239,68,68,0.9)}
    .ctrl-btn.leave{
      width:64px;height:64px;
      background:#ef4444;
      box-shadow:0 4px 24px rgba(239,68,68,0.5)
    }

    /* Connecting overlay */
    #connecting{
      position:fixed;inset:0;background:#0a0f1e;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:20px;z-index:30;transition:opacity 0.4s
    }
    #connecting.fade-out{opacity:0;pointer-events:none}
    #connecting.gone{display:none}
    .spinner{
      width:52px;height:52px;
      border:3px solid rgba(61,148,112,0.25);
      border-top:3px solid #3d9470;
      border-radius:50%;animation:spin 0.8s linear infinite
    }
    @keyframes spin{to{transform:rotate(360deg)}}
    .conn-title{font-size:18px;font-weight:600;color:#fff}
    .conn-sub{font-size:14px;color:rgba(255,255,255,0.5)}
    .conn-sub.centered{text-align:center;margin-top:4px}
    #ic-mic-off,#ic-cam-off{display:none}

    /* Error overlay */
    #error-screen{
      position:fixed;inset:0;background:#0a0f1e;
      display:none;flex-direction:column;align-items:center;justify-content:center;
      gap:16px;padding:32px;z-index:30
    }
    #error-screen.show{display:flex}
    .err-icon{font-size:48px}
    .err-title{font-size:18px;font-weight:600;color:#f87171}
    .err-msg{font-size:14px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.5}
    .err-btn{
      margin-top:8px;background:#2d7a5c;color:#fff;border:none;
      padding:12px 28px;border-radius:24px;font-size:15px;font-weight:600;
      cursor:pointer
    }
  </style>
</head>
<body>
<div id="app">
  <!-- Connecting overlay -->
  <div id="connecting">
    <div class="spinner"></div>
    <div>
      <div class="conn-title">Joining session…</div>
      <div class="conn-sub centered">Setting up your connection</div>
    </div>
  </div>

  <!-- Error overlay -->
  <div id="error-screen">
    <div class="err-icon">📵</div>
    <div class="err-title">Connection Failed</div>
    <div class="err-msg" id="err-msg">Unable to connect to the session. Please check your connection and try again.</div>
    <button id="err-leave" class="err-btn">Go Back</button>
  </div>

  <!-- Video area -->
  <div id="videos">
    <!-- Remote participant (fullscreen) -->
    <div id="remote-tile">
      <div class="avatar-wrap" id="remote-avatar">
        <div class="avatar-circle" id="remote-initial">?</div>
        <div class="avatar-label" id="remote-avatar-name">Waiting for counsellor…</div>
      </div>
    </div>

    <!-- Local PiP -->
    <div id="local-tile">
      <div class="avatar-wrap" id="local-avatar">
        <div class="avatar-circle sm" id="local-initial">${safeName.charAt(0).toUpperCase() || 'Y'}</div>
      </div>
    </div>

    <!-- Overlays -->
    <div id="status-bar">
      <div id="conn-dot"></div>
      <span id="status-text">Connecting…</span>
    </div>
    <div id="timer">00:00</div>
    <div id="remote-name"></div>
    <div id="remote-mic-off">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
        <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    </div>
  </div>

  <!-- Controls -->
  <div id="controls">
    <!-- Mic -->
    <button id="btn-mic" class="ctrl-btn active" title="Mute microphone">
      <svg id="ic-mic" width="22" height="22" viewBox="0 0 24 24" fill="white">
        <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
        <path d="M19 10a7 7 0 0 1-14 0" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/>
        <line x1="12" y1="17" x2="12" y2="21" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <line x1="9" y1="21" x2="15" y2="21" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <svg id="ic-mic-off" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2"/>
        <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    </button>

    <!-- End call -->
    <button id="btn-leave" class="ctrl-btn leave" title="End call">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
        <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
      </svg>
    </button>

    ${videoOnly ? `<!-- Camera -->
    <button id="btn-cam" class="ctrl-btn active" title="Toggle camera">
      <svg id="ic-cam" width="22" height="22" viewBox="0 0 24 24" fill="white">
        <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
      </svg>
      <svg id="ic-cam-off" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
        <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
    </button>` : ''}
  </div>
</div>

<script nonce="${cspNonce}" src="https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js"></script>
<script nonce="${cspNonce}">
(async () => {
  const MEET_TICKET = new URLSearchParams(window.location.hash.slice(1)).get('ticket') || '';
  let TOKEN    = '';
  let WS_URL   = '';
  let TELEMETRY_TOKEN = '';
  let OUTCOME_PHASE = 'connect';
  let IS_VIDEO = ${videoOnly ? 'true' : 'false'};
  let MY_NAME  = '${safeName}';

  // ── Elements ──────────────────────────────────────────────────────────────
  const remoteTile   = document.getElementById('remote-tile');
  const remoteAvatar = document.getElementById('remote-avatar');
  const remoteInitEl = document.getElementById('remote-initial');
  const remoteNameEl = document.getElementById('remote-avatar-name');
  const remoteNameBadge = document.getElementById('remote-name');
  const remoteMicOff = document.getElementById('remote-mic-off');
  const localTile    = document.getElementById('local-tile');
  const localAvatar  = document.getElementById('local-avatar');
  const localInit    = document.getElementById('local-initial');
  const connDot      = document.getElementById('conn-dot');
  const statusText   = document.getElementById('status-text');
  const timerEl      = document.getElementById('timer');
  const connecting   = document.getElementById('connecting');
  const errorScreen  = document.getElementById('error-screen');
  const errMsg       = document.getElementById('err-msg');

  // ── Helpers ───────────────────────────────────────────────────────────────
  function notifyNative(action) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ action }));
    }
  }

  async function reportMediaOutcome(phase, outcome) {
    if (!TELEMETRY_TOKEN) return;
    const telemetryToken = TELEMETRY_TOKEN;
    TELEMETRY_TOKEN = '';
    try {
      await fetch('/api/video/meet/media-outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        body: JSON.stringify({ telemetryToken, phase, outcome }),
      });
    } catch {
      // Telemetry must never prevent the participant from leaving or retrying.
    }
  }

  document.getElementById('err-leave')?.addEventListener('click', () => notifyNative('leave'));

  function setConnected(on) {
    connDot.className = on ? 'live' : '';
    connDot.style.background = on ? '' : '#f59e0b';
    statusText.textContent   = on ? 'Live' : 'Connecting…';
  }

  function showError(msg) {
    connecting.className = 'gone';
    errMsg.textContent   = msg || 'Unable to connect. Please try again.';
    errorScreen.className = 'show';
  }

  function initial(name) {
    return (name || '?').charAt(0).toUpperCase();
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  let timerStart = null;
  let timerInterval = null;

  function startTimer() {
    timerStart = Date.now();
    timerEl.style.display = 'block';
    timerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - timerStart) / 1000);
      const m = String(Math.floor(s / 60)).padStart(2,'0');
      const sec = String(s % 60).padStart(2,'0');
      timerEl.textContent = m + ':' + sec;
    }, 1000);
  }

  // ── LiveKit Room ──────────────────────────────────────────────────────────
  const room = new LivekitClient.Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: LivekitClient.VideoPresets.h720.resolution,
      facingMode: 'user',
    },
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
  });

  // ── Remote track rendering ────────────────────────────────────────────────
  function attachRemote(track, participant) {
    const el = track.attach();
    if (track.kind === 'video') {
      el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
      const old = remoteTile.querySelector('video');
      if (old) old.remove();
      remoteAvatar.style.display = 'none';
      remoteTile.appendChild(el);
      remoteNameBadge.style.display = 'block';
    } else {
      el.style.display = 'none'; // audio element — hidden but active
      remoteTile.appendChild(el);
    }
    remoteInitEl.textContent = initial(participant.identity);
    remoteNameEl.textContent = participant.identity;
    remoteNameBadge.textContent = participant.identity;
  }

  function detachRemote(track) {
    track.detach().forEach(el => {
      el.remove();
      if (el.tagName === 'VIDEO') {
        remoteAvatar.style.display = 'flex';
        remoteNameBadge.style.display = 'none';
      }
    });
  }

  // ── Local track rendering ─────────────────────────────────────────────────
  function attachLocal(track) {
    if (track.kind !== 'video') return;
    const el = track.attach();
    el.style.cssText = 'width:100%;height:100%;object-fit:cover';
    el.setAttribute('playsinline', '');
    el.muted = true;
    const old = localTile.querySelector('video');
    if (old) old.remove();
    localAvatar.style.display = 'none';
    localTile.appendChild(el);
  }

  // ── Room event bindings ───────────────────────────────────────────────────
  room
    .on(LivekitClient.RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      attachRemote(track, participant);
    })
    .on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
      detachRemote(track);
    })
    .on(LivekitClient.RoomEvent.TrackMuted, (pub, participant) => {
      if (pub.kind === 'audio') remoteMicOff.style.display = 'flex';
    })
    .on(LivekitClient.RoomEvent.TrackUnmuted, (pub, participant) => {
      if (pub.kind === 'audio') remoteMicOff.style.display = 'none';
    })
    .on(LivekitClient.RoomEvent.ParticipantDisconnected, (participant) => {
      const v = remoteTile.querySelector('video');
      if (v) v.remove();
      remoteAvatar.style.display = 'flex';
      remoteNameEl.textContent = 'Waiting for counsellor…';
      remoteNameBadge.style.display = 'none';
    })
    .on(LivekitClient.RoomEvent.Disconnected, () => {
      setConnected(false);
      if (timerInterval) clearInterval(timerInterval);
      notifyNative('session_ended');
    })
    .on(LivekitClient.RoomEvent.Reconnecting, () => {
      connDot.style.background = '#f59e0b';
      statusText.textContent   = 'Reconnecting…';
    })
    .on(LivekitClient.RoomEvent.Reconnected, () => { setConnected(true); });

  // ── Connect ───────────────────────────────────────────────────────────────
  try {
    const redeemResponse = await fetch('/api/video/meet/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      body: JSON.stringify({ ticket: MEET_TICKET }),
    });
    const redeemed = await redeemResponse.json().catch(() => null);
    if (!redeemResponse.ok || !redeemed || !redeemed.success) {
      throw new Error(redeemed?.message || 'Video session ticket is invalid');
    }
    TOKEN = redeemed.livekitToken || redeemed.token;
    WS_URL = redeemed.livekitUrl;
    TELEMETRY_TOKEN = redeemed.telemetryToken || '';
    IS_VIDEO = redeemed.type === 'audio' ? false : IS_VIDEO;
    MY_NAME = redeemed.name || MY_NAME;
    localInit.textContent = initial(MY_NAME);

    await room.connect(WS_URL, TOKEN, { autoSubscribe: true });
    OUTCOME_PHASE = 'media';

    // Fade out the connecting overlay
    connecting.className = 'fade-out';
    setTimeout(() => connecting.className = 'gone', 400);
    setConnected(true);
    startTimer();

    // Publish local camera + mic
    if (IS_VIDEO) {
      await room.localParticipant.enableCameraAndMicrophone();
    } else {
      await room.localParticipant.setMicrophoneEnabled(true);
    }
    await reportMediaOutcome('media', 'success');

    // Render local camera
    const camPub = room.localParticipant.getTrackPublication(LivekitClient.Track.Source.Camera);
    if (camPub && camPub.track) attachLocal(camPub.track);

    // Render any already-present remote tracks (rejoining)
    room.remoteParticipants.forEach(p => {
      p.trackPublications.forEach(pub => {
        if (pub.isSubscribed && pub.track) attachRemote(pub.track, p);
      });
    });
  } catch (err) {
    await reportMediaOutcome(OUTCOME_PHASE, 'failure');
    showError('Failed to connect: ' + (err.message || 'unknown error'));
    return;
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  let micOn = true;
  let camOn = IS_VIDEO;

  document.getElementById('btn-mic').addEventListener('click', async () => {
    micOn = !micOn;
    await room.localParticipant.setMicrophoneEnabled(micOn);
    const btn = document.getElementById('btn-mic');
    btn.className = 'ctrl-btn ' + (micOn ? 'active' : 'muted');
    document.getElementById('ic-mic').style.display     = micOn ? '' : 'none';
    document.getElementById('ic-mic-off').style.display = micOn ? 'none' : '';
  });

  document.getElementById('btn-leave').addEventListener('click', async () => {
    if (timerInterval) clearInterval(timerInterval);
    await room.disconnect();
    notifyNative('leave');
  });

  if (IS_VIDEO) {
    document.getElementById('btn-cam').addEventListener('click', async () => {
      camOn = !camOn;
      await room.localParticipant.setCameraEnabled(camOn);
      const btn = document.getElementById('btn-cam');
      btn.className = 'ctrl-btn ' + (camOn ? 'active' : 'cam-off');
      document.getElementById('ic-cam').style.display     = camOn ? '' : 'none';
      document.getElementById('ic-cam-off').style.display = camOn ? 'none' : '';
      // Show/hide local avatar
      localAvatar.style.display     = camOn ? 'none' : 'flex';
      const localVid = localTile.querySelector('video');
      if (localVid) localVid.style.display = camOn ? '' : 'none';
    });
  }
})();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', [
    "default-src 'none'",
    `script-src 'self' 'nonce-${cspNonce}' https://cdn.jsdelivr.net`,
    `style-src 'nonce-${cspNonce}'`,
    "img-src 'self' data:",
    "media-src 'self' blob:",
    `connect-src ${getMeetPageConnectSrc().join(' ')}`,
    "font-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "worker-src 'none'",
  ].join('; '));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(html);
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/video/livekit-webhook
// @desc    Receive LiveKit room events (room_finished, participant_joined, etc.)
// @access  Public (verified via LiveKit webhook signature)
// ─────────────────────────────────────────────────────────────────────────────
// Raw body is captured by server.js middleware before express.json() runs.
// req.body here is a Buffer (not a parsed object) when Content-Type is application/webhook+json.
router.post('/livekit-webhook', async (req, res) => {
  try {
    const { WebhookReceiver } = require('livekit-server-sdk');
    const apiKey    = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) return res.sendStatus(200);

    const receiver = new WebhookReceiver(apiKey, apiSecret);
    let event;

    try {
      event = await receiver.receive(req.body, req.headers['authorization']);
    } catch {
      // Signature verification failed — ignore silently (could be a replay)
      return res.sendStatus(200);
    }
    recordCallProviderOperation({
      provider: 'livekit',
      operation: 'webhook',
      outcome: 'success',
    });

    if (event.event === 'room_finished') {
      // Room closed — mark any in-progress booking as completed
      const roomName = event.room?.name;
      if (roomName && roomName.startsWith('menorah-')) {
        const bookingId = roomName.replace('menorah-', '');
        const booking   = await Booking.findById(bookingId);
        if (booking && booking.status === 'in-progress') {
          await booking.complete();
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    recordCallProviderOperation({
      provider: 'livekit',
      operation: 'webhook',
      outcome: 'failure',
    });
    console.error('LiveKit webhook error:', err?.code || 'LIVEKIT_WEBHOOK_FAILED');
    return res.sendStatus(200); // Always 200 — LiveKit retries on non-200
  }
});

router._private = {
  generateLivekitToken,
  getCallPolicy,
  createMeetTicket,
  redeemMeetTicket,
  createMediaTelemetryToken,
  consumeMediaTelemetryToken,
  buildMeetUrl
};

module.exports = router;
