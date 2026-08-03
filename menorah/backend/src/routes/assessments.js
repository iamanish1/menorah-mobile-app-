const express = require('express');
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');
const {
  getGad7Instrument,
} = require('../services/gad7Assessment');
const {
  createGad7Submission,
  getOwnAssessment,
  listOwnAssessments,
  serializeAssessment,
} = require('../services/psychometricAssessmentService');
const { recordSecurityEvent } = require('../utils/securityAudit');

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});

const requireUserRole = (req, res, next) => {
  if (req.user?.role !== 'user') {
    return res.status(403).json({
      success: false,
      code: 'ASSESSMENT_USER_ACCESS_REQUIRED',
      message: 'This check-in is available to user accounts only.',
    });
  }
  return next();
};

const safeErrorResponse = (error) => {
  const responses = {
    ASSESSMENT_ANSWERS_INCOMPLETE: [400, 'Please answer all seven questions before submitting.'],
    ASSESSMENT_ANSWERS_INVALID: [400, 'The submitted answers are invalid.'],
    ASSESSMENT_VERSION_UNSUPPORTED: [400, 'Please refresh the check-in and try again.'],
    ASSESSMENT_IDEMPOTENCY_REQUIRED: [400, 'Please try submitting the check-in again.'],
    ASSESSMENT_IDEMPOTENCY_REUSED: [409, 'This check-in request has already been used. Please start a new check-in.'],
    ASSESSMENT_DATA_PROTECTION_UNAVAILABLE: [503, 'Check-in submission is temporarily unavailable.'],
  };
  const known = responses[error?.code];
  if (known) {
    return {
      status: known[0],
      body: { success: false, code: error.code, message: known[1] },
    };
  }
  return {
    status: 500,
    body: {
      success: false,
      code: 'ASSESSMENT_REQUEST_FAILED',
      message: 'The check-in could not be completed. Please try again.',
    },
  };
};

const auditAssessment = (event, req, {
  outcome = 'success',
  action,
  targetId,
  reason,
} = {}) => {
  recordSecurityEvent(event, {
    req,
    user: req.user,
    outcome,
    details: {
      resource: 'mental_health_check_in',
      ...(action ? { action } : {}),
      ...(targetId ? { targetId } : {}),
      ...(reason ? { reason } : {}),
    },
  });
};

router.get('/instruments/gad-7', auth, requireUserRole, (_req, res) => res.json({
  success: true,
  data: { instrument: getGad7Instrument() },
}));

router.post('/gad-7', auth, requireUserRole, async (req, res) => {
  try {
    const result = await createGad7Submission({
      userId: req.user._id,
      assessmentVersion: req.body?.assessmentVersion,
      answers: req.body?.answers,
      idempotencyKey: req.header('Idempotency-Key'),
    });
    auditAssessment('psychometric_assessment_completed', req, {
      action: result.created ? 'created' : 'replayed',
      targetId: result.assessment._id,
    });
    return res.status(result.created ? 201 : 200).json({
      success: true,
      data: {
        assessment: serializeAssessment(result.assessment),
        replayed: !result.created,
      },
    });
  } catch (error) {
    const response = safeErrorResponse(error);
    auditAssessment('psychometric_assessment_submission_failed', req, {
      outcome: 'failure',
      action: 'submit',
      reason: response.body.code,
    });
    return res.status(response.status).json(response.body);
  }
});

router.get('/', auth, requireUserRole, async (req, res) => {
  try {
    const assessments = await listOwnAssessments({
      userId: req.user._id,
      limit: req.query.limit,
    });
    return res.json({
      success: true,
      data: { assessments: assessments.map(serializeAssessment) },
    });
  } catch {
    return res.status(500).json({
      success: false,
      code: 'ASSESSMENT_REQUEST_FAILED',
      message: 'Assessment results could not be loaded.',
    });
  }
});

router.get('/:id', auth, requireUserRole, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      code: 'ASSESSMENT_ID_INVALID',
      message: 'Assessment result ID is invalid.',
    });
  }

  try {
    const assessment = await getOwnAssessment({
      userId: req.user._id,
      assessmentId: req.params.id,
    });
    if (!assessment) {
      auditAssessment('psychometric_assessment_access_denied', req, {
        outcome: 'failure',
        action: 'view',
        targetId: req.params.id,
      });
      return res.status(404).json({
        success: false,
        code: 'ASSESSMENT_NOT_FOUND',
        message: 'Assessment result not found.',
      });
    }

    auditAssessment('psychometric_assessment_viewed', req, {
      action: 'view',
      targetId: assessment._id,
    });
    return res.json({
      success: true,
      data: { assessment: serializeAssessment(assessment) },
    });
  } catch {
    return res.status(500).json({
      success: false,
      code: 'ASSESSMENT_REQUEST_FAILED',
      message: 'Assessment result could not be loaded.',
    });
  }
});

module.exports = router;
module.exports.requireUserRole = requireUserRole;
module.exports.safeErrorResponse = safeErrorResponse;
