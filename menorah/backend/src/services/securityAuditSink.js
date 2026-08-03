const crypto = require('crypto');
const mongoose = require('mongoose');

const AUDIT_EVENT_COLLECTION = 'securityauditevents';
const AUDIT_CHECKPOINT_COLLECTION = 'securityauditcheckpoints';
const EVIDENCE_VERSION = 'security-audit-v1';
const DEFAULT_PENDING_LIMIT = 1024;
const MIN_PENDING_LIMIT = 128;
const MAX_PENDING_LIMIT = 8192;
const RETRY_MIN_MS = 250;
const RETRY_MAX_MS = 30_000;
const TRANSACTION_ATTEMPTS = 5;
const TRANSACTION_OPTIONS = Object.freeze({
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  readPreference: 'primary',
  maxCommitTimeMS: 5000,
});
const DURABLE_ENTRY_FIELDS = Object.freeze([
  'eventId',
  'timestamp',
  'category',
  'event',
  'outcome',
  'service',
  'method',
  'path',
  'statusCode',
  'actorId',
  'actorRole',
  'sourceIp',
  'action',
  'provider',
  'permission',
  'reason',
  'resource',
  'operationalRole',
  'targetId',
  'transport',
]);
const STRING_LIMITS = Object.freeze({
  eventId: 64,
  category: 32,
  event: 64,
  outcome: 64,
  service: 64,
  method: 64,
  path: 256,
  actorId: 128,
  actorRole: 64,
  sourceIp: 128,
  action: 64,
  provider: 64,
  permission: 64,
  reason: 64,
  resource: 256,
  operationalRole: 64,
  targetId: 128,
  transport: 64,
});
const FIXED_FAILURE_REASONS = Object.freeze([
  'configuration',
  'database_unavailable',
  'checkpoint_invalid',
  'transaction_conflict',
  'write_failure',
  'queue_overflow',
]);

const createFailureCounts = () => Object.fromEntries(
  FIXED_FAILURE_REASONS.map((reason) => [reason, 0])
);

const state = {
  pending: [],
  draining: null,
  retryTimer: null,
  retryDelayMs: RETRY_MIN_MS,
  persisted: 0,
  failureCounts: createFailureCounts(),
  lastSuccessAt: null,
  lastDiagnosticAt: 0,
  appenderOverride: null,
  autoDrainOverride: null,
  drainScheduled: false,
};

const stableEventPayload = (entry) => JSON.stringify({
  evidenceVersion: entry.evidenceVersion,
  eventId: entry.eventId,
  scope: entry.scope,
  sequence: entry.sequence,
  timestamp: new Date(entry.timestamp).toISOString(),
  persistedAt: new Date(entry.persistedAt).toISOString(),
  category: entry.category,
  event: entry.event,
  outcome: entry.outcome,
  service: entry.service,
  method: entry.method,
  path: entry.path,
  statusCode: entry.statusCode ?? null,
  actorId: entry.actorId ?? null,
  actorRole: entry.actorRole,
  sourceIp: entry.sourceIp ?? null,
  action: entry.action ?? null,
  provider: entry.provider ?? null,
  permission: entry.permission ?? null,
  reason: entry.reason ?? null,
  resource: entry.resource ?? null,
  operationalRole: entry.operationalRole ?? null,
  targetId: entry.targetId ?? null,
  transport: entry.transport ?? null,
  previousIntegrityHash: entry.previousIntegrityHash ?? null,
});

const stableCheckpointPayload = (checkpoint) => JSON.stringify({
  evidenceVersion: checkpoint.evidenceVersion,
  scope: checkpoint.scope,
  sequence: checkpoint.sequence,
  headIntegrityHash: checkpoint.headIntegrityHash,
  updatedAt: new Date(checkpoint.updatedAt).toISOString(),
});

const calculateHmac = (payload, signingKey) => crypto
  .createHmac('sha256', signingKey)
  .update(payload)
  .digest('hex');

const safeHashEqual = (actual, expected) => {
  const normalizedActual = String(actual || '');
  const normalizedExpected = String(expected || '');
  return normalizedActual.length === normalizedExpected.length
    && normalizedActual.length > 0
    && crypto.timingSafeEqual(
      Buffer.from(normalizedActual),
      Buffer.from(normalizedExpected)
    );
};

const requireSigningKey = (value = process.env.AUDIT_LOG_SIGNING_KEY) => {
  const key = String(value || '').trim();
  if (key.length < 32 || /^REPLACE/i.test(key)) {
    const error = new Error('Security audit durable signing is not configured');
    error.code = 'SECURITY_AUDIT_SIGNING_NOT_CONFIGURED';
    throw error;
  }
  return key;
};

const calculateDurableIntegrityHash = (entry, signingKey = requireSigningKey()) => (
  calculateHmac(stableEventPayload(entry), signingKey)
);

const calculateCheckpointHash = (checkpoint, signingKey = requireSigningKey()) => (
  calculateHmac(stableCheckpointPayload(checkpoint), signingKey)
);

const verifyCheckpoint = (checkpoint, signingKey = process.env.AUDIT_LOG_SIGNING_KEY) => {
  if (!checkpoint) return { valid: false, reason: 'missing_checkpoint' };

  let key;
  let expectedHash;
  try {
    key = requireSigningKey(signingKey);
    expectedHash = calculateCheckpointHash(checkpoint, key);
  } catch {
    return { valid: false, reason: 'invalid_checkpoint_payload' };
  }

  if (!safeHashEqual(checkpoint.checkpointHash, expectedHash)) {
    return { valid: false, reason: 'checkpoint_hash_mismatch' };
  }
  return { valid: true };
};

const normalizeTimestamp = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    const error = new Error('Security audit event timestamp is invalid');
    error.code = 'SECURITY_AUDIT_ENTRY_INVALID';
    throw error;
  }
  return date.toISOString();
};

const sanitizeDurableEntry = (entry = {}) => {
  const durable = {};
  for (const field of DURABLE_ENTRY_FIELDS) {
    const value = entry[field];
    if (value === undefined || value === null) continue;
    if (field === 'timestamp') {
      durable.timestamp = normalizeTimestamp(value);
      continue;
    }
    if (field === 'statusCode') {
      if (Number.isInteger(value) && value >= 100 && value <= 599) {
        durable.statusCode = value;
      }
      continue;
    }
    const limit = STRING_LIMITS[field];
    durable[field] = String(value).slice(0, limit);
  }

  if (!/^[0-9a-f-]{36}$/i.test(durable.eventId || '')) {
    const error = new Error('Security audit event ID is invalid');
    error.code = 'SECURITY_AUDIT_ENTRY_INVALID';
    throw error;
  }
  if (!/^[a-z0-9_.-]{1,64}$/.test(durable.service || '')) {
    const error = new Error('Security audit service scope is invalid');
    error.code = 'SECURITY_AUDIT_ENTRY_INVALID';
    throw error;
  }
  if (!durable.timestamp || !durable.event || !durable.outcome || !durable.category) {
    const error = new Error('Security audit event is incomplete');
    error.code = 'SECURITY_AUDIT_ENTRY_INVALID';
    throw error;
  }
  durable.actorRole = durable.actorRole || 'anonymous';
  durable.method = durable.method || 'unknown';
  durable.path = durable.path || '/';
  return durable;
};

const createAuditAppendMutation = ({
  entry,
  checkpoint = null,
  signingKey = process.env.AUDIT_LOG_SIGNING_KEY,
  persistedAt = new Date(),
}) => {
  const key = requireSigningKey(signingKey);
  const durable = sanitizeDurableEntry(entry);
  if (checkpoint) {
    const checkpointVerification = verifyCheckpoint(checkpoint, key);
    if (!checkpointVerification.valid || checkpoint.scope !== durable.service) {
      const error = new Error('Security audit checkpoint integrity verification failed');
      error.code = 'SECURITY_AUDIT_CHECKPOINT_INVALID';
      throw error;
    }
  }

  const sequence = checkpoint ? Number(checkpoint.sequence) + 1 : 1;
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    const error = new Error('Security audit checkpoint sequence is invalid');
    error.code = 'SECURITY_AUDIT_CHECKPOINT_INVALID';
    throw error;
  }

  const normalizedPersistedAt = normalizeTimestamp(persistedAt);
  const durableEvent = {
    evidenceVersion: EVIDENCE_VERSION,
    ...durable,
    scope: durable.service,
    sequence,
    persistedAt: normalizedPersistedAt,
    previousIntegrityHash: checkpoint?.headIntegrityHash || null,
  };
  durableEvent.integrityHash = calculateDurableIntegrityHash(durableEvent, key);

  const nextCheckpoint = {
    evidenceVersion: EVIDENCE_VERSION,
    scope: durable.service,
    sequence,
    headIntegrityHash: durableEvent.integrityHash,
    updatedAt: normalizedPersistedAt,
  };
  nextCheckpoint.checkpointHash = calculateCheckpointHash(nextCheckpoint, key);

  return { event: durableEvent, checkpoint: nextCheckpoint };
};

const verifyDurableSecurityAuditChain = (entries, checkpoint, {
  signingKey = process.env.AUDIT_LOG_SIGNING_KEY,
  expectedScope = checkpoint?.scope,
} = {}) => {
  let key;
  try {
    key = requireSigningKey(signingKey);
  } catch {
    return { valid: false, index: 0, reason: 'missing_signing_key' };
  }

  const checkpointVerification = verifyCheckpoint(checkpoint, key);
  if (!checkpointVerification.valid) {
    return { valid: false, index: 0, reason: checkpointVerification.reason };
  }
  if (!expectedScope || checkpoint.scope !== expectedScope) {
    return { valid: false, index: 0, reason: 'scope_mismatch' };
  }
  if (checkpoint.sequence !== entries.length) {
    return { valid: false, index: entries.length, reason: 'sequence_count_mismatch' };
  }

  let previousIntegrityHash = null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] || {};
    if (entry.scope !== expectedScope || entry.service !== expectedScope) {
      return { valid: false, index, reason: 'scope_mismatch' };
    }
    if (entry.sequence !== index + 1) {
      return { valid: false, index, reason: 'sequence_mismatch' };
    }
    if ((entry.previousIntegrityHash || null) !== previousIntegrityHash) {
      return { valid: false, index, reason: 'chain_link_mismatch' };
    }

    let expectedHash;
    try {
      expectedHash = calculateDurableIntegrityHash(entry, key);
    } catch {
      return { valid: false, index, reason: 'invalid_event_payload' };
    }
    if (!safeHashEqual(entry.integrityHash, expectedHash)) {
      return { valid: false, index, reason: 'integrity_hash_mismatch' };
    }
    previousIntegrityHash = entry.integrityHash;
  }

  if (
    checkpoint.sequence !== entries.length
    || checkpoint.headIntegrityHash !== previousIntegrityHash
  ) {
    return { valid: false, index: entries.length, reason: 'checkpoint_head_mismatch' };
  }
  return {
    valid: true,
    scope: expectedScope,
    sequence: checkpoint.sequence,
    head: checkpoint.headIntegrityHash,
  };
};

const isRetryableTransactionError = (error) => (
  error?.code === 11000
  || error?.code === 112
  || error?.codeName === 'WriteConflict'
  || error?.code === 'SECURITY_AUDIT_TRANSACTION_CONFLICT'
  || error?.hasErrorLabel?.('TransientTransactionError')
  || error?.hasErrorLabel?.('UnknownTransactionCommitResult')
);

const findExistingEvent = async (events, eventId) => (
  events.findOne({ eventId }, { projection: { _id: 0 } })
);

const verifyExistingIdempotentEvent = (event, checkpoint, signingKey) => {
  if (!event) return null;
  const expectedHash = calculateDurableIntegrityHash(event, signingKey);
  if (!safeHashEqual(event.integrityHash, expectedHash)) {
    const error = new Error('Existing security audit event failed integrity verification');
    error.code = 'SECURITY_AUDIT_CHECKPOINT_INVALID';
    throw error;
  }
  const checkpointVerification = verifyCheckpoint(checkpoint, signingKey);
  if (
    !checkpointVerification.valid
    || checkpoint.scope !== event.scope
    || checkpoint.sequence < event.sequence
    || (
      checkpoint.sequence === event.sequence
      && checkpoint.headIntegrityHash !== event.integrityHash
    )
  ) {
    const error = new Error('Existing security audit event is not covered by its checkpoint');
    error.code = 'SECURITY_AUDIT_CHECKPOINT_INVALID';
    throw error;
  }
  return event;
};

const runMongoAuditTransaction = async (entry, {
  mongooseInstance = mongoose,
  signingKey = process.env.AUDIT_LOG_SIGNING_KEY,
  now = () => new Date(),
} = {}) => {
  const key = requireSigningKey(signingKey);
  if (
    mongooseInstance.connection?.readyState !== 1
    || !mongooseInstance.connection?.db
  ) {
    const error = new Error('Security audit database is unavailable');
    error.code = 'SECURITY_AUDIT_DATABASE_UNAVAILABLE';
    throw error;
  }

  const durable = sanitizeDurableEntry(entry);
  const events = mongooseInstance.connection.db.collection(AUDIT_EVENT_COLLECTION);
  const checkpoints = mongooseInstance.connection.db.collection(AUDIT_CHECKPOINT_COLLECTION);
  const initialCheckpoint = await checkpoints.findOne({ scope: durable.service });
  const existing = verifyExistingIdempotentEvent(
    await findExistingEvent(events, durable.eventId),
    initialCheckpoint,
    key
  );
  if (existing) return existing;

  let lastError;
  for (let attempt = 0; attempt < TRANSACTION_ATTEMPTS; attempt += 1) {
    const session = await mongooseInstance.startSession();
    let persistedEvent;
    try {
      await session.withTransaction(async () => {
        const currentCheckpoint = await checkpoints.findOne(
          { scope: durable.service },
          { session }
        );
        const mutation = createAuditAppendMutation({
          entry: durable,
          checkpoint: currentCheckpoint,
          signingKey: key,
          persistedAt: now(),
        });

        await events.insertOne(mutation.event, { session });
        if (currentCheckpoint) {
          const result = await checkpoints.updateOne(
            {
              _id: currentCheckpoint._id,
              sequence: currentCheckpoint.sequence,
              checkpointHash: currentCheckpoint.checkpointHash,
            },
            { $set: mutation.checkpoint },
            { session }
          );
          if (result.modifiedCount !== 1) {
            const error = new Error('Security audit checkpoint changed concurrently');
            error.code = 'SECURITY_AUDIT_TRANSACTION_CONFLICT';
            throw error;
          }
        } else {
          await checkpoints.insertOne(mutation.checkpoint, { session });
        }
        persistedEvent = mutation.event;
      }, TRANSACTION_OPTIONS);
      return persistedEvent;
    } catch (error) {
      lastError = error;
      const recoveryCheckpoint = await checkpoints.findOne({ scope: durable.service });
      const alreadyPersisted = verifyExistingIdempotentEvent(
        await findExistingEvent(events, durable.eventId),
        recoveryCheckpoint,
        key
      );
      if (alreadyPersisted) return alreadyPersisted;
      if (!isRetryableTransactionError(error) || attempt === TRANSACTION_ATTEMPTS - 1) {
        throw error;
      }
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
};

const createSecurityAuditAppender = ({
  transact = runMongoAuditTransaction,
  signingKeyProvider = () => process.env.AUDIT_LOG_SIGNING_KEY,
  now = () => new Date(),
} = {}) => async (entry) => transact(entry, {
  signingKey: requireSigningKey(signingKeyProvider()),
  now,
});

const defaultAppender = createSecurityAuditAppender();

const parsePendingLimit = () => {
  const parsed = Number.parseInt(process.env.SECURITY_AUDIT_PENDING_MAX, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PENDING_LIMIT;
  return Math.min(MAX_PENDING_LIMIT, Math.max(MIN_PENDING_LIMIT, parsed));
};

const isSinkEnabled = () => (
  process.env.NODE_ENV !== 'test'
  || process.env.SECURITY_AUDIT_DURABLE_TEST_OUTPUT === 'true'
);

const classifyFailure = (error) => {
  if (error?.code === 'SECURITY_AUDIT_SIGNING_NOT_CONFIGURED') return 'configuration';
  if (error?.code === 'SECURITY_AUDIT_DATABASE_UNAVAILABLE') return 'database_unavailable';
  if (error?.code === 'SECURITY_AUDIT_CHECKPOINT_INVALID') return 'checkpoint_invalid';
  if (isRetryableTransactionError(error)) return 'transaction_conflict';
  return 'write_failure';
};

const incrementFailure = (reason) => {
  state.failureCounts[reason] += 1;
};

const emitFixedDiagnostic = (reason) => {
  const now = Date.now();
  if (now - state.lastDiagnosticAt < 60_000) return;
  state.lastDiagnosticAt = now;
  console.error(
    `[security-audit] durable sink degraded (${reason}); events remain queued within the configured bound`
  );
};

const clearRetryTimer = () => {
  if (!state.retryTimer) return;
  clearTimeout(state.retryTimer);
  state.retryTimer = null;
};

const shouldAutoDrain = () => (
  state.autoDrainOverride === null ? true : state.autoDrainOverride
);

const scheduleDrain = (delayMs = 0) => {
  if (
    !shouldAutoDrain()
    || state.draining
    || state.retryTimer
    || state.drainScheduled
  ) return;
  if (delayMs === 0) {
    state.drainScheduled = true;
    queueMicrotask(() => {
      state.drainScheduled = false;
      drainSecurityAuditSink().catch(() => {});
    });
    return;
  }
  state.retryTimer = setTimeout(() => {
    state.retryTimer = null;
    drainSecurityAuditSink().catch(() => {});
  }, delayMs);
  state.retryTimer.unref?.();
};

const drainSecurityAuditSink = async ({ scheduleRetry = true } = {}) => {
  if (state.draining) return state.draining;
  clearRetryTimer();
  let retryDelayForFailure = null;
  state.draining = (async () => {
    while (state.pending.length > 0) {
      const entry = state.pending[0];
      try {
        const appender = state.appenderOverride || defaultAppender;
        await appender(entry);
        state.pending.shift();
        state.persisted += 1;
        state.lastSuccessAt = new Date().toISOString();
        state.retryDelayMs = RETRY_MIN_MS;
      } catch (error) {
        const reason = classifyFailure(error);
        incrementFailure(reason);
        emitFixedDiagnostic(reason);
        if (scheduleRetry) {
          retryDelayForFailure = state.retryDelayMs;
          state.retryDelayMs = Math.min(RETRY_MAX_MS, state.retryDelayMs * 2);
        }
        break;
      }
    }
  })();

  try {
    await state.draining;
  } finally {
    state.draining = null;
  }
  if (state.pending.length > 0 && scheduleRetry && !state.retryTimer) {
    scheduleDrain(retryDelayForFailure || state.retryDelayMs);
  }
  return getSecurityAuditSinkSnapshot();
};

const enqueueSecurityAuditEntry = (entry) => {
  if (!isSinkEnabled()) return false;
  if (state.pending.length >= parsePendingLimit()) {
    incrementFailure('queue_overflow');
    emitFixedDiagnostic('queue_overflow');
    return false;
  }
  try {
    state.pending.push(sanitizeDurableEntry(entry));
  } catch {
    incrementFailure('write_failure');
    emitFixedDiagnostic('write_failure');
    return false;
  }
  scheduleDrain();
  return true;
};

const getSecurityAuditSinkSnapshot = () => ({
  pending: state.pending.length,
  persisted: state.persisted,
  failureCounts: { ...state.failureCounts },
  lastSuccessAt: state.lastSuccessAt,
});

const configureSecurityAuditSinkForTests = ({
  appender = null,
  autoDrain = false,
} = {}) => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Security audit sink test configuration is restricted to NODE_ENV=test');
  }
  clearRetryTimer();
  state.appenderOverride = appender;
  state.autoDrainOverride = autoDrain;
};

const resetSecurityAuditSinkForTests = () => {
  clearRetryTimer();
  state.pending = [];
  state.draining = null;
  state.retryDelayMs = RETRY_MIN_MS;
  state.persisted = 0;
  state.failureCounts = createFailureCounts();
  state.lastSuccessAt = null;
  state.lastDiagnosticAt = 0;
  state.appenderOverride = null;
  state.autoDrainOverride = null;
  state.drainScheduled = false;
};

module.exports = {
  AUDIT_CHECKPOINT_COLLECTION,
  AUDIT_EVENT_COLLECTION,
  EVIDENCE_VERSION,
  calculateCheckpointHash,
  calculateDurableIntegrityHash,
  configureSecurityAuditSinkForTests,
  createAuditAppendMutation,
  createSecurityAuditAppender,
  drainSecurityAuditSink,
  enqueueSecurityAuditEntry,
  getSecurityAuditSinkSnapshot,
  resetSecurityAuditSinkForTests,
  runMongoAuditTransaction,
  sanitizeDurableEntry,
  stableCheckpointPayload,
  stableEventPayload,
  verifyCheckpoint,
  verifyDurableSecurityAuditChain,
};
