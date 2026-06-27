const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
// Note: VideoGrant was removed in livekit-server-sdk v2. Grant options are passed
// as a plain object to token.addGrant() instead.
const Booking = require('../models/Booking');
const { auth } = require('../middleware/auth');
const {
  assertLiveKitAllowed,
  providerDisplayName,
  resolveCallPolicy
} = require('../services/callPolicyService');

const router = express.Router();

// ── LiveKit client (server-to-server API calls) ────────────────────────────
// LIVEKIT_API_URL  = https://livekit.menorahhealth.app  (HTTP, for room management)
// LIVEKIT_URL      = wss://livekit.menorahhealth.app    (WebSocket, returned to clients)
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

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
    ttl: '4h',   // token valid for 4 hours (covers longest session)
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

  return token.toJwt();   // async in v2 — returns Promise<string>
};

// ── Helper: load and authorise booking ────────────────────────────────────
const loadBooking = async (bookingId, requestUserId) => {
  const booking = await Booking.findById(bookingId)
    .populate({
      path: 'counsellor',
      select: 'user',
      populate: { path: 'user', select: 'firstName lastName phone address country accountRegion region' },
    })
    .populate('user', 'firstName lastName phone address country accountRegion region');

  if (!booking) return { booking: null, isUser: false, isCounsellor: false, error: 'Booking not found' };
  if (!booking.counsellor || !booking.counsellor.user) {
    return { booking: null, isUser: false, isCounsellor: false, error: 'Counsellor not assigned to this booking' };
  }

  const isUser       = booking.user._id.toString() === requestUserId.toString();
  const isCounsellor = booking.counsellor.user._id.toString() === requestUserId.toString();

  return { booking, isUser, isCounsellor, error: null };
};

const getRequestCountry = (req) =>
  req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['x-country-code'] || '';

const buildGuardInput = (req, booking) => ({
  user: booking.user,
  booking,
  req: {
    headers: req.headers,
    ipCountry: getRequestCountry(req),
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

const externalPayload = ({ booking, policy }) => {
  const provider = booking.videoCall?.provider || policy.provider;
  const payload = {
    ...baseCallPayload({ booking, policy: { ...policy, provider, joinMode: 'external_link' } }),
    provider,
    providerName: booking.videoCall?.externalProviderName || providerDisplayName(provider),
    externalProviderName: booking.videoCall?.externalProviderName || providerDisplayName(provider),
    joinUrl: booking.videoCall?.externalJoinUrl,
    hostUrl: booking.videoCall?.externalHostUrl,
    externalJoinUrl: booking.videoCall?.externalJoinUrl,
    externalHostUrl: booking.videoCall?.externalHostUrl
  };

  if (!payload.joinUrl) {
    return {
      ...payload,
      success: false,
      status: 'not_configured',
      message: 'Your secure video session link is not ready yet. Please wait for the counsellor/admin to prepare it.'
    };
  }

  return {
    ...payload,
    success: true,
    status: 'ready'
  };
};

const disabledPayload = ({ booking, policy }) => ({
  ...baseCallPayload({ booking, policy }),
  success: false,
  status: 'disabled',
  message: 'Video calling is not available until your region is verified.'
});

const livekitPayload = ({ booking, roomName, livekitUrl, livekitToken, policy }) => ({
  success: true,
  provider: 'livekit',
  joinMode: 'in_app',
  region: policy.region,
  livekitUrl,
  token: livekitToken,
  livekitToken,
  roomName,
  roomId: roomName,
  bookingId: booking._id.toString(),
  sessionType: booking.sessionType,
  counsellorName: `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`,
  userName: `${booking.user.firstName} ${booking.user.lastName}`,
  scheduledAt: booking.scheduledAt,
  duration: booking.sessionDuration,
  status: booking.status
});

const respondWithCallPayload = (res, payload, statusCode = 200) =>
  res.status(statusCode).json({
    ...payload,
    data: payload
  });

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
// @desc    Create a LiveKit room for a booking and return a participant token
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
    const { booking, isUser, isCounsellor, error } = await loadBooking(bookingId, req.user._id);

    if (error) return res.status(error === 'Booking not found' ? 404 : 400).json({ success: false, message: error });
    if (!isUser && !isCounsellor) return res.status(403).json({ success: false, message: 'Access denied' });

    if (booking.status !== 'confirmed' && booking.status !== 'in-progress') {
      return res.status(400).json({ success: false, message: 'Session is not active' });
    }

    // Scheduled session — only allow joining within 15 min of scheduled time
    if (booking.status === 'confirmed') {
      const now          = new Date();
      const sessionTime  = new Date(booking.scheduledAt);
      const timeDiff     = Math.abs(now - sessionTime) / (1000 * 60);
      const assignedTime = booking.assignedAt ? new Date(booking.assignedAt) : null;
      const isInstant    = assignedTime && (now - assignedTime) < 24 * 60 * 60 * 1000 && sessionTime > now;

      if (!isInstant && timeDiff > 15) {
        return res.status(400).json({ success: false, message: 'Session is not available at this time' });
      }
    }

    const policy = getCallPolicy(req, booking);
    await updateBookingPolicy(booking, policy);
    if (policy.joinMode === 'external_link') {
      await booking.save();
      const payload = externalPayload({ booking, policy });
      return respondWithCallPayload(res, payload, payload.success ? 200 : 409);
    }
    if (policy.joinMode === 'disabled') {
      await booking.save();
      return respondWithCallPayload(res, disabledPayload({ booking, policy }), 403);
    }

    const roomName   = `menorah-${booking._id}`;
    const livekitUrl = process.env.LIVEKIT_URL || 'wss://livekit.menorahhealth.app';

    try {
      await ensureLivekitRoom(booking, roomName);
    } catch (livekitErr) {
      if (!livekitErr.message?.includes('already exists')) {
        console.error('LiveKit createRoom error:', livekitErr.message);
        return res.status(503).json({ success: false, message: 'Video service unavailable. Please try again.' });
      }
    }

    const displayName = isUser
      ? `${booking.user.firstName} ${booking.user.lastName}`
      : `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`;

    const livekitToken = await generateLivekitToken(
      req.user._id.toString(),
      displayName,
      roomName,
      isCounsellor,
      buildGuardInput(req, booking)
    );

    // Persist room details on the booking document
    booking.videoCall.roomId   = roomName;
    booking.videoCall.roomUrl  = `${livekitUrl}/${roomName}`;
    booking.videoCall.status   = booking.status === 'in-progress' ? 'started' : 'scheduled';
    await booking.save();

    return respondWithCallPayload(res, livekitPayload({ booking, roomName, livekitUrl, livekitToken, policy }));
  } catch (err) {
    console.error('Create video room error:', err);
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

    const { booking, isUser, isCounsellor, error } = await loadBooking(req.params.bookingId, req.user._id);

    if (error) return res.status(error === 'Booking not found' ? 404 : 400).json({ success: false, message: error });
    if (!isUser && !isCounsellor) return res.status(403).json({ success: false, message: 'Access denied' });
    const policy = getCallPolicy(req, booking);
    await updateBookingPolicy(booking, policy);
    if (policy.joinMode === 'external_link') {
      await booking.save();
      const payload = externalPayload({ booking, policy });
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

    const livekitUrl   = process.env.LIVEKIT_URL || 'wss://livekit.menorahhealth.app';
    const displayName  = isUser
      ? `${booking.user.firstName} ${booking.user.lastName}`
      : `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`;

    const livekitToken = await generateLivekitToken(
      req.user._id.toString(),
      displayName,
      booking.videoCall.roomId,
      isCounsellor,
      buildGuardInput(req, booking)
    );

    await booking.save();

    return respondWithCallPayload(res, livekitPayload({
      booking,
      roomName: booking.videoCall.roomId,
      livekitUrl,
      livekitToken,
      policy
    }));
  } catch (err) {
    console.error('Get video room error:', err);
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

    const { booking, isUser, isCounsellor, error } = await loadBooking(req.params.bookingId, req.user._id);

    if (error) return res.status(error === 'Booking not found' ? 404 : 400).json({ success: false, message: error });
    if (!isUser && !isCounsellor) return res.status(403).json({ success: false, message: 'Access denied' });

    if (booking.status !== 'confirmed' && booking.status !== 'in-progress') {
      return res.status(400).json({ success: false, message: 'Session is not active' });
    }

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

      const payload = externalPayload({ booking, policy });
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

    const livekitUrl = process.env.LIVEKIT_URL || 'wss://livekit.menorahhealth.app';

    if (booking.status === 'in-progress' && !booking.videoCall.roomId && booking.sessionType === 'video' && isCounsellor) {
      const roomName = `menorah-${booking._id}`;
      try {
        await ensureLivekitRoom(booking, roomName);
      } catch (livekitErr) {
        if (!livekitErr.message?.includes('already exists')) {
          console.error('LiveKit createRoom error (in-progress path):', livekitErr.message);
          return res.status(503).json({ success: false, message: 'Video service unavailable. Please try again.' });
        }
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
      buildGuardInput(req, booking)
    );

    return respondWithCallPayload(res, {
      ...livekitPayload({
        booking,
        roomName: booking.videoCall.roomId,
        livekitUrl,
        livekitToken,
        policy
      }),
      message: 'Joined video room successfully'
    });
  } catch (err) {
    console.error('Join video room error:', err);
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

    const { booking, isUser, isCounsellor, error } = await loadBooking(req.params.bookingId, req.user._id);

    if (error) return res.status(error === 'Booking not found' ? 404 : 400).json({ success: false, message: error });
    if (!isUser && !isCounsellor) return res.status(403).json({ success: false, message: 'Access denied' });

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
          console.warn('LiveKit deleteRoom warning:', livekitErr.message);
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
    console.error('Leave video room error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/video/room/:bookingId/recording
// @desc    Toggle session recording flag (stored on booking)
// @access  Private (counsellor only)
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

    const { booking, isCounsellor, error } = await loadBooking(req.params.bookingId, req.user._id);

    if (error) return res.status(error === 'Booking not found' ? 404 : 400).json({ success: false, message: error });
    if (!isCounsellor) return res.status(403).json({ success: false, message: 'Only counsellors can toggle recording' });

    booking.videoCall.isRecordingEnabled = req.body.enable;
    await booking.save();

    return res.json({
      success: true,
      message: `Recording ${req.body.enable ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (err) {
    console.error('Toggle recording error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/video/meet
// @desc    Serve the LiveKit meet HTML page for mobile WebView
// @access  Public (token carries all auth)
// @query   token     — LiveKit participant JWT
//          url       — LiveKit WebSocket URL (wss://...)
//          name      — display name for the participant
//          type      — session type: 'video' | 'audio'
// ─────────────────────────────────────────────────────────────────────────────
router.get('/meet', [
  query('token').notEmpty().withMessage('token is required'),
  query('url').notEmpty().withMessage('url is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).send('<h1>Missing required parameters: token and url</h1>');
  }

  const { token, url, name = 'Participant', type = 'video' } = req.query;
  const videoOnly = type === 'video';

  // Sanitise values — they go into JS string literals
  const safeToken = String(token).replace(/['"<>]/g, '');
  const safeUrl   = String(url).replace(/['"<>]/g, '');
  const safeName  = String(name).replace(/['"<>]/g, '').slice(0, 50);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Menorah Session</title>
  <style>
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
      <div class="conn-sub" style="text-align:center;margin-top:4px">Setting up your connection</div>
    </div>
  </div>

  <!-- Error overlay -->
  <div id="error-screen">
    <div class="err-icon">📵</div>
    <div class="err-title">Connection Failed</div>
    <div class="err-msg" id="err-msg">Unable to connect to the session. Please check your connection and try again.</div>
    <button class="err-btn" onclick="notifyNative('leave')">Go Back</button>
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
  <div id="controls" style="position:absolute;bottom:0;left:0;right:0">
    <!-- Mic -->
    <button id="btn-mic" class="ctrl-btn active" title="Mute microphone">
      <svg id="ic-mic" width="22" height="22" viewBox="0 0 24 24" fill="white">
        <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
        <path d="M19 10a7 7 0 0 1-14 0" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/>
        <line x1="12" y1="17" x2="12" y2="21" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <line x1="9" y1="21" x2="15" y2="21" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <svg id="ic-mic-off" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" style="display:none">
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
      <svg id="ic-cam-off" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" style="display:none">
        <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
    </button>` : ''}
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js"></script>
<script>
(async () => {
  const TOKEN    = '${safeToken}';
  const WS_URL   = '${safeUrl}';
  const IS_VIDEO = ${videoOnly ? 'true' : 'false'};
  const MY_NAME  = '${safeName}';

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
    await room.connect(WS_URL, TOKEN, { autoSubscribe: true });

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
  res.setHeader('Cache-Control', 'no-store');
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
    console.error('LiveKit webhook error:', err);
    return res.sendStatus(200); // Always 200 — LiveKit retries on non-200
  }
});

router._private = {
  generateLivekitToken,
  getCallPolicy
};

module.exports = router;
