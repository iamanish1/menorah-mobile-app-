const jwt = require('jsonwebtoken');

const DEFAULT_ISSUER = 'menorah-api';
const USER_AUDIENCE = 'menorah-users';
const ADMIN_AUDIENCE = 'menorah-admin';
const USER_PURPOSE = 'access';
const ADMIN_PURPOSE = 'admin';
const USER_TOKEN_ROLES = new Set(['user', 'counsellor']);
const ADMIN_TOKEN_ROLES = new Set(['admin']);
const TOKEN_VERIFICATION_ERROR_NAMES = new Set([
  'JsonWebTokenError',
  'NotBeforeError',
  'TokenExpiredError',
]);

const getIssuer = () => process.env.JWT_ISSUER || DEFAULT_ISSUER;

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
};

const invalidTokenClaim = (message) => {
  const error = new Error(message);
  error.name = 'JsonWebTokenError';
  return error;
};

const getSigningIdentity = (user, { allowedRoles, defaultRole = null }) => {
  const userId = user?._id?.toString?.() || user?.id?.toString?.();
  const role = user?.role || defaultRole;
  const suppliedSessionVersion = user?.sessionVersion;
  const sessionVersion = suppliedSessionVersion === undefined || suppliedSessionVersion === null
    ? 0
    : suppliedSessionVersion;

  if (!userId) throw new TypeError('A user ID is required to sign an access token');
  if (!allowedRoles.has(role)) throw new TypeError('The account role is not valid for this token type');
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0) {
    throw new TypeError('A non-negative session version is required to sign an access token');
  }

  return { userId, role, sessionVersion };
};

const buildTokenPayload = (
  user,
  {
    allowedRoles,
    defaultRole = null,
    purpose,
    mfaAuthenticatedAt = null,
  }
) => ({
  ...getSigningIdentity(user, { allowedRoles, defaultRole }),
  purpose,
  ...(mfaAuthenticatedAt ? { mfaAuthenticatedAt } : {}),
});

const signUserToken = (user) => jwt.sign(
  buildTokenPayload(user, {
    allowedRoles: USER_TOKEN_ROLES,
    defaultRole: 'user',
    purpose: USER_PURPOSE,
  }),
  getSecret(),
  {
    algorithm: 'HS256',
    issuer: getIssuer(),
    audience: USER_AUDIENCE,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  }
);

const signAdminToken = (user, { mfaAuthenticatedAt = null } = {}) => jwt.sign(
  buildTokenPayload(user, {
    allowedRoles: ADMIN_TOKEN_ROLES,
    purpose: ADMIN_PURPOSE,
    mfaAuthenticatedAt,
  }),
  getSecret(),
  {
    algorithm: 'HS256',
    issuer: getIssuer(),
    audience: ADMIN_AUDIENCE,
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '30m',
  }
);

const verifyToken = (token, { allowedRoles, audience, purpose }) => {
  const decoded = jwt.verify(token, getSecret(), {
    algorithms: ['HS256'],
    issuer: getIssuer(),
    audience,
  });

  if (decoded.purpose !== purpose) {
    throw invalidTokenClaim('Invalid token purpose');
  }
  if (!allowedRoles.has(decoded.role)) throw invalidTokenClaim('Invalid token role');
  if (typeof decoded.userId !== 'string' || !decoded.userId.trim()) {
    throw invalidTokenClaim('Invalid token subject');
  }
  if (!Number.isSafeInteger(decoded.sessionVersion) || decoded.sessionVersion < 0) {
    throw invalidTokenClaim('Invalid token session version');
  }

  return decoded;
};

const verifyUserToken = (token) => verifyToken(token, {
  allowedRoles: USER_TOKEN_ROLES,
  audience: USER_AUDIENCE,
  purpose: USER_PURPOSE,
});

const verifyAdminToken = (token) => verifyToken(token, {
  allowedRoles: ADMIN_TOKEN_ROLES,
  audience: ADMIN_AUDIENCE,
  purpose: ADMIN_PURPOSE,
});

const isTokenVerificationError = (error) =>
  TOKEN_VERIFICATION_ERROR_NAMES.has(error?.name);

// There is deliberately no refresh-token purpose or endpoint. Both verifiers
// accept only finite-lived access tokens; an expired token requires a new login.
const verifyAnyAccessToken = (token) => {
  let lastVerificationError;
  for (const verifier of [verifyUserToken, verifyAdminToken]) {
    try {
      return verifier(token);
    } catch (error) {
      if (!isTokenVerificationError(error)) throw error;
      lastVerificationError = error;
    }
  }
  throw lastVerificationError || invalidTokenClaim('Invalid access token');
};

module.exports = {
  USER_AUDIENCE,
  ADMIN_AUDIENCE,
  USER_PURPOSE,
  ADMIN_PURPOSE,
  signUserToken,
  signAdminToken,
  verifyUserToken,
  verifyAdminToken,
  verifyAnyAccessToken,
  isTokenVerificationError,
};
