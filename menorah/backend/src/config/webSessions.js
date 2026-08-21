const ROLE_COOKIE_NAMES = Object.freeze({
  user: '__Host-menorah-user',
  counsellor: '__Host-menorah-counsellor',
  admin: '__Host-menorah-admin',
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const VALID_ROLES = new Set(Object.keys(ROLE_COOKIE_NAMES));
const SESSION_TRANSPORT_HEADER = 'x-auth-transport';
const { recordSecurityEvent } = require('../utils/securityAudit');

const DEFAULT_USER_SESSION_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_ADMIN_SESSION_SECONDS = 30 * 60;

const parseDurationSeconds = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = String(value).trim().toLowerCase();
  const match = raw.match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!match) return fallback;

  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;

  const unit = match[2] || 's';
  if (unit === 'ms') return Math.max(1, Math.floor(amount / 1000));
  if (unit === 'm') return amount * 60;
  if (unit === 'h') return amount * 60 * 60;
  if (unit === 'd') return amount * 24 * 60 * 60;
  return amount;
};

const normalizeOrigin = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin;
  } catch {
    return '';
  }
};

const roleFromValue = (value) => {
  const role = String(value || '').trim().toLowerCase();
  return VALID_ROLES.has(role) ? role : '';
};

const parseOriginRoleEntry = (entry) => {
  const raw = String(entry || '').trim();
  if (!raw) return null;

  const separator = raw.includes('=') ? '=' : raw.includes('|') ? '|' : null;
  if (separator) {
    const index = raw.lastIndexOf(separator);
    const origin = normalizeOrigin(raw.slice(0, index));
    const role = roleFromValue(raw.slice(index + 1));
    return origin && role ? { origin, role } : null;
  }

  const legacyMatch = raw.match(/^(.*):(user|counsellor|admin)$/i);
  if (legacyMatch) {
    const origin = normalizeOrigin(legacyMatch[1]);
    const role = roleFromValue(legacyMatch[2]);
    return origin && role ? { origin, role } : null;
  }

  return null;
};

const appendOrigin = (map, origin, role) => {
  const normalized = normalizeOrigin(origin);
  const normalizedRole = roleFromValue(role);
  if (normalized && normalizedRole) map.set(normalized, normalizedRole);
};

const addDefaultDevelopmentOrigins = (map) => {
  [
    ['http://localhost:3000', 'user'],
    ['http://localhost:3001', 'counsellor'],
    ['http://localhost:3002', 'user'],
    ['http://localhost:3003', 'admin'],
    ['http://127.0.0.1:3000', 'user'],
    ['http://127.0.0.1:3001', 'counsellor'],
    ['http://127.0.0.1:3002', 'user'],
    ['http://127.0.0.1:3003', 'admin'],
    ['https://www.localhost:8443', 'user'],
    ['https://app.localhost:8443', 'user'],
    ['https://counsellor.localhost:8443', 'counsellor'],
    ['https://admin.localhost:8443', 'admin'],
  ].forEach(([origin, role]) => appendOrigin(map, origin, role));
};

const getTrustedWebSessionOrigins = () => {
  const origins = new Map();
  String(process.env.WEB_SESSION_ORIGINS || '')
    .split(',')
    .map(parseOriginRoleEntry)
    .filter(Boolean)
    .forEach(({ origin, role }) => origins.set(origin, role));

  if (process.env.NODE_ENV !== 'production') {
    addDefaultDevelopmentOrigins(origins);
  }

  return origins;
};

const getTrustedWebOrigins = () => Array.from(getTrustedWebSessionOrigins().keys());

const getOriginFromReferer = (referer) => {
  try {
    return normalizeOrigin(new URL(String(referer || '')).origin);
  } catch {
    return '';
  }
};

const getRequestOrigin = (req) => {
  const origin = normalizeOrigin(req.get?.('origin') || req.headers?.origin);
  if (origin) return origin;
  return getOriginFromReferer(req.get?.('referer') || req.headers?.referer);
};

const getWebSessionForRequest = (req) => {
  const origin = getRequestOrigin(req);
  if (!origin) return null;

  const role = getTrustedWebSessionOrigins().get(origin);
  if (!role) return null;

  return {
    origin,
    role,
    cookieName: ROLE_COOKIE_NAMES[role],
  };
};

const parseCookies = (cookieHeader = '') => {
  const cookies = {};
  String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index <= 0) return;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1);
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    });
  return cookies;
};

const getCookieToken = (req, cookieName) => parseCookies(req.headers?.cookie)[cookieName] || null;

const getSessionCookieRoles = (req) => {
  const cookies = parseCookies(req.headers?.cookie);
  return Object.entries(ROLE_COOKIE_NAMES)
    .filter(([, cookieName]) => Boolean(cookies[cookieName]))
    .map(([role]) => role);
};

const getSessionMaxAgeSeconds = (role) => {
  if (role === 'admin') {
    return parseDurationSeconds(process.env.ADMIN_JWT_EXPIRES_IN, DEFAULT_ADMIN_SESSION_SECONDS);
  }
  return parseDurationSeconds(process.env.JWT_EXPIRES_IN, DEFAULT_USER_SESSION_SECONDS);
};

const buildSessionCookieOptions = (role) => {
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: getSessionMaxAgeSeconds(role) * 1000,
  };

  return options;
};

const isCookieTransportRequested = (req) => {
  const bodyTransport = String(req.body?.transport || '').trim().toLowerCase();
  const headerTransport = String(req.get?.(SESSION_TRANSPORT_HEADER) || req.headers?.[SESSION_TRANSPORT_HEADER] || '')
    .trim()
    .toLowerCase();
  return bodyTransport === 'cookie' || headerTransport === 'cookie';
};

const setSessionCookieForRequest = (req, res, { role, token }) => {
  const session = getWebSessionForRequest(req);
  if (!session) {
    return { ok: false, status: 403, message: 'Browser session origin is not trusted.' };
  }

  if (session.role !== role) {
    return { ok: false, status: 403, message: 'Browser session origin is not allowed for this account.' };
  }

  res.cookie(session.cookieName, token, buildSessionCookieOptions(role));
  res.set('Cache-Control', 'no-store');
  return { ok: true, session };
};

const clearSessionCookie = (res, role) => {
  if (!ROLE_COOKIE_NAMES[role]) return;

  const options = buildSessionCookieOptions(role);
  delete options.maxAge;
  res.clearCookie(ROLE_COOKIE_NAMES[role], options);
  res.set('Cache-Control', 'no-store');
};

const clearMappedSessionCookie = (req, res) => {
  const session = getWebSessionForRequest(req);
  if (session) clearSessionCookie(res, session.role);
};

const isWebhookPath = (path = '') => (
  path === '/api/video/livekit-webhook'
  || path === '/api/payments/razorpay-webhook'
  || path === '/api/payouts/webhook'
  || path.startsWith('/api/payouts/webhook/')
);

const shouldValidateCsrf = (req) => {
  if (SAFE_METHODS.has(String(req.method || '').toUpperCase())) return false;
  if (isWebhookPath(req.path || req.originalUrl || '')) return false;

  return getSessionCookieRoles(req).length > 0;
};

const validateCsrfRequest = (req) => {
  if (!shouldValidateCsrf(req)) return { ok: true };

  const origin = normalizeOrigin(req.get?.('origin') || req.headers?.origin);
  const refererOrigin = getOriginFromReferer(req.get?.('referer') || req.headers?.referer);
  const suppliedOrigin = origin || refererOrigin;
  const expectedRole = getTrustedWebSessionOrigins().get(suppliedOrigin);
  const cookieRoles = getSessionCookieRoles(req);

  if (!suppliedOrigin || !expectedRole || !cookieRoles.includes(expectedRole)) {
    return { ok: false, status: 403, message: 'Cross-site request blocked.' };
  }

  return { ok: true };
};

const csrfProtection = (req, res, next) => {
  const result = validateCsrfRequest(req);
  if (!result.ok) {
    res.locals.securityAuthorizationLogged = true;
    recordSecurityEvent('csrf_blocked', {
      req,
      user: req.user,
      outcome: 'failure',
      statusCode: result.status,
    });
    return res.status(result.status).json({ success: false, message: result.message });
  }
  return next();
};

module.exports = {
  ROLE_COOKIE_NAMES,
  SESSION_TRANSPORT_HEADER,
  buildSessionCookieOptions,
  clearMappedSessionCookie,
  clearSessionCookie,
  csrfProtection,
  getCookieToken,
  getSessionCookieRoles,
  getRequestOrigin,
  getTrustedWebOrigins,
  getTrustedWebSessionOrigins,
  getWebSessionForRequest,
  isCookieTransportRequested,
  parseCookies,
  setSessionCookieForRequest,
  shouldValidateCsrf,
  validateCsrfRequest,
};
