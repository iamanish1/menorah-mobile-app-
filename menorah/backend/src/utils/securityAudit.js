const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getValidatedClientIp } = require('../shared/app/requestProvenance');
const {
  enqueueSecurityAuditEntry,
  getSecurityAuditSinkSnapshot,
  resetSecurityAuditSinkForTests,
  verifyDurableSecurityAuditChain,
} = require('../services/securityAuditSink');
const {
  recordAuthenticationAttempt,
  recordHttpResponse,
  recordPrivilegeChange,
  renderApplicationMetrics,
  resetApplicationMetricsForTests,
} = require('./applicationMetrics');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SAFE_DETAIL_KEYS = new Set([
  'action',
  'actorId',
  'actorRole',
  'provider',
  'permission',
  'reason',
  'resource',
  'operationalRole',
  'targetId',
  'transport',
]);
const counters = new Map();
let auditChainHead = null;

const serializeIntegrityPayload = (entry) => JSON.stringify(Object.fromEntries(
  Object.entries(entry).filter(([key, value]) =>
    key !== 'integrityHash' && key !== 'previousIntegrityHash' && value !== undefined
  )
));

const calculateIntegrityHash = ({ entry, previousIntegrityHash = null, signingKey }) =>
  crypto
    .createHmac('sha256', signingKey)
    .update(`${previousIntegrityHash || ''}\n${serializeIntegrityPayload(entry)}`)
    .digest('hex');

const sanitizeLabel = (value, fallback = 'unknown') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '_')
    .slice(0, 64);
  return normalized || fallback;
};

const sanitizeId = (value) => {
  const raw = value?._id || value?.id || value;
  const normalized = String(raw || '').trim();
  return /^[a-zA-Z0-9_-]{1,128}$/.test(normalized) ? normalized : undefined;
};

const sanitizeDetails = (details = {}) => Object.fromEntries(
  Object.entries(details)
    .filter(([key, value]) => SAFE_DETAIL_KEYS.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (key.endsWith('Id')) return [key, sanitizeId(value)];
      return [key, sanitizeLabel(value)];
    })
    .filter(([, value]) => value !== undefined)
);

const getServiceName = () => sanitizeLabel(process.env.SERVICE_NAME || 'api');

const getSafeRequestPath = (req) => {
  const raw = String(req?.originalUrl || req?.url || '/');
  const queryIndex = raw.indexOf('?');
  return (queryIndex >= 0 ? raw.slice(0, queryIndex) : raw).slice(0, 256) || '/';
};

const incrementCounter = (event, outcome, service) => {
  const key = `${event}|${outcome}|${service}`;
  counters.set(key, (counters.get(key) || 0) + 1);
};

const signAuditEntry = (entry) => {
  const signingKey = String(process.env.AUDIT_LOG_SIGNING_KEY || '').trim();
  if (!signingKey) return entry;

  const previousIntegrityHash = auditChainHead;
  const integrityHash = calculateIntegrityHash({ entry, previousIntegrityHash, signingKey });

  auditChainHead = integrityHash;
  return {
    ...entry,
    ...(previousIntegrityHash ? { previousIntegrityHash } : {}),
    integrityHash,
  };
};

const verifyAuditChain = (entries, {
  signingKey = process.env.AUDIT_LOG_SIGNING_KEY,
  previousIntegrityHash = null,
} = {}) => {
  const key = String(signingKey || '').trim();
  if (!key) return { valid: false, index: 0, reason: 'missing_signing_key' };

  let expectedPreviousHash = previousIntegrityHash;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] || {};
    const actualPreviousHash = entry.previousIntegrityHash || null;
    if (actualPreviousHash !== expectedPreviousHash) {
      return { valid: false, index, reason: 'chain_link_mismatch' };
    }

    const expectedHash = calculateIntegrityHash({
      entry,
      previousIntegrityHash: expectedPreviousHash,
      signingKey: key,
    });
    const actualHash = String(entry.integrityHash || '');
    const hashesMatch = actualHash.length === expectedHash.length
      && crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
    if (!hashesMatch) return { valid: false, index, reason: 'integrity_hash_mismatch' };
    expectedPreviousHash = actualHash;
  }

  return { valid: true, head: expectedPreviousHash };
};

const appendAuditFile = (line) => {
  const directory = String(process.env.SECURITY_AUDIT_LOG_DIR || '').trim();
  if (!directory || process.env.NODE_ENV === 'test') return;

  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
    const filename = `security-audit-${getServiceName()}.log`;
    fs.appendFile(path.join(directory, filename), `${line}\n`, { encoding: 'utf8', mode: 0o640 }, () => {});
  } catch {
    // Audit events are still emitted to stdout when file logging is unavailable.
  }
};

const recordSecurityEvent = (eventName, {
  req,
  user,
  outcome = 'success',
  details = {},
  statusCode,
} = {}) => {
  const event = sanitizeLabel(eventName);
  const normalizedOutcome = sanitizeLabel(outcome);
  const service = getServiceName();
  const actorId = sanitizeId(user);
  const actorRole = sanitizeLabel(user?.role || details.actorRole, 'anonymous');
  const safeDetails = sanitizeDetails(details);

  const entry = signAuditEntry({
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    category: 'security',
    event,
    outcome: normalizedOutcome,
    service,
    method: sanitizeLabel(req?.method),
    path: getSafeRequestPath(req),
    statusCode: Number.isInteger(statusCode) ? statusCode : undefined,
    actorId,
    actorRole,
    sourceIp: String(
      req?.validatedClientIp || getValidatedClientIp(req)
    ).slice(0, 128) || undefined,
    ...safeDetails,
  });

  const line = JSON.stringify(Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)));
  incrementCounter(event, normalizedOutcome, service);

  if (process.env.NODE_ENV !== 'test' || process.env.SECURITY_AUDIT_TEST_OUTPUT === 'true') {
    const output = normalizedOutcome === 'success' ? console.info : console.warn;
    output(line);
  }
  appendAuditFile(line);
  enqueueSecurityAuditEntry(entry);
  return entry;
};

const classifyAuthEvent = (requestPath) => {
  if (/\/auth\/(?:admin\/)?login\/mfa$/.test(requestPath)) {
    return { event: 'mfa_attempt', method: 'mfa' };
  }
  if (/\/auth\/(?:admin\/)?login$/.test(requestPath)) {
    return { event: 'login_attempt', method: 'password' };
  }
  if (/\/auth\/(?:google|apple)$/.test(requestPath)) {
    return { event: 'login_attempt', method: 'federated' };
  }
  if (/\/auth\/reset-password$/.test(requestPath)) {
    return { event: 'password_reset', method: 'password_reset' };
  }
  if (/\/auth\/(?:verify-email-otp|verify-email|verify-phone)$/.test(requestPath)) {
    return { event: 'otp_verification', method: 'otp' };
  }
  return null;
};

const authenticationSubject = (req, res, requestPath) => {
  const actorRole = res.locals.securityActor?.role || req.user?.role;
  if (['user', 'counsellor', 'admin'].includes(actorRole)) return actorRole;
  if (
    res.locals.authenticationSubject === 'admin'
    || getServiceName() === 'api-admin'
    || /\/auth\/admin\//.test(requestPath)
  ) return 'admin';
  if (res.locals.authenticationSubject === 'counsellor') return 'counsellor';
  return 'user';
};

const classifySessionRevocation = (requestPath) => {
  if (/\/auth\/(?:admin\/)?logout-all$/.test(requestPath)) return 'all_devices';
  if (/\/auth\/(?:admin\/)?logout$/.test(requestPath)) return 'current_session';
  if (/\/auth\/reset-password$/.test(requestPath)) return 'password_reset';
  if (/\/users\/change-password$/.test(requestPath)) return 'password_change';
  if (/\/users\/account$/.test(requestPath)) return 'account_disabled';
  return null;
};

const securityAuditTrail = (req, res, next) => {
  res.on('finish', () => {
    const requestPath = getSafeRequestPath(req);
    const method = String(req.method || '').toUpperCase();
    const statusCode = res.statusCode;
    const outcome = statusCode < 400 ? 'success' : 'failure';
    const user = req.user || res.locals.securityActor;
    recordHttpResponse({ req, statusCode });

    const authEvent = classifyAuthEvent(requestPath);
    if (authEvent && !SAFE_METHODS.has(method)) {
      recordAuthenticationAttempt({
        req,
        subject: authenticationSubject(req, res, requestPath),
        method: authEvent.method,
        outcome,
      });
      recordSecurityEvent(authEvent.event, { req, user, outcome, statusCode });
    }

    if (statusCode < 400 && res.locals.securitySessionCreated) {
      recordSecurityEvent('session_created', {
        req,
        user,
        outcome,
        statusCode,
        details: { transport: res.locals.securitySessionTransport },
      });
    }

    const revocationAction = classifySessionRevocation(requestPath);
    if (revocationAction && statusCode < 400) {
      recordSecurityEvent('session_revoked', {
        req,
        user,
        outcome,
        statusCode,
        details: { action: revocationAction },
      });
    }

    if (!revocationAction && statusCode < 400 && res.locals.securitySessionRevoked) {
      recordSecurityEvent('session_revoked', {
        req,
        user: res.locals.securitySessionRevoked,
        outcome,
        statusCode,
        details: { action: res.locals.securitySessionRevocationAction },
      });
    }

    if (!SAFE_METHODS.has(method) && requestPath.startsWith('/api/admin')) {
      recordSecurityEvent(requestPath.includes('/payouts/') ? 'payout_action' : 'admin_change', {
        req,
        user,
        outcome,
        statusCode,
        details: { resource: requestPath },
      });
    }

    if (method === 'PUT' && requestPath === '/api/counsellors/me/bank-details') {
      recordSecurityEvent('bank_details_changed', {
        req,
        user,
        outcome,
        statusCode,
        details: { resource: 'counsellor_bank_details' },
      });
    }

    if ((statusCode === 401 || statusCode === 403) && !authEvent && !res.locals.securityAuthorizationLogged) {
      recordSecurityEvent('authorization_denied', { req, user, outcome: 'failure', statusCode });
    }
  });
  next();
};

const renderSecurityMetrics = () => {
  const sink = getSecurityAuditSinkSnapshot();
  const lines = [
    '# HELP menorah_security_events_total Security-relevant application events.',
    '# TYPE menorah_security_events_total counter',
  ];

  Array.from(counters.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([key, value]) => {
      const [event, outcome, service] = key.split('|');
      lines.push(`menorah_security_events_total{event="${event}",outcome="${outcome}",service="${service}"} ${value}`);
    });

  lines.push(
    '# HELP menorah_security_audit_sink_pending Security audit events waiting for durable persistence.',
    '# TYPE menorah_security_audit_sink_pending gauge',
    `menorah_security_audit_sink_pending{service="${getServiceName()}"} ${sink.pending}`,
    '# HELP menorah_security_audit_sink_persisted_total Security audit events durably persisted by this process.',
    '# TYPE menorah_security_audit_sink_persisted_total counter',
    `menorah_security_audit_sink_persisted_total{service="${getServiceName()}"} ${sink.persisted}`,
    '# HELP menorah_security_audit_sink_failures_total Security audit durable-sink failures by bounded reason.',
    '# TYPE menorah_security_audit_sink_failures_total counter'
  );
  Object.entries(sink.failureCounts).forEach(([reason, value]) => {
    lines.push(
      `menorah_security_audit_sink_failures_total{reason="${reason}",service="${getServiceName()}"} ${value}`
    );
  });

  return `${lines.join('\n')}\n${renderApplicationMetrics()}`;
};

const resetSecurityMetricsForTests = () => {
  counters.clear();
  auditChainHead = null;
  resetSecurityAuditSinkForTests();
  resetApplicationMetricsForTests();
};

const recordRoleChange = ({
  target,
  previousRole,
  nextRole,
  actor,
  req,
}) => {
  const previous = sanitizeLabel(previousRole, 'none');
  const next = sanitizeLabel(nextRole, 'none');
  const privilegedRoles = new Set(['admin', 'counsellor']);
  if (!privilegedRoles.has(previous) && !privilegedRoles.has(next)) return null;

  const category = previous === 'admin' || next === 'admin'
    ? 'admin_role'
    : 'privileged_role';
  const event = category === 'admin_role'
    ? 'admin_role_changed'
    : 'privileged_role_changed';
  const action = previous === 'none'
    ? 'assigned'
    : privilegedRoles.has(previous) && !privilegedRoles.has(next)
      ? 'removed'
      : 'changed';
  const entry = recordSecurityEvent(event, {
    req,
    user: actor,
    outcome: 'success',
    details: {
      action,
      actorRole: actor?.role || 'system',
      operationalRole: next,
      targetId: target,
    },
  });
  recordPrivilegeChange({ category, outcome: 'success' });
  return entry;
};

module.exports = {
  recordRoleChange,
  recordSecurityEvent,
  renderSecurityMetrics,
  resetSecurityMetricsForTests,
  sanitizeDetails,
  securityAuditTrail,
  verifyAuditChain,
  verifyDurableSecurityAuditChain,
};
