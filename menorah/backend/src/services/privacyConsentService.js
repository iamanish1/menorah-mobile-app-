const crypto = require('crypto');
const mongoose = require('mongoose');
const PrivacyConsentState = require('../models/PrivacyConsentState');
const PrivacyEvent = require('../models/PrivacyEvent');
const { readPrivacyConfiguration } = require('../config/privacy');
const {
  appendPrivacyEvent,
  hashIdempotencyKey,
  verifyPrivacyEventOperation,
} = require('./privacyEventService');

const CONSENT_EVENT_TYPES = [
  'privacy_notice_accepted',
  'privacy_notice_withdrawn',
];

const makeError = (code, message, statusCode = 409) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
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

const buildConsentTransitionIdentity = ({
  subjectUser,
  action,
  noticeVersion,
  predecessorId = null,
}) => crypto
  .createHash('sha256')
  .update([
    String(subjectUser),
    String(action),
    String(noticeVersion),
    predecessorId ? String(predecessorId) : 'initial',
  ].join('\u0000'))
  .digest('hex');

const buildConsentTransitionKey = (input) => (
  `privacy-consent:${buildConsentTransitionIdentity(input)}`
);

const isDuplicateKeyError = (error) => (
  error?.code === 11000
  || error?.errorResponse?.code === 11000
  || error?.cause?.code === 11000
);

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

const createPrivacyConsentService = ({
  ConsentStateModel = PrivacyConsentState,
  PrivacyEventModel = PrivacyEvent,
  appendEvent = appendPrivacyEvent,
  readConfig = readPrivacyConfiguration,
  transactionRunner = runTransaction,
} = {}) => {
  const eventQuery = (predicate) => PrivacyEventModel.findOne(predicate)
    .select('+idempotencyKeyHash +clientIdempotencyKeyHash');

  const getLatestEvent = async ({ userId, session = null }) => {
    const query = eventQuery({
      subjectUser: userId,
      eventType: { $in: CONSENT_EVENT_TYPES },
    }).sort({ occurredAt: -1, _id: -1 });
    return resolveQuery(query, session);
  };

  const validateStoredEvent = (event) => {
    if (!event) return null;
    const action = event.consentAction;
    const eventType = action === 'accepted'
      ? 'privacy_notice_accepted'
      : action === 'withdrawn'
        ? 'privacy_notice_withdrawn'
        : null;
    if (!eventType || event.eventType !== eventType) {
      throw makeError(
        'PRIVACY_CONSENT_EVIDENCE_INVALID',
        'Stored privacy consent evidence failed integrity verification.',
        503
      );
    }
    const transitionIdentityHash = buildConsentTransitionIdentity({
      subjectUser: event.subjectUser,
      action,
      noticeVersion: event.noticeVersion,
      predecessorId: event.predecessorEventId,
    });
    const idempotencyKeyHash = hashIdempotencyKey({
      subjectUser: event.subjectUser,
      idempotencyKey: `privacy-consent:${transitionIdentityHash}`,
    });
    const verification = verifyPrivacyEventOperation(event, {
      evidenceVersion: 'v2',
      eventType,
      subjectUser: event.subjectUser,
      noticeVersion: event.noticeVersion,
      consentAction: action,
      idempotencyKeyHash,
      predecessorEventId: event.predecessorEventId || null,
      transitionIdentityHash,
    });
    if (!verification.valid) {
      throw makeError(
        'PRIVACY_CONSENT_EVIDENCE_INVALID',
        'Stored privacy consent evidence failed integrity verification.',
        503
      );
    }
    return event;
  };

  const loadState = ({ userId, session = null }) => resolveQuery(
    ConsentStateModel.findOne({ subjectUser: userId }),
    session
  );

  const loadStateEvent = async ({ state, userId, session = null }) => {
    if (!state?.currentEvent) return null;
    const event = validateStoredEvent(await resolveQuery(eventQuery({
      _id: state.currentEvent,
      subjectUser: userId,
    }), session));
    if (
      event.consentAction !== state.action
      || String(event.noticeVersion) !== String(state.noticeVersion)
    ) {
      throw makeError(
        'PRIVACY_CONSENT_STATE_INVALID',
        'Stored privacy consent state failed integrity verification.',
        503
      );
    }
    return event;
  };

  const ensureState = async ({ userId, session }) => {
    let state = await loadState({ userId, session });
    if (state) return state;

    const latest = validateStoredEvent(await getLatestEvent({ userId, session }));
    const [created] = await ConsentStateModel.create([{
      subjectUser: userId,
      currentEvent: latest?._id || null,
      action: latest?.consentAction || null,
      noticeVersion: latest?.noticeVersion || null,
      version: 0,
    }], session ? { session } : undefined);
    state = typeof created.toObject === 'function'
      ? created.toObject()
      : created;
    return state;
  };

  const getCurrent = async ({ userId }) => {
    const state = await loadState({ userId });
    if (!state) return validateStoredEvent(await getLatestEvent({ userId }));
    return loadStateEvent({ state, userId });
  };

  const assertClientReplay = ({
    event,
    state,
    action,
    noticeVersion,
    clientIdempotencyKeyHash,
  }) => {
    validateStoredEvent(event);
    if (
      event.consentAction !== action
      || String(event.noticeVersion) !== String(noticeVersion)
      || event.clientIdempotencyKeyHash !== clientIdempotencyKeyHash
    ) {
      throw makeError(
        'PRIVACY_IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key was already used for a different consent operation.'
      );
    }
    if (String(state.currentEvent || '') !== String(event._id)) {
      throw makeError(
        'PRIVACY_IDEMPOTENCY_KEY_STALE',
        'Idempotency-Key refers to a consent transition that is no longer current.'
      );
    }
    return { event, created: false };
  };

  const record = async ({
    user,
    action,
    noticeVersion,
    source,
    idempotencyKey = null,
    now = new Date(),
  }) => {
    if (!['accepted', 'withdrawn'].includes(action)) {
      throw makeError('PRIVACY_CONSENT_ACTION_INVALID', 'Consent action is invalid.', 400);
    }

    const clientIdempotencyKeyHash = hashIdempotencyKey({
      subjectUser: user._id,
      idempotencyKey,
    });
    const config = action === 'accepted' ? readConfig() : null;
    if (action === 'accepted') {
      if (!config.noticeVersion) {
        throw makeError(
          'PRIVACY_NOTICE_NOT_CONFIGURED',
          'The approved privacy notice version is not configured.',
          503
        );
      }
      if (String(noticeVersion || '').trim() !== config.noticeVersion) {
        throw makeError(
          'PRIVACY_NOTICE_VERSION_MISMATCH',
          'The submitted privacy notice version is not current.'
        );
      }
    }

    let attemptedTransition = null;
    try {
      return await transactionRunner(async (session) => {
        const state = await ensureState({ userId: user._id, session });
        const current = await loadStateEvent({
          state,
          userId: user._id,
          session,
        });
        const effectiveVersion = action === 'accepted'
          ? config.noticeVersion
          : current?.noticeVersion;

        if (clientIdempotencyKeyHash) {
          const keyedEvent = await resolveQuery(eventQuery({
            subjectUser: user._id,
            clientIdempotencyKeyHash,
          }), session);
          if (keyedEvent) {
            return assertClientReplay({
              event: keyedEvent,
              state,
              action,
              noticeVersion: effectiveVersion,
              clientIdempotencyKeyHash,
            });
          }
        }

        if (action === 'withdrawn') {
          if (!current) {
            throw makeError(
              'PRIVACY_CONSENT_NOT_FOUND',
              'No privacy notice acceptance is available to withdraw.'
            );
          }
          if (
            noticeVersion
            && String(noticeVersion).trim() !== String(current.noticeVersion)
          ) {
            throw makeError(
              'PRIVACY_NOTICE_VERSION_MISMATCH',
              'The withdrawal must reference the currently accepted notice version.'
            );
          }
        }

        const alreadyCurrent = (
          current?.consentAction === action
          && String(current.noticeVersion) === String(effectiveVersion)
        );
        if (alreadyCurrent) {
          if (clientIdempotencyKeyHash) {
            throw makeError(
              'PRIVACY_CONSENT_IDEMPOTENCY_KEY_UNBOUND',
              'The current consent transition was recorded with a different idempotency key.'
            );
          }
          return { event: current, created: false };
        }

        const predecessorId = current?._id || null;
        const transitionIdentityHash = buildConsentTransitionIdentity({
          subjectUser: user._id,
          action,
          noticeVersion: effectiveVersion,
          predecessorId,
        });
        const transitionKey = `privacy-consent:${transitionIdentityHash}`;
        attemptedTransition = {
          action,
          noticeVersion: effectiveVersion,
          predecessorId,
          transitionIdentityHash,
          transitionKey,
          clientIdempotencyKeyHash,
        };

        const event = await appendEvent({
          eventType: action === 'accepted'
            ? 'privacy_notice_accepted'
            : 'privacy_notice_withdrawn',
          actor: user._id,
          actorRole: user.role,
          subjectUser: user._id,
          noticeVersion: effectiveVersion,
          consentAction: action,
          source,
          idempotencyKey: transitionKey,
          clientIdempotencyKey: idempotencyKey,
          predecessorEventId: predecessorId,
          transitionIdentityHash,
          occurredAt: now,
          session,
        });

        const updatedState = await withSession(ConsentStateModel.findOneAndUpdate(
          {
            _id: state._id,
            version: state.version,
            currentEvent: state.currentEvent || null,
          },
          {
            $set: {
              currentEvent: event._id,
              action,
              noticeVersion: effectiveVersion,
            },
            $inc: { version: 1 },
          },
          { new: true, runValidators: true }
        ), session);
        if (!updatedState) {
          throw makeError(
            'PRIVACY_CONSENT_STATE_CONCURRENT_CHANGE',
            'Consent state changed concurrently; reload before retrying.'
          );
        }
        return { event, created: true };
      });
    } catch (error) {
      if (!isDuplicateKeyError(error) || !attemptedTransition) throw error;

      const state = await loadState({ userId: user._id });
      if (!state) throw error;
      if (clientIdempotencyKeyHash) {
        const keyedEvent = await resolveQuery(eventQuery({
          subjectUser: user._id,
          clientIdempotencyKeyHash,
        }), null);
        if (keyedEvent) {
          return assertClientReplay({
            event: keyedEvent,
            state,
            action,
            noticeVersion: attemptedTransition.noticeVersion,
            clientIdempotencyKeyHash,
          });
        }
      }

      const winningEvent = validateStoredEvent(await resolveQuery(eventQuery({
        subjectUser: user._id,
        transitionIdentityHash: attemptedTransition.transitionIdentityHash,
      }), null));
      if (!winningEvent) throw error;
      if (
        winningEvent.clientIdempotencyKeyHash !== clientIdempotencyKeyHash
        || String(state.currentEvent || '') !== String(winningEvent._id)
      ) {
        throw makeError(
          'PRIVACY_CONSENT_TRANSITION_CONFLICT',
          'An equivalent consent transition was recorded with a different idempotency identity.'
        );
      }
      return { event: winningEvent, created: false };
    }
  };

  return { getCurrent, record };
};

module.exports = {
  CONSENT_EVENT_TYPES,
  buildConsentTransitionIdentity,
  buildConsentTransitionKey,
  createPrivacyConsentService,
  privacyConsentService: createPrivacyConsentService(),
};
