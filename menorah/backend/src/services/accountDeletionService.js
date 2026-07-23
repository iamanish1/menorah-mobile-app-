const mongoose = require('mongoose');
const User = require('../models/User');
const DataDeletionRequest = require('../models/DataDeletionRequest');
const PrivacyEvent = require('../models/PrivacyEvent');
const { revokeAllSessions } = require('../utils/sessionLifecycle');
const {
  appendPrivacyEvent,
  hashIdempotencyKey,
  verifyPrivacyEventOperation,
} = require('./privacyEventService');

const makeError = (code, message, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const normalizeSource = (source) => {
  const normalized = String(source || 'authenticated-api').trim().toLowerCase();
  return /^[a-z0-9_.:-]{1,64}$/.test(normalized)
    ? normalized
    : 'authenticated-api';
};

const withSession = (query, session) => {
  if (session && typeof query.session === 'function') return query.session(session);
  return query;
};

const resolveQuery = async (query, session) => {
  const sessionQuery = withSession(query, session);
  if (typeof sessionQuery.lean === 'function') return sessionQuery.lean();
  return sessionQuery;
};

const runTransaction = async (work, mongooseInstance = mongoose) => {
  const session = await mongooseInstance.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const deletionEventIdempotencyKey = (requestId) => (
  `account-deletion:${String(requestId)}`
);

const ACTIVE_DELETION_STATUSES = new Set(['pending', 'under_review']);

const createAccountDeletionService = ({
  UserModel = User,
  DeletionRequestModel = DataDeletionRequest,
  PrivacyEventModel = PrivacyEvent,
  appendEvent = appendPrivacyEvent,
  verifyEvent = verifyPrivacyEventOperation,
  transactionRunner = runTransaction,
} = {}) => {
  const requestDeletion = async ({
    userId,
    password,
    source,
    now = new Date(),
  }) => transactionRunner(async (session) => {
    const userQuery = UserModel.findById(userId)
      .select('+password +passwordAuthEnabled');
    const user = await withSession(userQuery, session);
    if (!user) {
      throw makeError('ACCOUNT_NOT_FOUND', 'User not found', 404);
    }

    if (user.passwordAuthEnabled !== true) {
      throw makeError(
        'ACCOUNT_PASSWORD_SETUP_REQUIRED',
        'Use the verified email password-reset flow to establish a password before deleting this social-sign-in account.',
        409
      );
    }
    const passwordValid = await user.comparePassword(password);
    if (!passwordValid) {
      throw makeError('ACCOUNT_PASSWORD_INVALID', 'Password is incorrect', 400);
    }

    let deletionRequest = await resolveQuery(
      DeletionRequestModel.findOne({ user: user._id }),
      session
    );
    const accountWasActive = user.isActive !== false;
    if (!deletionRequest && !accountWasActive) {
      throw makeError(
        'ACCOUNT_DELETION_STATE_INVALID',
        'Inactive account has no deletion review request.',
        409
      );
    }
    if (
      deletionRequest
      && accountWasActive
      && !ACTIVE_DELETION_STATUSES.has(deletionRequest.status)
    ) {
      throw makeError(
        'ACCOUNT_DELETION_STATE_INVALID',
        'Account deletion review is already closed.',
        409
      );
    }

    // Write the user first so concurrent requests contend on one document.
    // The driver's transaction retry then observes the winning request/event
    // instead of racing two unique inserts.
    if (accountWasActive) {
      user.isActive = false;
      revokeAllSessions(user);
      await user.save(session ? { session } : undefined);
    }

    let created = false;
    if (!deletionRequest) {
      const [createdRequest] = await DeletionRequestModel.create([{
        user: user._id,
        requestedAt: now,
        accountDeactivatedAt: now,
        retentionReviewAfter: now,
        status: 'pending',
      }], session ? { session } : undefined);
      deletionRequest = createdRequest;
      created = true;
    }

    const eventKey = deletionEventIdempotencyKey(deletionRequest._id);
    const idempotencyKeyHash = hashIdempotencyKey({
      subjectUser: user._id,
      idempotencyKey: eventKey,
    });
    const eventQuery = PrivacyEventModel.findOne({ idempotencyKeyHash });
    if (typeof eventQuery.select === 'function') {
      eventQuery.select('+idempotencyKeyHash +clientIdempotencyKeyHash');
    }
    let event = await resolveQuery(
      eventQuery,
      session
    );
    if (!event) {
      event = await appendEvent({
        eventType: 'account_deletion_requested',
        actor: user._id,
        actorRole: user.role,
        subjectUser: user._id,
        requestType: 'deletion',
        requestId: deletionRequest._id,
        source: normalizeSource(source),
        fromStatus: null,
        toStatus: deletionRequest.status,
        idempotencyKey: eventKey,
        occurredAt: deletionRequest.requestedAt || now,
        session,
      });
    }
    const eventVerification = verifyEvent(event, {
      evidenceVersion: 'v2',
      eventType: 'account_deletion_requested',
      subjectUser: user._id,
      requestType: 'deletion',
      requestId: deletionRequest._id,
      idempotencyKeyHash,
      fromStatus: null,
      toStatus: deletionRequest.status,
    });
    if (!eventVerification.valid) {
      throw makeError(
        'ACCOUNT_DELETION_EVIDENCE_INVALID',
        'Account deletion evidence failed integrity verification.',
        503
      );
    }

    return {
      request: deletionRequest,
      event,
      created,
      accountDeactivated: true,
    };
  });

  return { requestDeletion };
};

module.exports = {
  createAccountDeletionService,
  deletionEventIdempotencyKey,
  accountDeletionService: createAccountDeletionService(),
};
