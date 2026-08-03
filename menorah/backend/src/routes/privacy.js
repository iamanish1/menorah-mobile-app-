const express = require('express');
const mongoose = require('mongoose');
const { readPrivacyConfiguration } = require('../config/privacy');
const { auth } = require('../middleware/auth');
const {
  privacyConsentService,
} = require('../services/privacyConsentService');
const {
  privacyRightsWorkflow,
  serializeDeletionRequest,
  serializeRightsRequest,
} = require('../services/privacyRightsWorkflow');
const { recordSecurityEvent } = require('../utils/securityAudit');

const router = express.Router();
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});

const getSource = (req) => String(
  req.app.get('serviceName') || 'authenticated-api'
).trim().toLowerCase();

const sendKnownError = (res, error) => {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  return res.status(status).json({
    success: false,
    code: status < 500 ? error.code : 'PRIVACY_REQUEST_FAILED',
    message: status < 500 ? error.message : 'Internal server error.',
  });
};

const recordEvent = (event, req, targetId, outcome = 'success') => {
  recordSecurityEvent(event, {
    req,
    user: req.user,
    outcome,
    details: {
      action: event,
      resource: 'privacy_rights',
      ...(targetId ? { targetId } : {}),
    },
  });
};

router.get('/consent', auth, async (req, res) => {
  try {
    const event = await privacyConsentService.getCurrent({
      userId: req.user._id,
    });
    return res.json({
      success: true,
      data: {
        requiredNoticeVersion: readPrivacyConfiguration().noticeVersion,
        current: event ? {
          action: event.consentAction,
          noticeVersion: event.noticeVersion,
          occurredAt: event.occurredAt,
          source: event.source,
        } : null,
      },
    });
  } catch (error) {
    return sendKnownError(res, error);
  }
});

router.post('/consent', auth, async (req, res) => {
  try {
    const result = await privacyConsentService.record({
      user: req.user,
      action: req.body?.action,
      noticeVersion: req.body?.noticeVersion,
      source: getSource(req),
      idempotencyKey: req.header('Idempotency-Key'),
    });
    recordEvent('privacy_consent_changed', req, result.event._id);
    return res.status(result.created ? 201 : 200).json({
      success: true,
      data: {
        action: result.event.consentAction,
        noticeVersion: result.event.noticeVersion,
        occurredAt: result.event.occurredAt,
        source: result.event.source,
      },
      message: result.event.consentAction === 'withdrawn'
        ? 'Withdrawal has been recorded. This does not promise immediate erasure; approved retention and legal-hold review still apply.'
        : 'Privacy notice acceptance has been recorded.',
    });
  } catch (error) {
    recordEvent('privacy_consent_changed', req, null, 'failure');
    return sendKnownError(res, error);
  }
});

const submitRightsRequest = (requestType) => async (req, res) => {
  try {
    const result = await privacyRightsWorkflow.submitRequest({
      user: req.user,
      requestType,
      body: req.body,
      source: getSource(req),
      idempotencyKey: req.header('Idempotency-Key'),
    });
    recordEvent('privacy_request_submitted', req, result.request._id);
    return res.status(result.created ? 202 : 200).json({
      success: true,
      data: { request: serializeRightsRequest(result.request) },
      message: requestType === 'export'
        ? 'The export request is recorded for identity review and secure delivery. Automated download is not available.'
        : 'The request is recorded for review.',
    });
  } catch (error) {
    recordEvent('privacy_request_submitted', req, null, 'failure');
    return sendKnownError(res, error);
  }
};

router.post('/requests/export', auth, submitRightsRequest('export'));
router.post('/requests/correction', auth, submitRightsRequest('correction'));
router.post('/requests/grievance', auth, submitRightsRequest('grievance'));

router.get('/requests', auth, async (req, res) => {
  try {
    const requests = await privacyRightsWorkflow.listOwnRequests({
      userId: req.user._id,
      limit: req.query.limit,
    });
    return res.json({
      success: true,
      data: { requests: requests.map(serializeRightsRequest) },
    });
  } catch (error) {
    return sendKnownError(res, error);
  }
});

router.get('/requests/:id', auth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      code: 'PRIVACY_REQUEST_ID_INVALID',
      message: 'Privacy request ID is invalid.',
    });
  }
  try {
    const request = await privacyRightsWorkflow.getOwnRequest({
      userId: req.user._id,
      requestId: req.params.id,
    });
    if (!request) {
      recordEvent('privacy_request_access_denied', req, req.params.id, 'failure');
      return res.status(404).json({
        success: false,
        code: 'PRIVACY_REQUEST_NOT_FOUND',
        message: 'Privacy request not found.',
      });
    }
    return res.json({
      success: true,
      data: { request: serializeRightsRequest(request) },
    });
  } catch (error) {
    return sendKnownError(res, error);
  }
});

router.get('/deletion-requests/current', auth, async (req, res) => {
  try {
    const request = await privacyRightsWorkflow.getOwnDeletionRequest({
      userId: req.user._id,
    });
    return res.json({
      success: true,
      data: { request: request ? serializeDeletionRequest(request) : null },
      message: request
        ? 'This is a retention-review workflow status, not a promise that every record is immediately erased.'
        : undefined,
    });
  } catch (error) {
    return sendKnownError(res, error);
  }
});

router.get('/deletion-requests/:id', auth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      code: 'DELETION_REQUEST_ID_INVALID',
      message: 'Deletion request ID is invalid.',
    });
  }
  try {
    const request = await privacyRightsWorkflow.getOwnDeletionRequest({
      userId: req.user._id,
      requestId: req.params.id,
    });
    if (!request) {
      recordEvent('deletion_request_access_denied', req, req.params.id, 'failure');
      return res.status(404).json({
        success: false,
        code: 'DELETION_REQUEST_NOT_FOUND',
        message: 'Deletion request not found.',
      });
    }
    return res.json({
      success: true,
      data: { request: serializeDeletionRequest(request) },
      message: 'This is a retention-review workflow status, not a promise that every record is immediately erased.',
    });
  } catch (error) {
    return sendKnownError(res, error);
  }
});

module.exports = router;
