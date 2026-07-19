const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const User = require('../models/User');
const KycVerification = require('../models/KycVerification');
const { auth } = require('../middleware/auth');

const router = express.Router();
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);

const getKycRetentionExpiry = () => {
  const raw = String(process.env.KYC_RETENTION_DAYS || '').trim();
  const days = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(days) || days < 365 || days > 36500) {
    throw new Error('KYC_RETENTION_DAYS must contain an approved retention period');
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

const getKycConsentVersion = () => {
  const version = String(process.env.KYC_CONSENT_VERSION || '').trim();
  if (!version || /^REPLACE/i.test(version) || version.length > 64) {
    throw new Error('KYC_CONSENT_VERSION must identify the approved consent text');
  }
  return version;
};
const DEFAULT_MAX_FILE_SIZE = 15 * 1024 * 1024;
const maxFileSize = parseInt(process.env.EKYC_MAX_FILE_SIZE, 10) || DEFAULT_MAX_FILE_SIZE;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: maxFileSize,
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, HEIC, or HEIF images are supported for identity verification'));
    }
    cb(null, true);
  },
});

const uploadSelfie = (req, res, next) => {
  upload.single('selfie')(req, res, (error) => {
    if (!error) return next();

    const isTooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    console.error('KYC upload error:', {
      code: error.code,
      message: error.message,
      maxFileSize,
    });

    return res.status(400).json({
      success: false,
      code: isTooLarge ? 'EKYC_PHOTO_TOO_LARGE' : 'EKYC_UNSUPPORTED_PHOTO',
      message: isTooLarge
        ? 'The selfie photo is too large. Please retake it or choose a smaller image and try again.'
        : error.message || 'The selfie photo could not be uploaded. Please retake it and try again.',
    });
  });
};

const getLuxandDetectUrl = () =>
  process.env.LUXAND_DETECT_URL || 'https://api.luxand.cloud/photo/detect';

const getConfidenceThreshold = () => {
  const configured = Number(process.env.LUXAND_FACE_CONFIDENCE_THRESHOLD || 90);
  if (!Number.isFinite(configured)) return 90;
  return Math.min(Math.max(configured, 0), 100);
};

const normalizeConfidence = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric <= 1 ? numeric * 100 : numeric;
};

const extractFaces = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.faces)) return payload.faces;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.data?.faces)) return payload.data.faces;
  if (payload?.face) return [payload.face];
  if (payload?.status === 'success' && payload.rectangle) return [payload];
  return [];
};

const getFaceConfidence = (face) => normalizeConfidence(
  face?.confidence
    ?? face?.probability
    ?? face?.faceProbability
    ?? face?.face_probability
    ?? face?.score
);

const sanitizeProviderMessage = (message) => {
  if (!message || typeof message !== 'string') return undefined;
  return message.replace(/\s+/g, ' ').trim().slice(0, 180);
};

const providerFailureMessage = (status, providerMessage) => {
  if (status === 401 || status === 403) {
    return 'Identity verification is not accepting requests right now. Please contact support or skip for now.';
  }
  if (status === 413) {
    return 'The selfie photo is too large for identity verification. Please retake it and try again.';
  }
  if (status === 429) {
    return 'Identity verification is busy right now. Please try again in a few minutes or skip for now.';
  }
  if (status >= 500) {
    return 'Identity verification is temporarily unavailable. Please try again later or skip for now.';
  }

  const cleanProviderMessage = sanitizeProviderMessage(providerMessage);
  return cleanProviderMessage
    ? `Identity verification could not process this photo: ${cleanProviderMessage}`
    : 'Identity verification could not process this photo. Please retake it in good light or skip for now.';
};

const normalizeSelfieForProvider = async (file) => {
  try {
    const buffer = await sharp(file.buffer, { failOn: 'none' })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    const baseName = (file.originalname || `selfie-${Date.now()}`)
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w.-]+/g, '-')
      .slice(0, 80) || `selfie-${Date.now()}`;

    return {
      ...file,
      buffer,
      size: buffer.length,
      mimetype: 'image/jpeg',
      originalname: `${baseName}.jpg`,
    };
  } catch (error) {
    error.statusCode = 400;
    error.code = 'EKYC_UNSUPPORTED_IMAGE_FORMAT';
    error.publicMessage = 'We could not process this selfie format. Please retake the photo and try again.';
    throw error;
  }
};

const serializeVerification = (verification) => ({
  id: verification._id.toString(),
  status: verification.status,
  provider: verification.provider,
  checkType: verification.checkType,
  submittedAt: verification.submittedAt,
  verifiedAt: verification.verifiedAt,
  reviewedAt: verification.reviewedAt,
  reviewReason: verification.reviewReason,
  failureReason: verification.failureReason,
  faceCount: verification.faceCheck?.faceCount ?? null,
  faceCheckConfidence: verification.faceCheck?.confidence ?? null,
  threshold: verification.faceCheck?.threshold ?? getConfidenceThreshold(),
});

const userKycPayload = (verification) => ({
  status: verification.status,
  provider: verification.provider,
  submittedAt: verification.submittedAt,
  verifiedAt: verification.verifiedAt,
  reviewedAt: verification.reviewedAt,
  reviewedBy: verification.reviewedBy,
  reviewReason: verification.reviewReason,
  faceCheckConfidence: verification.faceCheck?.confidence,
});

const notifyAdmins = (req, verification, user) => {
  const io = req.app.get('io');
  if (!io) return;

  io.to('admin').emit('ekyc_review_required', {
    verificationId: verification._id.toString(),
    userId: user._id.toString(),
    userName: `${user.firstName} ${user.lastName}`,
    status: verification.status,
    submittedAt: verification.submittedAt,
  });
};

const submitToLuxand = async (file) => {
  const token = process.env.LUXAND_API_TOKEN;
  if (!token) {
    const error = new Error('LUXAND_API_TOKEN is not configured');
    error.statusCode = 503;
    error.code = 'EKYC_PROVIDER_NOT_CONFIGURED';
    error.publicMessage = 'Identity verification is temporarily unavailable. Please skip for now or contact support.';
    throw error;
  }

  const form = new FormData();
  form.append('photo', new Blob([file.buffer], { type: file.mimetype }), file.originalname || `selfie-${Date.now()}.jpg`);

  let response;
  try {
    response = await fetch(getLuxandDetectUrl(), {
      method: 'POST',
      headers: { token },
      body: form,
    });
  } catch (error) {
    error.statusCode = 502;
    error.code = 'EKYC_PROVIDER_NETWORK_ERROR';
    error.publicMessage = 'Identity verification service could not be reached. Please try again later or skip for now.';
    throw error;
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const providerMessage = payload?.error || payload?.message || payload?.detail || 'Luxand face detection failed';
    const error = new Error(providerMessage);
    error.statusCode = response.status >= 500 ? 502 : response.status;
    error.code = `EKYC_PROVIDER_${response.status}`;
    error.publicMessage = providerFailureMessage(response.status, providerMessage);
    throw error;
  }

  return payload;
};

const getFailureReason = ({ faceCount, confidence, threshold }) => {
  if (faceCount < 1) return 'No face was detected in the submitted photo.';
  if (faceCount > 1) return 'Multiple faces were detected in the submitted photo.';
  if (confidence !== null && confidence < threshold) return 'The submitted face photo was below the confidence threshold.';
  return undefined;
};

router.get('/status', auth, async (req, res) => {
  try {
    const verification = await KycVerification.findOne({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        status: verification?.status || req.user.kyc?.status || 'not_started',
        verification: verification ? serializeVerification(verification) : null,
      },
    });
  } catch (error) {
    console.error('KYC status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/submit', auth, uploadSelfie, async (req, res) => {
  try {
    const consentAccepted = req.body.consentAccepted === 'true' || req.body.consentAccepted === true;
    if (!consentAccepted) {
      return res.status(400).json({
        success: false,
        message: 'Consent is required before starting identity verification.',
      });
    }

    const selfie = req.file;
    if (!selfie) {
      return res.status(400).json({
        success: false,
        message: 'A face photo is required.',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const normalizedSelfie = await normalizeSelfieForProvider(selfie);
    const threshold = getConfidenceThreshold();
    const luxandResult = await submitToLuxand(normalizedSelfie);
    const faces = extractFaces(luxandResult);
    const face = faces[0] || null;
    const confidence = getFaceConfidence(face);
    const failureReason = getFailureReason({ faceCount: faces.length, confidence, threshold });
    const status = failureReason ? 'manual_review' : 'verified';

    const verification = await KycVerification.create({
      user: user._id,
      status,
      consentAccepted: true,
      consentVersion: getKycConsentVersion(),
      consentAcceptedAt: new Date(),
      retentionExpiresAt: getKycRetentionExpiry(),
      verifiedAt: status === 'verified' ? new Date() : undefined,
      failureReason,
      faceCheck: {
        faceCount: faces.length,
        confidence,
        threshold,
      },
      providerRequestId: luxandResult?.request_id || luxandResult?.requestId,
      metadata: {
        selfieMimeType: normalizedSelfie.mimetype,
        originalSelfieMimeType: selfie.mimetype,
        originalSelfieSize: selfie.size,
        normalizedSelfieSize: normalizedSelfie.size,
      },
    });

    user.kyc = userKycPayload(verification);
    await user.save();

    if (status !== 'verified') {
      notifyAdmins(req, verification, user);
    }

    res.json({
      success: true,
      message: status === 'verified'
        ? 'Identity verification completed.'
        : 'Identity verification needs admin review.',
      data: {
        status,
        verification: serializeVerification(verification),
        kyc: user.kyc,
      },
    });
  } catch (error) {
    console.error('KYC submit error:', {
      code: error?.code,
      statusCode: error?.statusCode,
      fileReceived: Boolean(req.file),
    });

    res.status(error?.statusCode || 500).json({
      success: false,
      code: error?.code || 'EKYC_SUBMIT_FAILED',
      message: error?.publicMessage || 'Identity verification could not be completed right now. Please try again later or skip for now.',
    });
  }
});

module.exports = router;
