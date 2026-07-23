const express = require('express');
const mongoose = require('mongoose');
const {
  adminAuth,
  requireRecentAdminMfa,
} = require('../middleware/auth');
const {
  requirePrivacyLegalHold,
  requirePrivacyReader,
  requirePrivacyReviewer,
} = require('../middleware/privacyAuthorization');
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
const RIGHTS_TYPES = new Set(['export', 'correction', 'grievance']);
const RIGHTS_STATUSES = new Set([
  'submitted',
  'under_review',
  'action_required',
  'completed',
  'rejected',
  'cancelled',
]);
const DELETION_STATUSES = new Set(['pending', 'under_review', 'completed', 'rejected']);

const getSource = (req) => String(
  req.app.get('serviceName') || 'api-admin'
).trim().toLowerCase();

const sendError = (res, error) => {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  return res.status(status).json({
    success: false,
    code: status < 500 ? error.code : 'PRIVACY_ADMIN_REQUEST_FAILED',
    message: status < 500 ? error.message : 'Internal server error.',
  });
};

const auditAdminAction = (req, event, requestId, outcome = 'success') => {
  recordSecurityEvent(event, {
    req,
    user: req.user,
    outcome,
    details: {
      action: event,
      resource: 'privacy_admin_workflow',
      targetId: requestId,
    },
  });
};

const requireObjectId = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      code: 'PRIVACY_REQUEST_ID_INVALID',
      message: 'Privacy request ID is invalid.',
    });
  }
  return next();
};

router.get('/requests', adminAuth, requirePrivacyReader, async (req, res) => {
  if (req.query.type && !RIGHTS_TYPES.has(req.query.type)) {
    return res.status(400).json({ success: false, code: 'PRIVACY_REQUEST_TYPE_INVALID' });
  }
  if (req.query.status && !RIGHTS_STATUSES.has(req.query.status)) {
    return res.status(400).json({ success: false, code: 'PRIVACY_REQUEST_STATUS_INVALID' });
  }
  try {
    const requests = await privacyRightsWorkflow.listAdminRequests({
      requestType: req.query.type,
      status: req.query.status,
      limit: req.query.limit,
    });
    return res.json({
      success: true,
      data: { requests: requests.map(serializeRightsRequest) },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get(
  '/requests/:id/payload',
  adminAuth,
  requirePrivacyReviewer,
  requireRecentAdminMfa,
  requireObjectId,
  async (req, res) => {
    try {
      const result = await privacyRightsWorkflow.getRequestPayloadForAdmin({
        requestId: req.params.id,
      });
      if (!result) {
        return res.status(404).json({
          success: false,
          code: 'PRIVACY_REQUEST_NOT_FOUND',
          message: 'Privacy request not found.',
        });
      }
      auditAdminAction(req, 'privacy_request_payload_accessed', req.params.id);
      return res.json({
        success: true,
        data: {
          request: serializeRightsRequest(result.request),
          payload: result.payload,
        },
      });
    } catch (error) {
      auditAdminAction(req, 'privacy_request_payload_accessed', req.params.id, 'failure');
      return sendError(res, error);
    }
  }
);

router.post(
  '/requests/:id/status',
  adminAuth,
  requirePrivacyReviewer,
  requireRecentAdminMfa,
  requireObjectId,
  async (req, res) => {
    try {
      const request = await privacyRightsWorkflow.transitionRightsRequest({
        requestId: req.params.id,
        admin: req.user,
        toStatus: req.body?.status,
        evidenceReference: req.body?.evidenceReference,
        source: getSource(req),
      });
      auditAdminAction(req, 'privacy_request_status_changed', req.params.id);
      return res.json({
        success: true,
        data: { request: serializeRightsRequest(request) },
      });
    } catch (error) {
      auditAdminAction(req, 'privacy_request_status_changed', req.params.id, 'failure');
      return sendError(res, error);
    }
  }
);

router.post(
  '/requests/:id/legal-hold',
  adminAuth,
  requirePrivacyLegalHold,
  requireRecentAdminMfa,
  requireObjectId,
  async (req, res) => {
    try {
      const request = await privacyRightsWorkflow.setLegalHold({
        kind: 'rights',
        requestId: req.params.id,
        admin: req.user,
        action: req.body?.action,
        policyReference: req.body?.policyReference,
        source: getSource(req),
      });
      auditAdminAction(req, 'privacy_legal_hold_changed', req.params.id);
      return res.json({
        success: true,
        data: { request: serializeRightsRequest(request) },
      });
    } catch (error) {
      auditAdminAction(req, 'privacy_legal_hold_changed', req.params.id, 'failure');
      return sendError(res, error);
    }
  }
);

router.get(
  '/deletion-requests',
  adminAuth,
  requirePrivacyReader,
  async (req, res) => {
    if (req.query.status && !DELETION_STATUSES.has(req.query.status)) {
      return res.status(400).json({
        success: false,
        code: 'DELETION_REQUEST_STATUS_INVALID',
      });
    }
    try {
      const requests = await privacyRightsWorkflow.listAdminDeletionRequests({
        status: req.query.status,
        limit: req.query.limit,
      });
      return res.json({
        success: true,
        data: { requests: requests.map(serializeDeletionRequest) },
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
);

router.post(
  '/deletion-requests/:id/status',
  adminAuth,
  requirePrivacyReviewer,
  requireRecentAdminMfa,
  requireObjectId,
  async (req, res) => {
    try {
      const request = await privacyRightsWorkflow.transitionDeletionRequest({
        requestId: req.params.id,
        admin: req.user,
        toStatus: req.body?.status,
        evidenceReference: req.body?.evidenceReference,
        source: getSource(req),
      });
      auditAdminAction(req, 'deletion_request_status_changed', req.params.id);
      return res.json({
        success: true,
        data: { request: serializeDeletionRequest(request) },
        message: 'Workflow review status changed. This does not assert that every associated record was erased.',
      });
    } catch (error) {
      auditAdminAction(req, 'deletion_request_status_changed', req.params.id, 'failure');
      return sendError(res, error);
    }
  }
);

router.post(
  '/deletion-requests/:id/legal-hold',
  adminAuth,
  requirePrivacyLegalHold,
  requireRecentAdminMfa,
  requireObjectId,
  async (req, res) => {
    try {
      const request = await privacyRightsWorkflow.setLegalHold({
        kind: 'deletion',
        requestId: req.params.id,
        admin: req.user,
        action: req.body?.action,
        policyReference: req.body?.policyReference,
        source: getSource(req),
      });
      auditAdminAction(req, 'deletion_legal_hold_changed', req.params.id);
      return res.json({
        success: true,
        data: { request: serializeDeletionRequest(request) },
      });
    } catch (error) {
      auditAdminAction(req, 'deletion_legal_hold_changed', req.params.id, 'failure');
      return sendError(res, error);
    }
  }
);

module.exports = router;
