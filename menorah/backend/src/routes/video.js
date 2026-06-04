const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
// Note: VideoGrant was removed in livekit-server-sdk v2. Grant options are passed
// as a plain object to token.addGrant() instead.
const Booking = require('../models/Booking');
const { auth } = require('../middleware/auth');

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
const generateLivekitToken = async (identity, name, roomName, isModerator = false) => {
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
      populate: { path: 'user', select: 'firstName lastName' },
    })
    .populate('user', 'firstName lastName');

  if (!booking) return { booking: null, isUser: false, isCounsellor: false, error: 'Booking not found' };
  if (!booking.counsellor || !booking.counsellor.user) {
    return { booking: null, isUser: false, isCounsellor: false, error: 'Counsellor not assigned to this booking' };
  }

  const isUser       = booking.user._id.toString() === requestUserId.toString();
  const isCounsellor = booking.counsellor.user._id.toString() === requestUserId.toString();

  return { booking, isUser, isCounsellor, error: null };
};

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

    const roomName   = `menorah-${booking._id}`;
    const livekitUrl = process.env.LIVEKIT_URL || 'wss://livekit.menorahhealth.app';

    // Idempotently create the room on the LiveKit server
    try {
      const client = getLivekitClient();
      await client.createRoom({
        name:               roomName,
        emptyTimeout:       300,   // 5 min after last participant leaves, room closes
        maxParticipants:    10,
        metadata:           JSON.stringify({ bookingId: booking._id.toString() }),
      });
    } catch (livekitErr) {
      // Room may already exist — that's fine, createRoom is idempotent
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
      isCounsellor   // counsellors are room admins
    );

    // Persist room details on the booking document
    booking.videoCall.roomId  = roomName;
    booking.videoCall.roomUrl = `${livekitUrl}/${roomName}`;
    await booking.save();

    return res.json({
      success: true,
      data: {
        roomId:         roomName,
        livekitUrl,
        livekitToken,
        sessionType:    booking.sessionType,
        counsellorName: `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`,
        userName:       `${booking.user.firstName} ${booking.user.lastName}`,
        scheduledAt:    booking.scheduledAt,
        duration:       booking.sessionDuration,
      },
    });
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
    if (!booking.videoCall.roomId) {
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
      isCounsellor
    );

    return res.json({
      success: true,
      data: {
        roomId:         booking.videoCall.roomId,
        livekitUrl,
        livekitToken,
        sessionType:    booking.sessionType,
        counsellorName: `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`,
        userName:       `${booking.user.firstName} ${booking.user.lastName}`,
        scheduledAt:    booking.scheduledAt,
        duration:       booking.sessionDuration,
        status:         booking.status,
      },
    });
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

    if (booking.status === 'confirmed') {
      if (isCounsellor) {
        // Counsellor joining → start the session
        await booking.startSession();

        // Ensure room exists on LiveKit server
        if (booking.sessionType === 'video') {
          const roomName   = `menorah-${booking._id}`;
          const livekitUrl = process.env.LIVEKIT_URL || 'wss://livekit.menorahhealth.app';

          try {
            const client = getLivekitClient();
            await client.createRoom({
              name:            roomName,
              emptyTimeout:    300,
              maxParticipants: 10,
              metadata:        JSON.stringify({ bookingId: booking._id.toString() }),
            });
          } catch (livekitErr) {
            if (!livekitErr.message?.includes('already exists')) {
              console.error('LiveKit createRoom error on join:', livekitErr.message);
              return res.status(503).json({ success: false, message: 'Video service unavailable. Please try again.' });
            }
          }

          booking.videoCall.roomId  = roomName;
          booking.videoCall.roomUrl = `${livekitUrl}/${roomName}`;
          await booking.save();
        }

        // Notify user via Socket.IO
        const io = req.app.get('io');
        if (io) {
          const counsellorName = `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`;
          io.to(`user_${booking.user._id}`).emit('session_started', {
            bookingId:       booking._id.toString(),
            status:          'in-progress',
            sessionType:     booking.sessionType,
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
        // User joining before counsellor started
        return res.status(400).json({
          success: false,
          message: 'Session has not been started by the counsellor yet',
        });
      }
    }

    // If booking is already in-progress but the room was never created
    // (happens when the web app called PUT /bookings/:id/start first instead
    //  of going through this join endpoint), create it now.
    if (
      booking.status === 'in-progress' &&
      !booking.videoCall.roomId &&
      booking.sessionType === 'video' &&
      isCounsellor
    ) {
      const roomName   = `menorah-${booking._id}`;
      const livekitUrl = process.env.LIVEKIT_URL || 'wss://livekit.menorahhealth.app';
      try {
        const client = getLivekitClient();
        await client.createRoom({
          name:            roomName,
          emptyTimeout:    300,
          maxParticipants: 10,
          metadata:        JSON.stringify({ bookingId: booking._id.toString() }),
        });
      } catch (livekitErr) {
        if (!livekitErr.message?.includes('already exists')) {
          console.error('LiveKit createRoom error (in-progress path):', livekitErr.message);
          return res.status(503).json({ success: false, message: 'Video service unavailable. Please try again.' });
        }
      }
      booking.videoCall.roomId  = roomName;
      booking.videoCall.roomUrl = `${livekitUrl}/${roomName}`;
      await booking.save();
    }

    // Ensure room exists for video sessions
    if (booking.sessionType === 'video' && !booking.videoCall.roomId) {
      return res.status(400).json({ success: false, message: 'Video room not available for this session' });
    }

    const livekitUrl   = process.env.LIVEKIT_URL || 'wss://livekit.menorahhealth.app';
    const displayName  = isUser
      ? `${booking.user.firstName} ${booking.user.lastName}`
      : `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`;

    const livekitToken = await generateLivekitToken(
      req.user._id.toString(),
      displayName,
      booking.videoCall.roomId,
      isCounsellor
    );

    return res.json({
      success: true,
      message: 'Joined video room successfully',
      data: {
        roomId:         booking.videoCall.roomId,
        livekitUrl,
        livekitToken,
        sessionType:    booking.sessionType,
        counsellorName: `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`,
        userName:       `${booking.user.firstName} ${booking.user.lastName}`,
        scheduledAt:    booking.scheduledAt,
        duration:       booking.sessionDuration,
        status:         booking.status,
      },
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Menorah Session</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #0f172a; color: #fff; font-family: -apple-system, sans-serif; overflow: hidden; }
    #app { width: 100%; height: 100%; display: flex; flex-direction: column; }
    #videos { flex: 1; display: grid; grid-template-columns: 1fr; gap: 4px; padding: 4px; overflow: hidden; }
    #videos.two-up { grid-template-columns: 1fr 1fr; }
    .video-tile { position: relative; background: #1e293b; border-radius: 12px; overflow: hidden; aspect-ratio: 4/3; }
    .video-tile video { width: 100%; height: 100%; object-fit: cover; }
    .tile-name { position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,.5); padding: 2px 8px; border-radius: 12px; font-size: 12px; }
    .tile-audio-off { position: absolute; top: 8px; right: 8px; background: rgba(239,68,68,.8); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
    #controls { display: flex; justify-content: center; gap: 16px; padding: 16px; background: #1e293b; }
    .ctrl-btn { width: 52px; height: 52px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 22px; transition: transform .1s; }
    .ctrl-btn:active { transform: scale(.92); }
    .ctrl-btn.on  { background: #334155; }
    .ctrl-btn.off { background: #ef4444; }
    .ctrl-btn.leave { background: #ef4444; }
    #status { position: fixed; top: 0; left: 0; right: 0; padding: 12px 16px; background: rgba(15,23,42,.9); text-align: center; font-size: 14px; z-index: 10; display: none; }
    #status.show { display: block; }
  </style>
</head>
<body>
<div id="app">
  <div id="status" class="show">Connecting to session…</div>
  <div id="videos"></div>
  <div id="controls">
    <button id="btn-mic"   class="ctrl-btn on"    title="Mute">🎤</button>
    ${videoOnly ? '<button id="btn-cam" class="ctrl-btn on" title="Camera">📷</button>' : ''}
    <button id="btn-leave" class="ctrl-btn leave" title="Leave">📵</button>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js"></script>
<script>
(async () => {
  const TOKEN   = '${safeToken}';
  const WS_URL  = '${safeUrl}';
  const IS_VIDEO = ${videoOnly ? 'true' : 'false'};

  const videosEl = document.getElementById('videos');
  const statusEl = document.getElementById('status');

  const setStatus = (msg, hide) => {
    statusEl.textContent = msg;
    statusEl.className = hide ? '' : 'show';
  };

  const room = new LivekitClient.Room({
    adaptiveStream: true,
    dynacast:       true,
    videoCaptureDefaults: { resolution: LivekitClient.VideoPresets.h720.resolution },
  });

  // ── Track rendering ──────────────────────────────────────────────────────
  const tiles = {};

  function getOrCreateTile(identity) {
    if (tiles[identity]) return tiles[identity];
    const div = document.createElement('div');
    div.className = 'video-tile';
    div.id = 'tile-' + identity;
    div.innerHTML = '<div class="tile-name">' + identity + '</div>';
    videosEl.appendChild(div);
    tiles[identity] = div;
    updateGrid();
    return div;
  }

  function updateGrid() {
    const count = Object.keys(tiles).length;
    videosEl.className = count > 1 ? 'two-up' : '';
  }

  function removeTile(identity) {
    const div = tiles[identity];
    if (div) { div.remove(); delete tiles[identity]; }
    updateGrid();
  }

  function attachTrack(track, participant) {
    const tile = getOrCreateTile(participant.identity);
    const el   = track.attach();
    el.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;';
    // Replace existing same-kind element
    const old = tile.querySelector(track.kind === 'video' ? 'video' : 'audio');
    if (old) old.remove();
    tile.insertBefore(el, tile.firstChild);
  }

  function detachTrack(track, participant) {
    track.detach().forEach(el => el.remove());
    const tile = tiles[participant.identity];
    if (tile && !tile.querySelector('video') && !tile.querySelector('audio')) {
      removeTile(participant.identity);
    }
  }

  // ── Room events ──────────────────────────────────────────────────────────
  room
    .on(LivekitClient.RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      attachTrack(track, participant);
    })
    .on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
      detachTrack(track, participant);
    })
    .on(LivekitClient.RoomEvent.ParticipantDisconnected, (participant) => {
      removeTile(participant.identity);
    })
    .on(LivekitClient.RoomEvent.Disconnected, () => {
      setStatus('Session ended');
      notifyNative('session_ended');
    })
    .on(LivekitClient.RoomEvent.Reconnecting, () => setStatus('Reconnecting…'))
    .on(LivekitClient.RoomEvent.Reconnected,  () => setStatus('', true));

  // ── Connect ──────────────────────────────────────────────────────────────
  try {
    await room.connect(WS_URL, TOKEN, {
      autoSubscribe: true,
    });

    setStatus('', true);

    // Publish local tracks
    const trackOptions = { audio: true };
    if (IS_VIDEO) trackOptions.video = true;
    await room.localParticipant.enableCameraAndMicrophone();

    // Render local video
    const localVideoTrack = room.localParticipant.getTrackPublication(LivekitClient.Track.Source.Camera);
    if (localVideoTrack && localVideoTrack.track) {
      attachTrack(localVideoTrack.track, room.localParticipant);
    }

    // Render already-subscribed remote tracks (for late joiners)
    room.remoteParticipants.forEach(participant => {
      participant.trackPublications.forEach(pub => {
        if (pub.isSubscribed && pub.track) attachTrack(pub.track, participant);
      });
    });
  } catch (err) {
    setStatus('Failed to connect: ' + err.message);
    console.error('LiveKit connect error:', err);
  }

  // ── Controls ─────────────────────────────────────────────────────────────
  let micOn = true;
  let camOn = IS_VIDEO;

  document.getElementById('btn-mic').addEventListener('click', async () => {
    micOn = !micOn;
    await room.localParticipant.setMicrophoneEnabled(micOn);
    const btn = document.getElementById('btn-mic');
    btn.className = 'ctrl-btn ' + (micOn ? 'on' : 'off');
    btn.textContent = micOn ? '🎤' : '🔇';
  });

  if (IS_VIDEO) {
    document.getElementById('btn-cam').addEventListener('click', async () => {
      camOn = !camOn;
      await room.localParticipant.setCameraEnabled(camOn);
      const btn = document.getElementById('btn-cam');
      btn.className = 'ctrl-btn ' + (camOn ? 'on' : 'off');
      btn.textContent = camOn ? '📷' : '🚫';
    });
  }

  document.getElementById('btn-leave').addEventListener('click', async () => {
    await room.disconnect();
    notifyNative('leave');
  });

  // ── Notify React Native WebView ──────────────────────────────────────────
  function notifyNative(action) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ action }));
    }
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

module.exports = router;
