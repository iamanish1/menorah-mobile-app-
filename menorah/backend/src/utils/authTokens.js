const jwt = require('jsonwebtoken');

const DEFAULT_ISSUER = 'menorah-api';
const USER_AUDIENCE = 'menorah-users';
const ADMIN_AUDIENCE = 'menorah-admin';
const USER_PURPOSE = 'access';
const ADMIN_PURPOSE = 'admin';

const getIssuer = () => process.env.JWT_ISSUER || DEFAULT_ISSUER;

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
};

const buildTokenPayload = (user, { audience, purpose, mfaAuthenticatedAt = null }) => ({
  userId: user._id?.toString?.() || user.id?.toString?.() || user.toString(),
  role: user.role || 'user',
  purpose,
  sessionVersion: user.sessionVersion || 0,
  ...(mfaAuthenticatedAt ? { mfaAuthenticatedAt } : {}),
});

const signUserToken = (user) => jwt.sign(
  buildTokenPayload(user, { audience: USER_AUDIENCE, purpose: USER_PURPOSE }),
  getSecret(),
  {
    algorithm: 'HS256',
    issuer: getIssuer(),
    audience: USER_AUDIENCE,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  }
);

const signAdminToken = (user, { mfaAuthenticatedAt = null } = {}) => jwt.sign(
  buildTokenPayload(user, { audience: ADMIN_AUDIENCE, purpose: ADMIN_PURPOSE, mfaAuthenticatedAt }),
  getSecret(),
  {
    algorithm: 'HS256',
    issuer: getIssuer(),
    audience: ADMIN_AUDIENCE,
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '30m',
  }
);

const verifyToken = (token, { audience, purpose }) => {
  const decoded = jwt.verify(token, getSecret(), {
    algorithms: ['HS256'],
    issuer: getIssuer(),
    audience,
  });

  if (decoded.purpose !== purpose) {
    const error = new Error('Invalid token purpose');
    error.name = 'JsonWebTokenError';
    throw error;
  }

  return decoded;
};

const verifyUserToken = (token) => verifyToken(token, {
  audience: USER_AUDIENCE,
  purpose: USER_PURPOSE,
});

const verifyAdminToken = (token) => verifyToken(token, {
  audience: ADMIN_AUDIENCE,
  purpose: ADMIN_PURPOSE,
});

module.exports = {
  USER_AUDIENCE,
  ADMIN_AUDIENCE,
  USER_PURPOSE,
  ADMIN_PURPOSE,
  signUserToken,
  signAdminToken,
  verifyUserToken,
  verifyAdminToken,
};
