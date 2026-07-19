const express = require('express');
const { param, query, body, validationResult } = require('express-validator');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const sharp = require('sharp');
const moment = require('moment-timezone');
const Booking = require('../models/Booking');
const Counsellor = require('../models/Counsellor');
const User = require('../models/User');
const Payout = require('../models/Payout');
const { counsellorAuth } = require('../middleware/auth');
const { getRedisClient } = require('../config/redis');
const { uploadBuffer, deleteResource } = require('../utils/cloudinary');
const { encryptBankAccountNumber } = require('../utils/bankAccountEncryption');
const { payoutInFlightStatuses } = require('../services/payoutPolicy');

const SERVER_TZ = process.env.SERVER_TZ || 'Asia/Kolkata';

const router = express.Router();
const MAX_COUNSELLOR_MEDIA_BYTES = parseInt(process.env.COUNSELLOR_MEDIA_MAX_FILE_SIZE, 10) || 12 * 1024 * 1024;
const SAFE_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp']);
const SAFE_AUDIO_KINDS = new Map([
  ['webm', { extension: '.webm', mimeType: 'audio/webm' }],
  ['ogg', { extension: '.ogg', mimeType: 'audio/ogg' }],
  ['mp3', { extension: '.mp3', mimeType: 'audio/mpeg' }],
  ['mp4', { extension: '.m4a', mimeType: 'audio/mp4' }],
  ['wav', { extension: '.wav', mimeType: 'audio/wav' }],
]);
const PROFILE_BACKGROUND_REMOVAL_ENABLED = process.env.COUNSELLOR_PROFILE_BACKGROUND_REMOVAL !== 'false';
const PROFILE_BACKGROUND_THRESHOLD = parseInt(process.env.COUNSELLOR_PROFILE_BACKGROUND_THRESHOLD, 10) || 58;
const PROFILE_BACKGROUND_MIN_RETAINED_RATIO =
  parseFloat(process.env.COUNSELLOR_PROFILE_BACKGROUND_MIN_RETAINED_RATIO) || 0.08;

const profileMediaUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.COUNSELLOR_MEDIA_RATE_LIMIT_MAX, 10) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many profile media uploads. Please try again later.',
  },
});

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_COUNSELLOR_MEDIA_BYTES,
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'profileImage' && file.mimetype?.startsWith('image/')) {
      return cb(null, true);
    }

    const isVoiceIntro =
      file.fieldname === 'voiceIntro' &&
      (file.mimetype?.startsWith('audio/') || file.mimetype === 'video/webm');

    if (isVoiceIntro) return cb(null, true);

    cb(new Error('Profile media must include an image selfie or an audio voice intro'));
  },
});

const formatVideoCall = (videoCall = {}) => ({
  provider: videoCall.provider,
  joinMode: videoCall.joinMode,
  externalProviderName: videoCall.externalProviderName,
  externalJoinUrl: videoCall.externalJoinUrl,
  externalHostUrl: videoCall.externalHostUrl,
  region: videoCall.region,
  status: videoCall.status,
  policyReason: videoCall.policyReason,
  configuredAt: videoCall.configuredAt,
  roomId: videoCall.roomId,
  roomUrl: videoCall.roomUrl
});

// Helper function to get counselor from user
const getCounsellorFromUser = async (userId) => {
  return await Counsellor.findOne({ user: userId });
};

const normalizeTagList = (tags, { limit = 20 } = {}) => {
  const seen = new Set();
  const normalized = [];

  for (const raw of Array.isArray(tags) ? tags : []) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().replace(/\s+/g, ' ');
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
    if (normalized.length >= limit) break;
  }

  return normalized;
};

const invalidateCounsellorDiscoveryCache = async () => {
  try {
    const redis = getRedisClient();
    const keys = ['counsellors:specializations', 'counsellors:languages'];
    let cursor = '0';

    do {
      const result = await redis.scan(cursor, { MATCH: 'counsellors:list:*', COUNT: 100 });
      const nextCursor = Array.isArray(result) ? result[0] : result.cursor;
      const foundKeys = Array.isArray(result) ? result[1] : result.keys;
      cursor = String(nextCursor);
      keys.push(...(foundKeys || []));
    } while (cursor !== '0');

    if (keys.length > 0) await redis.del(keys);
  } catch (error) {
    console.warn('Counsellor discovery cache invalidation failed:', error.message);
  }
};

const hasCompletedProfileMedia = (counsellor) => Boolean(counsellor?.profileImage && counsellor?.voiceIntroUrl);

const stripApiPath = (rawUrl) => {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    parsed.pathname = parsed.pathname.replace(/\/api\/?$/, '') || '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

const getConfiguredPublicBaseUrl = (req) => {
  const configured =
    stripApiPath(process.env.MEDIA_PUBLIC_BASE_URL) ||
    stripApiPath(process.env.FRONTEND_API_WEB_URL) ||
    stripApiPath(process.env.API_PUBLIC_URL) ||
    stripApiPath(process.env.NEXT_PUBLIC_API_URL);

  if (configured) return configured;
  if (process.env.API_WEB_DOMAIN) return `https://${process.env.API_WEB_DOMAIN}`;
  return `${req.protocol}://${req.get('host')}`;
};

const isWithinPath = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const detectAudioKind = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE') return 'wav';
  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') return 'ogg';
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3') return 'mp3';
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'mp3';
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'mp4';
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'webm';
  return null;
};

const colorDistance = (a, b) => {
  const red = a[0] - b[0];
  const green = a[1] - b[1];
  const blue = a[2] - b[2];
  return Math.sqrt(red * red + green * green + blue * blue);
};

const averagePatchColor = (data, width, height, startX, startY, size = 12) => {
  const color = [0, 0, 0];
  let count = 0;

  for (let y = startY; y < Math.min(height, startY + size); y += 1) {
    for (let x = startX; x < Math.min(width, startX + size); x += 1) {
      const index = (y * width + x) * 4;
      color[0] += data[index];
      color[1] += data[index + 1];
      color[2] += data[index + 2];
      count += 1;
    }
  }

  return count ? color.map((channel) => channel / count) : color;
};

const addPaletteColor = (palette, color, mergeThreshold = 22, maxColors = 56) => {
  const existing = palette.find((candidate) => colorDistance(candidate, color) <= mergeThreshold);
  if (existing) {
    existing[0] = (existing[0] * 0.8) + (color[0] * 0.2);
    existing[1] = (existing[1] * 0.8) + (color[1] * 0.2);
    existing[2] = (existing[2] * 0.8) + (color[2] * 0.2);
    return;
  }

  if (palette.length < maxColors) {
    palette.push(color);
  }
};

const buildEdgeBackgroundPalette = (data, width, height) => {
  const palette = [];
  const shortestSide = Math.min(width, height);
  const patchSize = Math.max(6, Math.round(shortestSide * 0.018));
  const cornerSize = Math.max(8, Math.round(shortestSide * 0.035));
  const xStep = Math.max(1, Math.round(width / 36));
  const yStep = Math.max(1, Math.round(height / 36));

  [
    [0, 0, cornerSize],
    [Math.max(0, width - cornerSize), 0, cornerSize],
    [0, Math.max(0, height - cornerSize), cornerSize],
    [Math.max(0, width - cornerSize), Math.max(0, height - cornerSize), cornerSize],
  ].forEach(([x, y, size]) => {
    addPaletteColor(palette, averagePatchColor(data, width, height, x, y, size));
  });

  for (let x = 0; x < width; x += xStep) {
    addPaletteColor(palette, averagePatchColor(data, width, height, x, 0, patchSize));
    addPaletteColor(palette, averagePatchColor(data, width, height, x, Math.max(0, height - patchSize), patchSize));
  }

  for (let y = 0; y < height; y += yStep) {
    addPaletteColor(palette, averagePatchColor(data, width, height, 0, y, patchSize));
    addPaletteColor(palette, averagePatchColor(data, width, height, Math.max(0, width - patchSize), y, patchSize));
  }

  return palette;
};

const removeProfileBackground = async (inputBuffer) => {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const backgroundColors = buildEdgeBackgroundPalette(data, width, height);

  const totalPixels = width * height;
  const background = new Uint8Array(totalPixels);
  const queue = [];
  const threshold = PROFILE_BACKGROUND_THRESHOLD;
  const edgeThreshold = threshold + 12;

  const isBackgroundLike = (pixelIndex, multiplier = 1) => {
    const dataIndex = pixelIndex * 4;
    const color = [data[dataIndex], data[dataIndex + 1], data[dataIndex + 2]];
    return backgroundColors.some((candidate) => colorDistance(color, candidate) <= threshold * multiplier);
  };

  const enqueueIfBackground = (x, y, multiplier = 1) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const pixelIndex = y * width + x;
    if (background[pixelIndex]) return;
    if (!isBackgroundLike(pixelIndex, multiplier)) return;
    background[pixelIndex] = 1;
    queue.push(pixelIndex);
  };

  for (let x = 0; x < width; x += 1) {
    enqueueIfBackground(x, 0, edgeThreshold / threshold);
    enqueueIfBackground(x, height - 1, edgeThreshold / threshold);
  }

  for (let y = 0; y < height; y += 1) {
    enqueueIfBackground(0, y, edgeThreshold / threshold);
    enqueueIfBackground(width - 1, y, edgeThreshold / threshold);
  }

  for (let head = 0; head < queue.length; head += 1) {
    const pixelIndex = queue[head];
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    enqueueIfBackground(x + 1, y);
    enqueueIfBackground(x - 1, y);
    enqueueIfBackground(x, y + 1);
    enqueueIfBackground(x, y - 1);
  }

  const rgb = Buffer.alloc(totalPixels * 3);
  const alpha = Buffer.alloc(totalPixels);
  let retainedPixels = 0;

  for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += 1) {
    const sourceIndex = pixelIndex * 4;
    const rgbIndex = pixelIndex * 3;
    rgb[rgbIndex] = data[sourceIndex];
    rgb[rgbIndex + 1] = data[sourceIndex + 1];
    rgb[rgbIndex + 2] = data[sourceIndex + 2];
    if (background[pixelIndex]) {
      alpha[pixelIndex] = 0;
    } else {
      retainedPixels += 1;
      alpha[pixelIndex] = data[sourceIndex + 3];
    }
  }

  if (retainedPixels / totalPixels < PROFILE_BACKGROUND_MIN_RETAINED_RATIO) {
    return null;
  }

  const softenedAlpha = await sharp(alpha, {
    raw: { width, height, channels: 1 },
  })
    .blur(0.8)
    .toBuffer();

  return sharp(rgb, {
    raw: { width, height, channels: 3 },
  })
    .joinChannel(softenedAlpha, { raw: { width, height, channels: 1 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
};

const sanitizeProfileImage = async (file) => {
  try {
    const image = sharp(file.buffer, {
      failOn: 'warning',
      limitInputPixels: 16_000_000,
    });
    const metadata = await image.metadata();

    if (!metadata.format || !SAFE_IMAGE_FORMATS.has(metadata.format)) {
      const error = new Error('Profile selfie must be a JPEG, PNG, or WebP image');
      error.statusCode = 400;
      throw error;
    }

    const buffer = await image
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();

    if (PROFILE_BACKGROUND_REMOVAL_ENABLED) {
      const transparentBuffer = await removeProfileBackground(buffer);

      if (transparentBuffer) {
        return {
          buffer: transparentBuffer,
          mimetype: 'image/png',
          safeExtension: '.png',
        };
      }
    }

    return {
      buffer,
      mimetype: 'image/jpeg',
      safeExtension: '.jpg',
    };
  } catch (error) {
    if (error.statusCode) throw error;
    const validationError = new Error('Profile selfie could not be validated as a safe image');
    validationError.statusCode = 400;
    throw validationError;
  }
};

const validateVoiceIntro = async (file) => {
  const kind = detectAudioKind(file.buffer);
  const audioConfig = kind ? SAFE_AUDIO_KINDS.get(kind) : null;

  if (!audioConfig) {
    const error = new Error('Voice intro must be a valid WebM, OGG, MP3, M4A, or WAV audio file');
    error.statusCode = 400;
    throw error;
  }

  try {
    const { parseBuffer } = await import('music-metadata');
    const metadata = await parseBuffer(file.buffer, audioConfig.mimeType, { duration: true });
    const duration = metadata.format.duration;

    return {
      buffer: file.buffer,
      mimetype: audioConfig.mimeType,
      safeExtension: audioConfig.extension,
      durationSeconds: Number.isFinite(duration) ? Math.round(duration * 10) / 10 : null,
    };
  } catch (error) {
    if (error.statusCode) throw error;
    const validationError = new Error('Voice intro could not be validated as a safe audio file');
    validationError.statusCode = 400;
    throw validationError;
  }
};

const storeCounsellorMediaFile = async (req, file, { kind, folder, resourceType, publicIdPrefix }) => {
  const forceLocal = process.env.COUNSELLOR_MEDIA_STORAGE === 'local';
  const publicId = `${publicIdPrefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  if (!forceLocal) {
    try {
      const result = await uploadBuffer(file.buffer, {
        folder,
        resource_type: resourceType,
        public_id: publicId,
      });
      return {
        url: result.secure_url,
        publicId: result.public_id || `${folder}/${publicId}`,
        localPath: null,
      };
    } catch (error) {
      const mustUseCloudinary = process.env.NODE_ENV === 'production' && process.env.SERVICE_RUNTIME !== 'home';
      if (mustUseCloudinary) throw error;
      console.warn(`Falling back to local ${kind} storage:`, error.message);
    }
  }

  const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_PATH || './uploads');
  const relativeDir = path.join('counsellor-media', kind);
  const targetDir = path.join(uploadRoot, relativeDir);
  await fs.mkdir(targetDir, { recursive: true });
  const filename = `${publicId}${file.safeExtension}`;
  const fullPath = path.join(targetDir, filename);
  await fs.writeFile(fullPath, file.buffer, { mode: 0o600 });
  const publicRelativePath = `${relativeDir.replace(/\\/g, '/')}/${filename}`;
  return {
    url: `${getConfiguredPublicBaseUrl(req)}/uploads/${publicRelativePath}`,
    publicId: null,
    localPath: publicRelativePath,
  };
};

const deleteLocalMedia = async (storedPathOrUrl) => {
  if (!storedPathOrUrl) return;

  const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_PATH || './uploads');
  let relativePath = storedPathOrUrl;

  try {
    const parsed = new URL(storedPathOrUrl);
    const marker = '/uploads/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return;
    relativePath = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    // storedPathOrUrl may already be a relative upload path.
  }

  if (!relativePath.startsWith('counsellor-media/')) return;

  const fullPath = path.resolve(uploadRoot, relativePath);
  if (!isWithinPath(uploadRoot, fullPath)) return;

  await fs.unlink(fullPath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
};

const deleteStoredCounsellorMedia = async ({ url, publicId, localPath, resourceType }) => {
  try {
    if (publicId) {
      await deleteResource(publicId, { resource_type: resourceType });
      return;
    }

    await deleteLocalMedia(localPath || url);
  } catch (error) {
    console.warn('Old counsellor media cleanup failed:', error.message);
  }
};

const uploadProfileMedia = (req, res, next) => {
  mediaUpload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'voiceIntro', maxCount: 1 },
  ])(req, res, (error) => {
    if (!error) return next();
    const isTooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    return res.status(400).json({
      success: false,
      message: isTooLarge
        ? 'Profile media file is too large'
        : error.message || 'Profile media could not be uploaded',
    });
  });
};

// @route   PUT /api/counsellors/me/profile-media
// @desc    Upload mandatory counsellor selfie and voice intro
// @access  Private (Counsellor)
router.put('/me/profile-media', profileMediaUploadLimiter, counsellorAuth, uploadProfileMedia, async (req, res) => {
  let uploadedProfileImage = null;
  let uploadedVoiceIntro = null;

  try {
    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    const profileImage = req.files?.profileImage?.[0];
    const voiceIntro = req.files?.voiceIntro?.[0];

    if (!profileImage && !voiceIntro) {
      return res.status(400).json({
        success: false,
        message: 'Upload a selfie and a voice intro to complete onboarding'
      });
    }

    const previousProfileImage = {
      url: counsellor.profileImage,
      publicId: counsellor.profileImagePublicId,
      localPath: counsellor.profileImageLocalPath,
      resourceType: 'image',
    };
    const previousVoiceIntro = {
      url: counsellor.voiceIntroUrl,
      publicId: counsellor.voiceIntroPublicId,
      localPath: counsellor.voiceIntroLocalPath,
      resourceType: 'video',
    };

    let nextProfileImage = null;
    let nextVoiceIntro = null;

    if (profileImage) {
      const safeProfileImage = await sanitizeProfileImage(profileImage);
      nextProfileImage = await storeCounsellorMediaFile(req, safeProfileImage, {
        kind: 'selfies',
        folder: 'menorah/counsellor-selfies',
        resourceType: 'image',
        publicIdPrefix: `counsellor_${counsellor._id}_selfie`,
      });
      uploadedProfileImage = { ...nextProfileImage, resourceType: 'image' };
      counsellor.profileImage = nextProfileImage.url;
      counsellor.profileImagePublicId = nextProfileImage.publicId;
      counsellor.profileImageLocalPath = nextProfileImage.localPath;
    }

    if (voiceIntro) {
      const safeVoiceIntro = await validateVoiceIntro(voiceIntro);
      nextVoiceIntro = await storeCounsellorMediaFile(req, safeVoiceIntro, {
        kind: 'voice-intros',
        folder: 'menorah/counsellor-voice-intros',
        resourceType: 'video',
        publicIdPrefix: `counsellor_${counsellor._id}_voice`,
      });
      uploadedVoiceIntro = { ...nextVoiceIntro, resourceType: 'video' };
      counsellor.voiceIntroUrl = nextVoiceIntro.url;
      counsellor.voiceIntroPublicId = nextVoiceIntro.publicId;
      counsellor.voiceIntroLocalPath = nextVoiceIntro.localPath;
      counsellor.voiceIntroDurationSeconds = safeVoiceIntro.durationSeconds;
    }

    if (counsellor.profileImage && counsellor.voiceIntroUrl) {
      counsellor.profileMediaCompletedAt = counsellor.profileMediaCompletedAt || new Date();
    }

    await counsellor.save();
    uploadedProfileImage = null;
    uploadedVoiceIntro = null;
    if (nextProfileImage) {
      await User.findByIdAndUpdate(req.user._id, { profileImage: nextProfileImage.url }).catch((error) => {
        console.warn('Failed to mirror counsellor profile image to user record:', error.message);
      });
      await deleteStoredCounsellorMedia(previousProfileImage);
    }
    if (nextVoiceIntro) {
      await deleteStoredCounsellorMedia(previousVoiceIntro);
    }
    await invalidateCounsellorDiscoveryCache();

    return res.json({
      success: true,
      message: counsellor.profileImage && counsellor.voiceIntroUrl
        ? 'Profile media completed.'
        : 'Profile media saved. Add the remaining required item to go live.',
      data: {
        counsellorProfile: {
          profileImage: counsellor.profileImage || null,
          voiceIntroUrl: counsellor.voiceIntroUrl || null,
          voiceIntroDurationSeconds: counsellor.voiceIntroDurationSeconds || null,
          profileMediaCompletedAt: counsellor.profileMediaCompletedAt || null,
          profileMediaComplete: Boolean(counsellor.profileImage && counsellor.voiceIntroUrl),
        }
      }
    });
  } catch (error) {
    if (uploadedProfileImage) await deleteStoredCounsellorMedia(uploadedProfileImage);
    if (uploadedVoiceIntro) await deleteStoredCounsellorMedia(uploadedVoiceIntro);

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error('Upload counsellor profile media error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload profile media'
    });
  }
});

// @route   GET /api/counsellors/me/bookings/pending
// @desc    Get unassigned bookings available for acceptance
// @access  Private (Counsellor)
router.get('/me/bookings/pending', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], counsellorAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    // Allow viewing pending bookings even if temporarily unavailable
    // Only check if counsellor profile exists and is active
    if (!counsellor.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor profile is not active'
      });
    }

    if (!hasCompletedProfileMedia(counsellor)) {
      return res.status(400).json({
        success: false,
        message: 'Complete your mandatory selfie and voice intro before viewing new pending assignments.'
      });
    }

    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;

    // Get counsellor's gender from their User record for gender-based filtering
    const counsellorGender = req.user.gender; // e.g. 'male', 'female', 'other'

    // Build gender filter:
    // - If counsellor has gender set: show bookings matching their gender + 'any' + no preference
    // - If counsellor has NO gender set: show only 'any' + no preference (never show gender-specific bookings)
    const genderOrClauses = counsellorGender
      ? [
          { 'preferences.gender': counsellorGender },
          { 'preferences.gender': 'any' },
          { 'preferences.gender': { $exists: false } },
          { 'preferences.gender': null },
        ]
      : [
          { 'preferences.gender': 'any' },
          { 'preferences.gender': { $exists: false } },
          { 'preferences.gender': null },
        ];

    const query = {
      counsellor: null,
      status: { $in: ['pending', 'confirmed'] },
      scheduledAt: { $gte: new Date() },
      $or: genderOrClauses,
    };

    // Calculate pagination
    const skip = (pageNum - 1) * limitNum;


    // Execute query
    const bookings = await Booking.find(query)
      .populate({
        path: 'user',
        select: 'firstName lastName email phone profileImage gender'
      })
      .sort({ scheduledAt: 1 }) // Earliest first
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count
    const total = await Booking.countDocuments(query);
    
    console.log(`Found ${bookings.length} pending bookings out of ${total} total`);

    // Format response
    const formattedBookings = bookings
      .filter(booking => booking.user) // Filter out bookings with null/undefined users
      .map(booking => ({
        id: booking._id,
        userName: `${booking.user?.firstName || ''} ${booking.user?.lastName || ''}`.trim() || 'Unknown User',
        userEmail: booking.user?.email || '',
        userPhone: booking.user?.phone || '',
        userImage: booking.user?.profileImage,
        userGender: booking.user?.gender,
        sessionType: booking.sessionType,
        sessionDuration: booking.sessionDuration,
        scheduledAt: booking.scheduledAt,
        amount: booking.amount,
        currency: booking.currency,
        paymentStatus: booking.paymentStatus,
        isSubscriptionBooking: booking.isSubscriptionBooking || false,
        paymentMethod: booking.paymentMethod,
        preferences: booking.preferences,
        symptoms: booking.symptoms,
        concerns: booking.concerns,
        goals: booking.goals,
        emergencyContact: booking.emergencyContact,
        videoCall: formatVideoCall(booking.videoCall),
        createdAt: booking.createdAt
      }));

    res.json({
      success: true,
      data: {
        bookings: formattedBookings,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });

  } catch (error) {
    console.error('Get pending bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/counsellors/me/bookings/:id
// @desc    Get a specific booking by ID
// @access  Private (Counsellor)
router.get('/me/bookings/:id', [
  param('id').isMongoId().withMessage('Invalid booking ID')
], counsellorAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    const { id } = req.params;

    // Find booking that counselor can access (matching dashboard logic):
    // 1. Assigned to this counselor (any status except cancelled)
    // 2. Unassigned pending/confirmed bookings (available for any counselor)
    let booking = await Booking.findOne({
      _id: id,
      status: { $ne: 'cancelled' }, // Exclude cancelled bookings
      $or: [
        { counsellor: counsellor._id }, // Assigned to this counselor
        { 
          counsellor: null, 
          status: { $in: ['pending', 'confirmed'] } // Unassigned available bookings
        }
      ]
    })
      .populate({
        path: 'user',
        select: 'firstName lastName email phone profileImage gender'
      })
      .lean();

    if (!booking) {
      // If not found with the above criteria, check if booking exists at all
      // This helps with debugging
      const bookingExists = await Booking.findById(id).lean();
      if (bookingExists) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this booking. It may be assigned to another counselor or is not available.'
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Format response
    const formattedBooking = {
      id: booking._id,
      userName: booking.user ? `${booking.user?.firstName || ''} ${booking.user?.lastName || ''}`.trim() || 'Unknown User' : 'Unknown User',
      userEmail: booking.user?.email || '',
      userPhone: booking.user?.phone || '',
      userImage: booking.user?.profileImage,
      userGender: booking.user?.gender,
      sessionType: booking.sessionType,
      sessionDuration: booking.sessionDuration,
      scheduledAt: booking.scheduledAt,
      status: booking.status,
      amount: booking.amount,
      currency: booking.currency,
      paymentStatus: booking.paymentStatus,
      symptoms: booking.symptoms,
      concerns: booking.concerns,
      goals: booking.goals,
      emergencyContact: booking.emergencyContact,
      preferences: booking.preferences,
      videoCall: formatVideoCall(booking.videoCall),
      assignedAt: booking.assignedAt,
      createdAt: booking.createdAt,
      statusHistory: booking.statusHistory
    };

    res.json({
      success: true,
      data: { booking: formattedBooking }
    });

  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/counsellors/me/bookings
// @desc    Get counselor's assigned bookings
// @access  Private (Counsellor)
router.get('/me/bookings', [
  query('status').optional().isIn(['pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], counsellorAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

    // Build query
    const query = { counsellor: counsellor._id };
    if (status) {
      query.status = status;
    }
    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const bookings = await Booking.find(query)
      .populate({
        path: 'user',
        select: 'firstName lastName email phone profileImage'
      })
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Booking.countDocuments(query);

    // Format response
    const formattedBookings = bookings
      .filter(booking => booking.user) // Filter out bookings with null/undefined users
      .map(booking => ({
        id: booking._id,
        userName: `${booking.user?.firstName || ''} ${booking.user?.lastName || ''}`.trim() || 'Unknown User',
        userEmail: booking.user?.email || '',
        userPhone: booking.user?.phone || '',
        userImage: booking.user?.profileImage,
      sessionType: booking.sessionType,
      sessionDuration: booking.sessionDuration,
      scheduledAt: booking.scheduledAt,
      status: booking.status,
      amount: booking.amount,
      currency: booking.currency,
      paymentStatus: booking.paymentStatus,
      isSubscriptionBooking: booking.isSubscriptionBooking || false,
      paymentMethod: booking.paymentMethod,
      symptoms: booking.symptoms,
      concerns: booking.concerns,
      goals: booking.goals,
      emergencyContact: booking.emergencyContact,
      assignedAt: booking.assignedAt
    }));

    res.json({
      success: true,
      data: {
        bookings: formattedBookings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get counsellor bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/counsellors/me/bookings/:id/accept
// @desc    Counselor accepts/assigns themselves to a booking
// @access  Private (Counsellor)
router.post('/me/bookings/:id/accept', [
  param('id').isMongoId().withMessage('Invalid booking ID')
], counsellorAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    // Check if counselor is available to accept bookings
    if (!counsellor.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor account is not active'
      });
    }

    if (!hasCompletedProfileMedia(counsellor)) {
      return res.status(400).json({
        success: false,
        message: 'Complete your mandatory selfie and voice intro before accepting bookings.'
      });
    }

    if (!counsellor.isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor is currently not available to accept new bookings. Please set your availability to "Available" to accept bookings.'
      });
    }

    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate('user', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.counsellor) {
      // If already assigned to THIS counsellor, just set assignedAt and return success
      if (booking.counsellor.toString() === counsellor._id.toString()) {
        if (!booking.assignedAt) {
          booking.assignedAt = new Date();
          await booking.save();
        }
        return res.json({
          success: true,
          message: 'Booking confirmed',
          data: {
            booking: {
              id: booking._id,
              status: booking.status,
              assignedAt: booking.assignedAt
            }
          }
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Booking is already assigned to another counsellor'
      });
    }

    // Allow accepting unassigned bookings that are pending or confirmed
    // (confirmed but unassigned is an edge case that can happen)
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot accept booking with status '${booking.status}'. Only pending or confirmed unassigned bookings can be accepted.`
      });
    }

    // Check if this is an instant session (unassigned pending/confirmed booking)
    // For instant sessions, we skip time-based conflict checks since they can start immediately
    const now = new Date();
    const scheduledTime = new Date(booking.scheduledAt);
    // Instant sessions are unassigned bookings that are pending or confirmed
    const isInstantSession = !booking.counsellor && ['pending', 'confirmed'].includes(booking.status);
    
    if (!isInstantSession) {
      // For scheduled sessions, check availability and time conflicts
      // Get day of week as lowercase string (monday, tuesday, etc.)
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayOfWeek = days[scheduledTime.getDay()];
      const timeString = scheduledTime.toTimeString().slice(0, 5);
      
      // Check if availability exists and has the day
      if (!counsellor.availability || typeof counsellor.availability !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Counsellor availability is not configured'
        });
      }
      
      const daySchedule = counsellor.availability[dayOfWeek];

      if (!daySchedule || !daySchedule.isAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Counsellor is not available on this day'
        });
      }

      if (!daySchedule.start || !daySchedule.end) {
        return res.status(400).json({
          success: false,
          message: 'Counsellor working hours are not configured for this day'
        });
      }

      if (timeString < daySchedule.start || timeString > daySchedule.end) {
        return res.status(400).json({
          success: false,
          message: 'Scheduled time is outside counsellor\'s working hours'
        });
      }

      // Check for conflicting bookings (only for scheduled sessions)
      const conflictingBooking = await Booking.findOne({
        counsellor: counsellor._id,
        scheduledAt: {
          $gte: new Date(scheduledTime.getTime() - booking.sessionDuration * 60 * 1000),
          $lte: new Date(scheduledTime.getTime() + booking.sessionDuration * 60 * 1000)
        },
        status: { $in: ['pending', 'confirmed', 'in-progress'] },
        _id: { $ne: booking._id }
      });

      if (conflictingBooking) {
        return res.status(400).json({
          success: false,
          message: 'Counsellor has a conflicting booking at this time'
        });
      }
    } else {
      // For instant sessions, only check if counselor has an active in-progress session
      // Multiple instant sessions can be accepted, but only one can be in-progress at a time
      const activeSession = await Booking.findOne({
        counsellor: counsellor._id,
        status: 'in-progress',
        _id: { $ne: booking._id }
      });

      if (activeSession) {
        return res.status(400).json({
          success: false,
          message: 'Counsellor is currently in an active session. Please complete it before accepting a new booking.'
        });
      }
    }

    const assignedAt = new Date();
    const bookingUpdates = {
      counsellor: counsellor._id,
      assignedAt,
      status: 'confirmed'
    };
    
    // Update amount based on counsellor's rate if not already set
    if (!booking.amount || booking.amount === 0) {
      bookingUpdates.amount = (counsellor.hourlyRate / 60) * booking.sessionDuration;
      bookingUpdates.currency = counsellor.currency;
    }

    const acceptedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: { $in: ['pending', 'confirmed'] },
        $or: [
          { counsellor: { $exists: false } },
          { counsellor: null }
        ]
      },
      { $set: bookingUpdates },
      { new: true, runValidators: true }
    ).populate('user', 'firstName lastName email phone');

    if (!acceptedBooking) {
      return res.status(409).json({
        success: false,
        message: 'Booking was already accepted by another counsellor'
      });
    }

    // Emit Socket.IO event (will be handled in server.js)
    if (req.app.get('io') && acceptedBooking.user) {
      const io = req.app.get('io');
      io.to(`counsellor_${counsellor._id}`).emit('booking_assigned', {
        bookingId: acceptedBooking._id,
        userId: acceptedBooking.user._id,
        scheduledAt: acceptedBooking.scheduledAt
      });
      
      // Notify user
      io.to(`user_${acceptedBooking.user._id}`).emit('booking_confirmed', {
        bookingId: acceptedBooking._id,
        counsellorName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || 'Counsellor'
      });
    }

    res.json({
      success: true,
      message: 'Booking accepted successfully',
      data: {
        booking: {
          id: acceptedBooking._id,
          status: acceptedBooking.status,
          assignedAt: acceptedBooking.assignedAt
        }
      }
    });

  } catch (error) {
    console.error('Accept booking error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/counsellors/me/bookings/:id/schedule
// @desc    Counselor schedules/reschedules a session time
// @access  Private (Counsellor)
router.put('/me/bookings/:id/schedule', [
  param('id').isMongoId().withMessage('Invalid booking ID'),
  body('scheduledAt').isISO8601().withMessage('Invalid scheduled date')
], counsellorAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    const { id } = req.params;
    const { scheduledAt } = req.body;

    const booking = await Booking.findById(id)
      .populate('user', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.counsellor?.toString() !== counsellor._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This booking is not assigned to you'
      });
    }

    const scheduledTime = new Date(scheduledAt);
    
    // Check if scheduled time is in the future
    if (scheduledTime <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Scheduled time must be in the future'
      });
    }

    // Check counsellor availability only if they have explicitly configured it
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = days[scheduledTime.getDay()];
    const timeString = scheduledTime.toTimeString().slice(0, 5);

    if (counsellor.availability && typeof counsellor.availability === 'object') {
      const daySchedule = counsellor.availability[dayOfWeek];
      if (daySchedule && daySchedule.isAvailable === false) {
        return res.status(400).json({
          success: false,
          message: `You are not available on ${dayOfWeek}s. Please choose another day.`
        });
      }
      if (daySchedule && daySchedule.isAvailable && daySchedule.start && daySchedule.end) {
        if (timeString < daySchedule.start || timeString > daySchedule.end) {
          return res.status(400).json({
            success: false,
            message: `Your working hours on ${dayOfWeek} are ${daySchedule.start}–${daySchedule.end}. Please pick a time within that range.`
          });
        }
      }
    }

    // Check for conflicting bookings
    const conflictingBooking = await Booking.findOne({
      counsellor: counsellor._id,
      scheduledAt: {
        $gte: new Date(scheduledTime.getTime() - booking.sessionDuration * 60 * 1000),
        $lte: new Date(scheduledTime.getTime() + booking.sessionDuration * 60 * 1000)
      },
      status: { $in: ['pending', 'confirmed'] },
      _id: { $ne: booking._id }
    });

    if (conflictingBooking) {
      return res.status(400).json({
        success: false,
        message: 'Counsellor has a conflicting booking at this time'
      });
    }

    // Update scheduled time
    const oldScheduledAt = booking.scheduledAt;
    booking.scheduledAt = scheduledTime;
    await booking.save();

    // Emit Socket.IO event
    if (req.app.get('io') && booking.user) {
      const io = req.app.get('io');
      const userId = booking.user._id || booking.user;

      // Notify the counsellor's own room
      io.to(`counsellor_${counsellor._id}`).emit('booking_scheduled', {
        bookingId: booking._id,
        scheduledAt: booking.scheduledAt,
        oldScheduledAt,
      });

      // Notify the user with full details so their UI can update
      const counsellorUser = await require('../models/User').findById(counsellor.user).select('firstName lastName');
      const counsellorName = counsellorUser ? `${counsellorUser.firstName} ${counsellorUser.lastName}` : 'Your counsellor';
      io.to(`user_${userId}`).emit('booking_rescheduled', {
        bookingId: booking._id,
        scheduledAt: booking.scheduledAt,
        oldScheduledAt,
        counsellorName,
      });
    }

    res.json({
      success: true,
      message: 'Session scheduled successfully',
      data: {
        booking: {
          id: booking._id,
          scheduledAt: booking.scheduledAt
        }
      }
    });

  } catch (error) {
    console.error('Schedule booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/counsellors/me/dashboard
// @desc    Get counselor dashboard statistics
// @access  Private (Counsellor)
router.get('/me/dashboard', counsellorAuth, async (req, res) => {
  try {
    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: 'Counsellor profile not found'
      });
    }

    const profileMediaComplete = hasCompletedProfileMedia(counsellor);
    // Only active, available counselors with public-ready profile media can see unassigned bookings.
    const isCounsellorAvailable = counsellor.isActive && counsellor.isAvailable && profileMediaComplete;

    const now = new Date();
    const nowLocal = moment.tz(now, SERVER_TZ);
    const startOfMonth = nowLocal.clone().startOf('month').toDate();
    const endOfMonth = nowLocal.clone().endOf('month').toDate();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Total bookings - ALL bookings that counselors can work with
    // Includes: assigned to this counselor OR unassigned (only if counselor is available)
    const totalBookings = await Booking.countDocuments({
      $or: [
        { counsellor: counsellor._id }, // Always show assigned bookings
        ...(isCounsellorAvailable ? [{ counsellor: null, status: { $in: ['pending', 'confirmed'] } }] : []) // Only show unassigned if available
      ],
      status: { $ne: 'cancelled' }
    });

    // Upcoming sessions (next 7 days) - ALL available bookings
    const upcomingSessions = await Booking.countDocuments({
      $or: [
        { counsellor: counsellor._id }, // Always show assigned bookings
        ...(isCounsellorAvailable ? [{ counsellor: null, status: 'pending' }] : []) // Only show unassigned if available
      ],
      scheduledAt: { $gte: now, $lte: next7Days },
      status: { $in: ['confirmed', 'pending'] }
    });

    // Pending assignments — unassigned bookings (including subscription auto-confirmed ones)
    const pendingAssignments = isCounsellorAvailable
      ? await Booking.countDocuments({
          counsellor: null,
          status: { $in: ['pending', 'confirmed'] }
        })
      : 0;

    // Monthly earnings - only paid bookings, after counsellor's commission share
    const commissionRate = counsellor.commissionRate ?? 20;
    const counsellorShare = (100 - commissionRate) / 100;
    const monthlyBookings = await Booking.find({
      counsellor: counsellor._id,
      scheduledAt: { $gte: startOfMonth, $lte: endOfMonth },
      paymentStatus: 'paid'
    }).select('amount').lean();

    const monthlyEarnings = monthlyBookings.reduce((total, booking) => {
      return total + (booking.amount || 0) * counsellorShare;
    }, 0);

    // Today's schedule — use server timezone so "today" aligns with local date
    const todayLocal = moment.tz(now, SERVER_TZ);
    const startOfDay = todayLocal.clone().startOf('day').toDate();
    const endOfDay = todayLocal.clone().endOf('day').toDate();
    
    // Get assigned bookings for today
    const assignedToday = await Booking.find({
      counsellor: counsellor._id,
      scheduledAt: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['confirmed', 'pending', 'in-progress'] }
    })
      .populate('user', 'firstName lastName profileImage')
      .sort({ scheduledAt: 1 })
      .lean();
    
    // Get all unassigned bookings (pending or subscription auto-confirmed)
    const unassignedPending = isCounsellorAvailable
      ? await Booking.find({
          counsellor: null,
          status: { $in: ['pending', 'confirmed'] }
        })
          .populate('user', 'firstName lastName profileImage')
          .sort({ createdAt: -1 }) // Most recent first for instant sessions
          .lean()
      : [];
    
    // Combine and sort: assigned today's bookings first, then unassigned pending
    const todayBookings = [...assignedToday, ...unassignedPending].sort((a, b) => {
      // If both are assigned, sort by scheduledAt
      if (a.counsellor && b.counsellor) {
        return new Date(a.scheduledAt) - new Date(b.scheduledAt);
      }
      // Unassigned (pending) bookings come after assigned ones
      if (!a.counsellor && b.counsellor) return 1;
      if (a.counsellor && !b.counsellor) return -1;
      // Both unassigned, sort by creation date (newest first for instant sessions)
      const dateA = a.createdAt ? new Date(a.createdAt) : (a._id && typeof a._id.getTimestamp === 'function' ? a._id.getTimestamp() : new Date(0));
      const dateB = b.createdAt ? new Date(b.createdAt) : (b._id && typeof b._id.getTimestamp === 'function' ? b._id.getTimestamp() : new Date(0));
      return dateB.getTime() - dateA.getTime();
    });

    // Recent bookings (last 10) - ALL bookings available for counselors
    // Only show unassigned bookings to available counselors
    const recentBookings = await Booking.find({
      $or: [
        { counsellor: counsellor._id }, // Always show assigned bookings
        ...(isCounsellorAvailable ? [{ counsellor: null, status: { $in: ['pending', 'confirmed'] } }] : [])
      ],
      status: { $ne: 'cancelled' }
    })
      .populate('user', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      success: true,
      data: {
        counsellorStatus: {
          isActive: counsellor.isActive,
          isAvailable: counsellor.isAvailable,
          profileMediaComplete,
          profileImage: counsellor.profileImage || null,
          voiceIntroUrl: counsellor.voiceIntroUrl || null,
          message: !counsellor.isActive
            ? 'Your account is not active. Please contact support.'
            : !profileMediaComplete
            ? 'Complete your mandatory selfie and voice intro before your profile goes live.'
            : !counsellor.isAvailable
            ? 'You are currently unavailable. Toggle your status to start accepting bookings.'
            : 'You are available to accept new bookings.'
        },
        stats: {
          totalBookings,
          upcomingSessions,
          pendingAssignments,
          monthlyEarnings: {
            amount: monthlyEarnings,
            currency: counsellor.currency || 'INR'
          }
        },
        todaySchedule: todayBookings
          .filter(booking => booking.user)
          .map(booking => ({
            id: booking._id.toString(),
            userName: `${booking.user?.firstName || ''} ${booking.user?.lastName || ''}`.trim() || 'Unknown User',
            userImage: booking.user?.profileImage,
            sessionType: booking.sessionType,
            sessionDuration: booking.sessionDuration,
            scheduledAt: booking.scheduledAt,
            status: booking.status,
            videoCall: formatVideoCall(booking.videoCall),
            isSubscriptionBooking: booking.isSubscriptionBooking || false,
            paymentMethod: booking.paymentMethod
          })),
        recentBookings: recentBookings
          .filter(booking => booking.user)
          .map(booking => ({
            id: booking._id.toString(),
            userName: `${booking.user?.firstName || ''} ${booking.user?.lastName || ''}`.trim() || 'Unknown User',
            userImage: booking.user?.profileImage,
          sessionType: booking.sessionType,
          scheduledAt: booking.scheduledAt,
          status: booking.status,
          videoCall: formatVideoCall(booking.videoCall),
          amount: booking.amount,
          currency: booking.currency,
          isSubscriptionBooking: booking.isSubscriptionBooking || false,
          paymentMethod: booking.paymentMethod
        }))
      }
    });

  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/counsellors/me/profile
// @desc    Update counsellor professional profile
// @access  Private (Counsellor)
router.put('/me/profile', [
  body('specialization').optional().trim().isLength({ min: 2, max: 100 }),
  body('specializations').optional().isArray(),
  body('specializations.*').optional().isString().trim().isLength({ min: 2, max: 50 }),
  body('experience').optional().isInt({ min: 0, max: 80 }),
  body('hourlyRate').optional().isFloat({ min: 0 }),
  body('bio').optional().trim().isLength({ max: 1000 }),
  body('languages').optional().isArray(),
  body('languages.*').optional().isString().trim().isLength({ min: 2, max: 50 }),
  body('licenseNumber').optional().trim(),
  body('availability').optional().isObject(),
], counsellorAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({ success: false, message: 'Counsellor profile not found' });
    }

    if (req.body.licenseNumber !== undefined || req.body.hourlyRate !== undefined) {
      return res.status(403).json({
        success: false,
        message: 'License number and session rate are admin-controlled. Contact support to request changes.'
      });
    }

    const { specialization, specializations, experience, bio, languages, availability } = req.body;

    if (specializations !== undefined || specialization !== undefined) {
      const nextSpecializations = normalizeTagList(
        specializations !== undefined ? specializations : [specialization]
      );

      if (nextSpecializations.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one specialization is required'
        });
      }

      counsellor.specializations = nextSpecializations;
      counsellor.specialization = nextSpecializations[0];
    }

    if (experience !== undefined) counsellor.experience = experience;
    if (bio !== undefined) counsellor.bio = bio;
    if (languages !== undefined) {
      const nextLanguages = normalizeTagList(languages);

      if (nextLanguages.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one language is required'
        });
      }

      counsellor.languages = nextLanguages;
    }
    if (availability !== undefined) {
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      days.forEach((day) => {
        if (availability[day] !== undefined) {
          counsellor.availability[day] = { ...counsellor.availability[day], ...availability[day] };
        }
      });
    }

    await counsellor.save();
    await invalidateCounsellorDiscoveryCache();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { counsellor }
    });
  } catch (error) {
    console.error('Update counsellor profile error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   PUT /api/counsellors/me/status
// @desc    Toggle counsellor availability (isAvailable on/off)
// @access  Private (Counsellor)
router.put('/me/status', counsellorAuth, async (req, res) => {
  try {
    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({ success: false, message: 'Counsellor profile not found' });
    }

    const { isAvailable } = req.body;
    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isAvailable must be a boolean' });
    }

    if (isAvailable && !hasCompletedProfileMedia(counsellor)) {
      return res.status(400).json({
        success: false,
        message: 'Complete your mandatory selfie and voice intro before setting yourself available.'
      });
    }

    counsellor.isAvailable = isAvailable;
    await counsellor.save();

    res.json({
      success: true,
      message: isAvailable ? 'You are now available to accept bookings' : 'You are now marked as unavailable',
      data: {
        isAvailable: counsellor.isAvailable,
        isActive: counsellor.isActive,
        profileMediaComplete: hasCompletedProfileMedia(counsellor)
      }
    });
  } catch (error) {
    console.error('Update counsellor status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// @route   PUT /api/counsellors/me/bank-details
// @desc    Update counsellor bank account details for payouts
// @access  Private (Counsellor)
router.put('/me/bank-details', [
  body('currentPassword').notEmpty().withMessage('Current password is required')
    .isLength({ max: 128 }).withMessage('Current password is invalid'),
  body('accountNumber').trim().matches(/^\d{9,18}$/).withMessage('Account number must be 9–18 digits'),
  body('ifscCode').trim().notEmpty().withMessage('IFSC code is required')
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/i).withMessage('Invalid IFSC code (e.g. HDFC0001234)'),
  body('accountHolderName').trim().notEmpty().withMessage('Account holder name is required')
    .isLength({ min: 2, max: 100 }),
  body('bankName').trim().notEmpty().withMessage('Bank name is required')
    .isLength({ min: 2, max: 100 }),
], counsellorAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const counsellor = await getCounsellorFromUser(req.user._id);
    if (!counsellor) {
      return res.status(404).json({ success: false, message: 'Counsellor profile not found' });
    }

    const accountUser = await User.findById(req.user._id).select('+password');
    if (!accountUser || !await accountUser.comparePassword(req.body.currentPassword)) {
      return res.status(403).json({ success: false, message: 'Current password is incorrect.' });
    }

    const activePayout = await Payout.exists({
      counsellor: counsellor._id,
      status: { $in: payoutInFlightStatuses },
    });
    if (activePayout) {
      return res.status(409).json({
        success: false,
        message: 'Bank details cannot be changed while a payout request is awaiting approval or processing.',
      });
    }

    const { accountNumber, ifscCode, accountHolderName, bankName } = req.body;

    counsellor.bankDetails = {
      accountNumberEncrypted: encryptBankAccountNumber(accountNumber),
      accountNumberLast4: accountNumber.trim().slice(-4),
      ifscCode: ifscCode.trim().toUpperCase(),
      accountHolderName: accountHolderName.trim(),
      bankName: bankName.trim(),
    };
    // Reset Razorpay fund account so a new one is created on the next payout
    counsellor.razorpayFundAccountId = null;

    await counsellor.save();

    res.json({
      success: true,
      message: 'Bank details updated successfully.',
      data: {
        bankDetails: {
          accountHolderName: counsellor.bankDetails.accountHolderName,
          bankName: counsellor.bankDetails.bankName,
          ifscCode: counsellor.bankDetails.ifscCode,
          accountNumberMasked: '···' + accountNumber.slice(-4),
        },
      },
    });
  } catch (error) {
    console.error('Update bank details error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
