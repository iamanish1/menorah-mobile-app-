const express = require('express');
const { param, query, body, validationResult } = require('express-validator');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const sharp = require('sharp');
const moment = require('moment-timezone');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Counsellor = require('../models/Counsellor');
const User = require('../models/User');
const Payout = require('../models/Payout');
const { counsellorAuth } = require('../middleware/auth');
const {
  invalidateCounsellorDiscoveryCache,
} = require('../services/counsellorDiscoveryCache');
const { storeMediaBuffer } = require('../services/mediaStorage');
const { encryptBankAccountNumber } = require('../utils/bankAccountEncryption');
const { isSessionWithinWorkingHours } = require('../utils/bookingAvailability');
const { payoutInFlightStatuses } = require('../services/payoutPolicy');
const {
  buildBookingAuthorizationQuery,
  buildCounsellorMarketplaceBookingQuery,
  buildEligibleCounsellorAssignedAccessQuery,
  buildEligibleCounsellorMarketplaceQuery,
  doesBookingMatchCounsellorPreferences,
  isBookingAuthorizationValid,
  isCounsellorAssignedAccessEligible,
  isCounsellorMarketplaceEligible,
  isUnassignedMarketplaceBookingEligible,
} = require('../services/bookingMarketplacePolicy');
const {
  serializeUnassignedBookingPreview,
} = require('../serializers/bookingSerializer');

const SERVER_TZ = process.env.SERVER_TZ || 'Asia/Kolkata';
const BOOKING_WRITE_TRANSACTION_OPTIONS = Object.freeze({
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
});

const bookingAcceptanceConflict = (code, message) => Object.assign(new Error(message), {
  code,
  isBookingAcceptanceConflict: true,
});

const bookingRescheduleConflict = (code, message) => Object.assign(new Error(message), {
  code,
  isBookingRescheduleConflict: true,
});

const isMongoTransactionConflict = (error) => Boolean(
  [112, 251].includes(error?.code)
  || (
    typeof error?.hasErrorLabel === 'function'
    && (
      error.hasErrorLabel('TransientTransactionError')
      || error.hasErrorLabel('UnknownTransactionCommitResult')
    )
  )
);

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
  return Counsellor.findOne({ user: userId });
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

const hasCompletedProfileMedia = (counsellor) => Boolean(counsellor?.profileImage && counsellor?.voiceIntroUrl);
const isCounsellorMarketplaceReady = (counsellor, account) =>
  hasCompletedProfileMedia(counsellor)
  && isCounsellorMarketplaceEligible(counsellor, {
    requireAvailability: true,
    account,
  });

const isWithinConfiguredRescheduleAvailability = ({
  counsellor,
  scheduledAt,
  sessionDuration,
}) => {
  if (!counsellor?.availability || typeof counsellor.availability !== 'object') {
    return true;
  }

  const timezone = counsellor.timezone || SERVER_TZ;
  const localStart = moment.tz(scheduledAt, timezone);
  if (!localStart.isValid()) return false;

  const daySchedule = counsellor.availability[
    localStart.format('dddd').toLowerCase()
  ];
  if (!daySchedule) return true;

  const validClock = (value) => (
    typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  );
  if (
    daySchedule.isAvailable !== true
    || !validClock(daySchedule.start)
    || !validClock(daySchedule.end)
  ) {
    return false;
  }

  return isSessionWithinWorkingHours({
    scheduledAt,
    sessionDuration,
    schedule: daySchedule,
    timezone,
  });
};

const marketplaceAccessDenied = (res) => res.status(403).json({
  success: false,
  code: 'COUNSELLOR_MARKETPLACE_ACCESS_DENIED',
  message: 'Your counsellor profile is not eligible to view or accept new booking requests.',
});
const assignedBookingAccessDenied = (res) => res.status(403).json({
  success: false,
  code: 'COUNSELLOR_ASSIGNED_ACCESS_DENIED',
  message: 'Current professional approval is required to access assigned bookings.',
});

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

const storeCounsellorMediaFile = async (file, {
  kind,
  folder,
  resourceType,
}) => {
  const stored = await storeMediaBuffer(file.buffer, {
    service: 'counsellor-profile',
    category: kind,
    extension: file.safeExtension,
    contentType: file.mimetype,
    cloudinaryFolder: folder,
    cloudinaryResourceType: resourceType,
  });

  return {
    url: stored.url,
    publicId: stored.metadata.publicId,
    localPath: stored.metadata.localPath,
    metadata: stored.metadata,
  };
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

    let nextProfileImage = null;
    let nextVoiceIntro = null;

    if (profileImage) {
      const safeProfileImage = await sanitizeProfileImage(profileImage);
      nextProfileImage = await storeCounsellorMediaFile(safeProfileImage, {
        kind: 'selfies',
        folder: 'menorah/counsellor-selfies',
        resourceType: 'image',
      });
      counsellor.profileImage = nextProfileImage.url;
      counsellor.profileImagePublicId = nextProfileImage.publicId;
      counsellor.profileImageLocalPath = nextProfileImage.localPath;
      counsellor.profileImageStorage = nextProfileImage.metadata;
    }

    if (voiceIntro) {
      const safeVoiceIntro = await validateVoiceIntro(voiceIntro);
      nextVoiceIntro = await storeCounsellorMediaFile(safeVoiceIntro, {
        kind: 'voice-intros',
        folder: 'menorah/counsellor-voice-intros',
        resourceType: 'video',
      });
      counsellor.voiceIntroUrl = nextVoiceIntro.url;
      counsellor.voiceIntroPublicId = nextVoiceIntro.publicId;
      counsellor.voiceIntroLocalPath = nextVoiceIntro.localPath;
      counsellor.voiceIntroStorage = nextVoiceIntro.metadata;
      counsellor.voiceIntroDurationSeconds = safeVoiceIntro.durationSeconds;
    }

    if (counsellor.profileImage && counsellor.voiceIntroUrl) {
      counsellor.profileMediaCompletedAt = counsellor.profileMediaCompletedAt || new Date();
    }

    await counsellor.save();
    if (nextProfileImage) {
      await User.findByIdAndUpdate(req.user._id, {
        profileImage: nextProfileImage.url,
        profileImageStorage: nextProfileImage.metadata,
      }).catch((error) => {
        console.warn('Failed to mirror counsellor profile image to user record:', error.message);
      });
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

    if (!isCounsellorMarketplaceReady(counsellor, req.user)) {
      return marketplaceAccessDenied(res);
    }

    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;

    // Get counsellor's gender from their User record for gender-based filtering
    const counsellorGender = req.user.gender; // e.g. 'male', 'female', 'other'

    const query = buildCounsellorMarketplaceBookingQuery({
      now: new Date(),
      counsellorGender,
    });

    // Calculate pagination
    const skip = (pageNum - 1) * limitNum;


    // Execute query
    const bookings = await Booking.find(query)
      .select(
        '_id sessionType sessionDuration scheduledAt status preferences createdAt '
        + 'paymentStatus paymentMethod paymentId isSubscriptionBooking amountMinor currency '
        + 'pricing bookingAuthorization'
      )
      .sort({ scheduledAt: 1 }) // Earliest first
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count
    const total = await Booking.countDocuments(query);
    
    const formattedBookings = bookings.map(serializeUnassignedBookingPreview);

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
    const accessNow = new Date();

    const bookingAccessRecord = await Booking.findById(id)
      .select(
        '_id counsellor sessionType sessionDuration scheduledAt status '
        + 'preferences createdAt paymentStatus paymentMethod isSubscriptionBooking '
        + 'paymentId amount amountMinor currency pricing bookingAuthorization'
      )
      .lean();
    if (!bookingAccessRecord) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const assignedCounsellorId = bookingAccessRecord.counsellor?.toString?.();
    const requesterCounsellorId = counsellor._id.toString();
    if (!assignedCounsellorId) {
      if (
        !isCounsellorMarketplaceReady(counsellor, req.user)
        || !isUnassignedMarketplaceBookingEligible(bookingAccessRecord, { now: accessNow })
        || !doesBookingMatchCounsellorPreferences(bookingAccessRecord, {
          counsellorGender: req.user.gender,
        })
      ) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      return res.json({
        success: true,
        data: {
          booking: serializeUnassignedBookingPreview(bookingAccessRecord, { now: accessNow }),
        },
      });
    }

    if (assignedCounsellorId !== requesterCounsellorId) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (
      !isCounsellorAssignedAccessEligible(counsellor, { account: req.user })
      || !isBookingAuthorizationValid(bookingAccessRecord, { now: accessNow })
    ) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const booking = await Booking.findOne({
      _id: id,
      counsellor: counsellor._id,
      ...buildBookingAuthorizationQuery({ now: accessNow }),
    })
      .populate({
        path: 'user',
        select: 'firstName lastName email phone profileImage gender'
      })
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const formattedBooking = {
      accessScope: 'assigned',
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
      createdAt: booking.createdAt
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

    if (!isCounsellorAssignedAccessEligible(counsellor, { account: req.user })) {
      return assignedBookingAccessDenied(res);
    }

    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;
    const authorizationQuery = buildBookingAuthorizationQuery({ now: new Date() });

    // Build query
    const query = {
      counsellor: counsellor._id,
      ...authorizationQuery,
    };
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
        accessScope: 'assigned',
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

    if (!isCounsellorMarketplaceReady(counsellor, req.user)) {
      return marketplaceAccessDenied(res);
    }

    const { id } = req.params;

    const booking = await Booking.findById(id)
      .select(
        '_id user counsellor status scheduledAt sessionDuration preferences paymentStatus '
        + 'paymentMethod paymentId isSubscriptionBooking amount amountMinor currency pricing '
        + 'bookingAuthorization assignedAt'
      );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.counsellor) {
      // A retry is idempotent only while this remains the same authorized,
      // confirmed booking. Never revive or re-confirm a terminal/refunded record.
      if (booking.counsellor.toString() === counsellor._id.toString()) {
        if (
          booking.status !== 'confirmed'
          || !isBookingAuthorizationValid(booking, { now: new Date() })
        ) {
          return res.status(409).json({
            success: false,
            code: 'BOOKING_NOT_ACCEPTABLE',
            message: 'This booking is no longer eligible for acceptance.'
          });
        }

        return res.json({
          success: true,
          message: 'Booking already accepted',
          data: {
            booking: {
              id: booking._id,
              status: booking.status,
              assignedAt: booking.assignedAt
            }
          }
        });
      }
      return res.status(409).json({
        success: false,
        message: 'Booking is already assigned to another counsellor'
      });
    }

    const acceptanceNow = new Date();
    if (
      !isUnassignedMarketplaceBookingEligible(booking, { now: acceptanceNow })
      || !doesBookingMatchCounsellorPreferences(booking, {
        counsellorGender: req.user.gender,
      })
    ) {
      return res.status(409).json({
        success: false,
        code: 'BOOKING_NOT_ACCEPTABLE',
        message: 'This booking is not in a paid or explicitly authorized accept-ready state.'
      });
    }

    const scheduledTime = new Date(booking.scheduledAt);
    const scheduledEnd = new Date(
      scheduledTime.getTime() + booking.sessionDuration * 60 * 1000
    );
    const scheduleTimezone = counsellor.timezone || SERVER_TZ;
    const scheduledLocal = moment.tz(scheduledTime, scheduleTimezone);
    const dayOfWeek = scheduledLocal.format('dddd').toLowerCase();

    if (!counsellor.availability || typeof counsellor.availability !== 'object') {
      return res.status(409).json({
        success: false,
        code: 'COUNSELLOR_SCHEDULE_UNAVAILABLE',
        message: 'Counsellor availability is not configured.'
      });
    }

    const daySchedule = counsellor.availability[dayOfWeek];
    const validClock = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!daySchedule?.isAvailable || !validClock(daySchedule.start) || !validClock(daySchedule.end)) {
      return res.status(409).json({
        success: false,
        code: 'COUNSELLOR_SCHEDULE_UNAVAILABLE',
        message: 'Counsellor is not available for the requested time.'
      });
    }

    const [startHour, startMinute] = daySchedule.start.split(':').map(Number);
    const [endHour, endMinute] = daySchedule.end.split(':').map(Number);
    const workingStartMinutes = startHour * 60 + startMinute;
    const workingEndMinutes = endHour * 60 + endMinute;
    const bookingStartMinutes = scheduledLocal.hour() * 60 + scheduledLocal.minute();
    const bookingEndMinutes = bookingStartMinutes + booking.sessionDuration;

    if (
      bookingStartMinutes < workingStartMinutes
      || bookingEndMinutes > workingEndMinutes
    ) {
      return res.status(409).json({
        success: false,
        code: 'COUNSELLOR_SCHEDULE_UNAVAILABLE',
        message: 'The requested session falls outside counsellor working hours.'
      });
    }

    const conflictingBooking = await Booking.findOne({
      counsellor: counsellor._id,
      scheduledAt: { $lt: scheduledEnd },
      status: { $in: ['pending', 'confirmed', 'in-progress'] },
      _id: { $ne: booking._id },
      $expr: {
        $gt: [
          {
            $add: [
              '$scheduledAt',
              { $multiply: ['$sessionDuration', 60 * 1000] },
            ],
          },
          scheduledTime,
        ],
      },
    });

    if (conflictingBooking) {
      return res.status(409).json({
        success: false,
        code: 'COUNSELLOR_SCHEDULE_CONFLICT',
        message: 'Counsellor has a conflicting booking at this time.'
      });
    }

    let assignedAt;
    let acceptedBooking = null;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const transactionNow = new Date();
        assignedAt = transactionNow;
        // These writes are intentional authorization fences. Suspension,
        // expiry, role changes, and account deactivation write the same
        // documents, forcing one concurrent transaction to retry/abort.
        const fencedCounsellor = await Counsellor.findOneAndUpdate({
          _id: counsellor._id,
          ...buildEligibleCounsellorMarketplaceQuery({ now: transactionNow }),
        }, {
          $inc: { 'professionalVerification.marketplaceAssignmentFence': 1 },
        }, { new: true, runValidators: true, session });
        if (!fencedCounsellor) {
          throw bookingAcceptanceConflict(
            'COUNSELLOR_NOT_ELIGIBLE',
            'Professional verification changed before acceptance completed.'
          );
        }

        const fencedAccount = await User.findOneAndUpdate({
          _id: req.user._id,
          role: 'counsellor',
          isActive: true,
        }, {
          $inc: { marketplaceAssignmentFence: 1 },
        }, { new: true, runValidators: true, session });
        if (!fencedAccount) {
          throw bookingAcceptanceConflict(
            'COUNSELLOR_NOT_ELIGIBLE',
            'The counsellor account changed before acceptance completed.'
          );
        }

        const transactionLocal = moment.tz(booking.scheduledAt, fencedCounsellor.timezone || SERVER_TZ);
        const transactionSchedule = fencedCounsellor.availability?.[
          transactionLocal.format('dddd').toLowerCase()
        ];
        const transactionClockValid = (value) => (
          typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
        );
        const transactionStartMinutes = transactionLocal.hour() * 60 + transactionLocal.minute();
        const transactionEndMinutes = transactionStartMinutes + booking.sessionDuration;
        const [availableStartHour, availableStartMinute] = transactionSchedule?.start
          ?.split(':').map(Number) || [];
        const [availableEndHour, availableEndMinute] = transactionSchedule?.end
          ?.split(':').map(Number) || [];
        if (
          !transactionSchedule?.isAvailable
          || !transactionClockValid(transactionSchedule.start)
          || !transactionClockValid(transactionSchedule.end)
          || transactionStartMinutes < availableStartHour * 60 + availableStartMinute
          || transactionEndMinutes > availableEndHour * 60 + availableEndMinute
        ) {
          throw bookingAcceptanceConflict(
            'COUNSELLOR_SCHEDULE_UNAVAILABLE',
            'Counsellor availability changed before acceptance completed.'
          );
        }

        const transactionConflict = await Booking.findOne({
          counsellor: counsellor._id,
          scheduledAt: { $lt: scheduledEnd },
          status: { $in: ['pending', 'confirmed', 'in-progress'] },
          _id: { $ne: booking._id },
          $expr: {
            $gt: [{
              $add: [
                '$scheduledAt',
                { $multiply: ['$sessionDuration', 60 * 1000] },
              ],
            }, scheduledTime],
          },
        }).session(session);
        if (transactionConflict) {
          throw bookingAcceptanceConflict(
            'COUNSELLOR_SCHEDULE_CONFLICT',
            'Counsellor has a conflicting booking at this time.'
          );
        }

        acceptedBooking = await Booking.findOneAndUpdate({
          _id: booking._id,
          ...buildCounsellorMarketplaceBookingQuery({
            now: transactionNow,
            counsellorGender: fencedAccount.gender,
          }),
        }, {
          $set: {
            counsellor: counsellor._id,
            assignedAt,
            status: 'confirmed',
          },
        }, { new: true, runValidators: true, session });
        if (!acceptedBooking) {
          throw bookingAcceptanceConflict(
            'BOOKING_NOT_ACCEPTABLE',
            'Booking eligibility changed before acceptance completed.'
          );
        }
      }, BOOKING_WRITE_TRANSACTION_OPTIONS);
    } finally {
      await session.endSession();
    }

    // Emit Socket.IO event (will be handled in server.js)
    if (req.app.get('io') && acceptedBooking.user) {
      const io = req.app.get('io');
      const acceptedUserId = acceptedBooking.user._id?.toString?.()
        || acceptedBooking.user.toString();
      io.to(`counsellor_${counsellor._id}`).emit('booking_assigned', {
        bookingId: acceptedBooking._id,
        userId: acceptedUserId,
        scheduledAt: acceptedBooking.scheduledAt
      });
      
      // Notify user
      io.to(`user_${acceptedUserId}`).emit('booking_confirmed', {
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
    if (error?.isBookingAcceptanceConflict) {
      return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        code: 'COUNSELLOR_SCHEDULE_CONFLICT',
        message: 'The counsellor schedule changed before this booking could be accepted.'
      });
    }
    console.error('Accept booking error:', error);
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

    if (!isCounsellorAssignedAccessEligible(counsellor, { account: req.user })) {
      return assignedBookingAccessDenied(res);
    }

    const { id } = req.params;
    const { scheduledAt } = req.body;
    const authorizationNow = new Date();

    const preflightBooking = await Booking.findOne({
      _id: id,
      counsellor: counsellor._id,
      status: { $in: ['pending', 'confirmed'] },
      ...buildBookingAuthorizationQuery({ now: authorizationNow }),
    })
      .select('_id user counsellor status sessionDuration scheduledAt')
      .lean();

    if (!preflightBooking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const scheduledTime = new Date(scheduledAt);
    
    // Check if scheduled time is in the future
    if (scheduledTime <= authorizationNow) {
      return res.status(400).json({
        success: false,
        message: 'Scheduled time must be in the future'
      });
    }

    if (!isWithinConfiguredRescheduleAvailability({
      counsellor,
      scheduledAt: scheduledTime,
      sessionDuration: preflightBooking.sessionDuration,
    })) {
      return res.status(400).json({
        success: false,
        code: 'COUNSELLOR_SCHEDULE_UNAVAILABLE',
        message: 'The requested session falls outside your configured working hours.'
      });
    }

    const expectedOldScheduledAt = new Date(preflightBooking.scheduledAt);
    let oldScheduledAt;
    let updatedBooking;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const transactionNow = new Date();
        const transactionBooking = await Booking.findOne({
          _id: preflightBooking._id,
          counsellor: counsellor._id,
          scheduledAt: expectedOldScheduledAt,
          status: { $in: ['pending', 'confirmed'] },
          ...buildBookingAuthorizationQuery({ now: transactionNow }),
        })
          .select('_id user counsellor status sessionDuration scheduledAt')
          .session(session)
          .lean();
        if (!transactionBooking) {
          throw bookingRescheduleConflict(
            'BOOKING_STATE_CHANGED',
            'The booking changed before it could be rescheduled.'
          );
        }

        // Rescheduling joins the same authorization fence used by direct and
        // marketplace assignment. It also serializes against professional
        // suspension/expiry, which update these exact account/profile records.
        const fencedCounsellor = await Counsellor.findOneAndUpdate({
          _id: counsellor._id,
          ...buildEligibleCounsellorAssignedAccessQuery({ now: transactionNow }),
          user: req.user._id,
        }, {
          $inc: { 'professionalVerification.marketplaceAssignmentFence': 1 },
        }, {
          new: true,
          runValidators: true,
          session,
        });
        if (!fencedCounsellor) {
          throw bookingRescheduleConflict(
            'COUNSELLOR_NOT_ELIGIBLE',
            'Professional verification changed before the booking could be rescheduled.'
          );
        }

        const fencedAccount = await User.findOneAndUpdate({
          _id: req.user._id,
          role: 'counsellor',
          isActive: true,
        }, {
          $inc: { marketplaceAssignmentFence: 1 },
        }, {
          new: true,
          runValidators: true,
          session,
        });
        if (!fencedAccount) {
          throw bookingRescheduleConflict(
            'COUNSELLOR_NOT_ELIGIBLE',
            'The counsellor account changed before the booking could be rescheduled.'
          );
        }

        if (scheduledTime <= transactionNow) {
          throw bookingRescheduleConflict(
            'BOOKING_STATE_CHANGED',
            'The requested session time is no longer in the future.'
          );
        }

        if (!isWithinConfiguredRescheduleAvailability({
          counsellor: fencedCounsellor,
          scheduledAt: scheduledTime,
          sessionDuration: transactionBooking.sessionDuration,
        })) {
          throw bookingRescheduleConflict(
            'COUNSELLOR_SCHEDULE_UNAVAILABLE',
            'Counsellor availability changed before the booking could be rescheduled.'
          );
        }

        const scheduledEnd = new Date(
          scheduledTime.getTime() + transactionBooking.sessionDuration * 60 * 1000
        );
        const conflictingBooking = await Booking.findOne({
          counsellor: fencedCounsellor._id,
          scheduledAt: { $lt: scheduledEnd },
          status: { $in: ['pending', 'confirmed', 'in-progress'] },
          _id: { $ne: transactionBooking._id },
          $expr: {
            $gt: [
              {
                $add: [
                  '$scheduledAt',
                  { $multiply: ['$sessionDuration', 60 * 1000] },
                ],
              },
              scheduledTime,
            ],
          },
        }).session(session);
        if (conflictingBooking) {
          throw bookingRescheduleConflict(
            'COUNSELLOR_SCHEDULE_CONFLICT',
            'Counsellor has a conflicting booking at this time.'
          );
        }

        oldScheduledAt = transactionBooking.scheduledAt;
        updatedBooking = await Booking.findOneAndUpdate(
          {
            _id: transactionBooking._id,
            counsellor: fencedCounsellor._id,
            scheduledAt: expectedOldScheduledAt,
            status: { $in: ['pending', 'confirmed'] },
            ...buildBookingAuthorizationQuery({ now: transactionNow }),
          },
          { $set: { scheduledAt: scheduledTime } },
          {
            new: true,
            runValidators: true,
            projection: '_id user scheduledAt',
            session,
          }
        );
        if (!updatedBooking) {
          throw bookingRescheduleConflict(
            'BOOKING_STATE_CHANGED',
            'The booking changed before it could be rescheduled.'
          );
        }
      }, BOOKING_WRITE_TRANSACTION_OPTIONS);
    } finally {
      await session.endSession();
    }

    // Emit Socket.IO event
    if (req.app.get('io') && updatedBooking.user) {
      const io = req.app.get('io');
      const userId = updatedBooking.user._id?.toString?.()
        || updatedBooking.user.toString();

      // Notify the counsellor's own room
      io.to(`counsellor_${counsellor._id}`).emit('booking_scheduled', {
        bookingId: updatedBooking._id,
        scheduledAt: updatedBooking.scheduledAt,
        oldScheduledAt,
      });

      // Notify the user with full details so their UI can update
      const counsellorUser = await require('../models/User')
        .findById(counsellor.user._id || counsellor.user)
        .select('firstName lastName');
      const counsellorName = counsellorUser ? `${counsellorUser.firstName} ${counsellorUser.lastName}` : 'Your counsellor';
      io.to(`user_${userId}`).emit('booking_rescheduled', {
        bookingId: updatedBooking._id,
        scheduledAt: updatedBooking.scheduledAt,
        oldScheduledAt,
        counsellorName,
      });
    }

    res.json({
      success: true,
      message: 'Session scheduled successfully',
      data: {
        booking: {
          id: updatedBooking._id,
          scheduledAt: updatedBooking.scheduledAt
        }
      }
    });

  } catch (error) {
    if (error?.isBookingRescheduleConflict) {
      return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    if (error?.code === 11000 || isMongoTransactionConflict(error)) {
      return res.status(409).json({
        success: false,
        code: 'COUNSELLOR_SCHEDULE_CONFLICT',
        message: 'The counsellor schedule changed before this booking could be rescheduled.'
      });
    }
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
    const isCounsellorAvailable = isCounsellorMarketplaceReady(counsellor, req.user);
    const canAccessAssignedBookings = isCounsellorAssignedAccessEligible(counsellor, {
      account: req.user,
    });

    const now = new Date();
    const nowLocal = moment.tz(now, SERVER_TZ);
    const startOfMonth = nowLocal.clone().startOf('month').toDate();
    const endOfMonth = nowLocal.clone().endOf('month').toDate();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const authorizationQuery = buildBookingAuthorizationQuery({ now });

    // Dashboard schedule/recent lists contain assigned bookings only. New,
    // anonymized opportunities are available through the dedicated preview route.
    const totalBookings = canAccessAssignedBookings ? await Booking.countDocuments({
      counsellor: counsellor._id,
      ...authorizationQuery,
      status: { $ne: 'cancelled' }
    }) : 0;

    const upcomingSessions = canAccessAssignedBookings ? await Booking.countDocuments({
      counsellor: counsellor._id,
      ...authorizationQuery,
      scheduledAt: { $gte: now, $lte: next7Days },
      status: { $in: ['confirmed', 'pending'] }
    }) : 0;

    const pendingAssignments = isCounsellorAvailable
      ? await Booking.countDocuments(buildCounsellorMarketplaceBookingQuery({
          now,
          counsellorGender: req.user.gender,
        }))
      : 0;

    // Monthly earnings - only paid bookings, after counsellor's commission share
    const commissionRate = counsellor.commissionRate ?? 20;
    const counsellorShare = (100 - commissionRate) / 100;
    const monthlyBookings = canAccessAssignedBookings ? await Booking.find({
      counsellor: counsellor._id,
      ...authorizationQuery,
      scheduledAt: { $gte: startOfMonth, $lte: endOfMonth },
      paymentStatus: 'paid'
    }).select('amount').lean() : [];

    const monthlyEarnings = monthlyBookings.reduce((total, booking) => {
      return total + (booking.amount || 0) * counsellorShare;
    }, 0);

    // Today's schedule — use server timezone so "today" aligns with local date
    const todayLocal = moment.tz(now, SERVER_TZ);
    const startOfDay = todayLocal.clone().startOf('day').toDate();
    const endOfDay = todayLocal.clone().endOf('day').toDate();
    
    // Get assigned bookings for today
    const assignedToday = canAccessAssignedBookings ? await Booking.find({
      counsellor: counsellor._id,
      ...authorizationQuery,
      scheduledAt: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['confirmed', 'pending', 'in-progress'] }
    })
      .populate('user', 'firstName lastName profileImage')
      .sort({ scheduledAt: 1 })
      .lean() : [];
    
    const todayBookings = assignedToday;

    // Recent bookings contain assigned records only; this prevents identity
    // data from being mixed into the unassigned marketplace response.
    const recentBookings = canAccessAssignedBookings ? await Booking.find({
      counsellor: counsellor._id,
      ...authorizationQuery,
      status: { $ne: 'cancelled' }
    })
      .populate('user', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean() : [];

    res.json({
      success: true,
      data: {
        counsellorStatus: {
          isActive: counsellor.isActive,
          isAvailable: counsellor.isAvailable,
          isVerified: canAccessAssignedBookings,
          marketplaceEligible: isCounsellorAvailable,
          profileMediaComplete,
          profileImage: counsellor.profileImage || null,
          voiceIntroUrl: counsellor.voiceIntroUrl || null,
          message: !counsellor.isActive
            ? 'Your account is not active. Please contact support.'
            : !canAccessAssignedBookings
            ? 'Your professional verification is not approved for new booking requests.'
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
            accessScope: 'assigned',
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
            accessScope: 'assigned',
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
