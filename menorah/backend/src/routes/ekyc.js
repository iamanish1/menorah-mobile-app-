const express = require('express');
const multer = require('multer');
const User = require('../models/User');
const KycVerification = require('../models/KycVerification');
const { auth } = require('../middleware/auth');

const router = express.Router();
const allowedMimeTypes = new Set(['image/jpeg', 'image/png']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: parseInt(process.env.EKYC_MAX_FILE_SIZE, 10) || 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error('Only JPEG or PNG images are supported for identity verification'));
    }
    cb(null, true);
  },
});

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
    throw error;
  }

  const form = new FormData();
  form.append('photo', new Blob([file.buffer], { type: file.mimetype }), file.originalname || `selfie-${Date.now()}.jpg`);

  const response = await fetch(getLuxandDetectUrl(), {
    method: 'POST',
    headers: { token },
    body: form,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || 'Luxand face detection failed');
    error.statusCode = response.status;
    error.providerResponse = payload;
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

router.post('/submit', auth, upload.single('selfie'), async (req, res) => {
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

    const threshold = getConfidenceThreshold();
    const luxandResult = await submitToLuxand(selfie);
    const faces = extractFaces(luxandResult);
    const face = faces[0] || null;
    const confidence = getFaceConfidence(face);
    const failureReason = getFailureReason({ faceCount: faces.length, confidence, threshold });
    const status = failureReason ? 'manual_review' : 'verified';

    const verification = await KycVerification.create({
      user: user._id,
      status,
      consentAccepted: true,
      verifiedAt: status === 'verified' ? new Date() : undefined,
      failureReason,
      faceCheck: {
        faceCount: faces.length,
        confidence,
        threshold,
      },
      providerRequestId: luxandResult?.request_id || luxandResult?.requestId,
      metadata: {
        selfieMimeType: selfie.mimetype,
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
      message: error?.message,
      statusCode: error?.statusCode,
      providerResponse: error?.providerResponse,
    });

    res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.statusCode === 503
        ? 'Identity verification is not configured. Set LUXAND_API_TOKEN.'
        : 'Identity verification failed. Please try again with a clear face photo.',
    });
  }
});

module.exports = router;
