const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_TOKEN_ENDPOINT = `${APPLE_ISSUER}/auth/token`;
const APPLE_REVOKE_ENDPOINT = `${APPLE_ISSUER}/auth/revoke`;
const APPLE_KEYS_ENDPOINT = `${APPLE_ISSUER}/auth/keys`;

const makeAppleError = (message, appleErrorCode, statusCode, publicMessage) => Object.assign(
  new Error(message),
  { appleErrorCode, statusCode, publicMessage }
);

const tagAppleError = (error, appleErrorCode, statusCode, publicMessage) => Object.assign(
  error instanceof Error ? error : new Error('Apple request failed'),
  { appleErrorCode, statusCode, publicMessage }
);

const configurationError = (message) => makeAppleError(
  message,
  'APPLE_CONFIGURATION_ERROR',
  503,
  'Apple sign-in is temporarily unavailable.'
);

const invalidCredentialError = (message) => makeAppleError(
  message,
  'APPLE_CREDENTIAL_INVALID',
  401,
  'Apple verification failed. Please try again.'
);

const providerUnavailableError = (error) => tagAppleError(
  error,
  'APPLE_PROVIDER_UNAVAILABLE',
  503,
  'Apple verification is temporarily unavailable.'
);

const getAppleAudiences = () => [
  process.env.APPLE_IOS_BUNDLE_ID,
  process.env.APPLE_WEB_SERVICE_ID,
]
  .map((value) => String(value || '').trim())
  .filter(Boolean);

const getAppleSigningKey = async (kid, httpClient = axios) => {
  let response;
  try {
    response = await httpClient.get(APPLE_KEYS_ENDPOINT, { timeout: 8000 });
  } catch (error) {
    throw providerUnavailableError(error);
  }
  const key = response.data?.keys?.find((candidate) => candidate.kid === kid);
  if (!key) throw invalidCredentialError('Apple signing key was not found');
  try {
    return crypto.createPublicKey({ key, format: 'jwk' });
  } catch (error) {
    throw providerUnavailableError(error);
  }
};

const verifyAppleIdentityToken = async (identityToken, { httpClient = axios } = {}) => {
  const audiences = getAppleAudiences();
  if (audiences.length === 0) {
    throw configurationError('Apple Sign in is not configured');
  }

  const decodedHeader = jwt.decode(identityToken, { complete: true })?.header;
  if (!decodedHeader?.kid) {
    throw invalidCredentialError('Apple identity token is missing key id');
  }

  const key = await getAppleSigningKey(decodedHeader.kid, httpClient);
  try {
    const identity = jwt.verify(identityToken, key, {
      algorithms: ['RS256'],
      issuer: APPLE_ISSUER,
      audience: audiences,
    });
    if (identity.email && String(identity.email_verified) !== 'true') {
      throw invalidCredentialError('Apple identity email is not verified');
    }
    return identity;
  } catch (error) {
    if (error.appleErrorCode) throw error;
    throw tagAppleError(
      error,
      'APPLE_CREDENTIAL_INVALID',
      401,
      'Apple verification failed. Please try again.'
    );
  }
};

const getApplePrivateKey = () => {
  const raw = String(process.env.APPLE_PRIVATE_KEY || '').trim();
  const normalized = raw.replace(/\\n/g, '\n');
  if (!normalized.includes('BEGIN PRIVATE KEY')) {
    throw configurationError('Apple private key is not configured');
  }
  return normalized;
};

const createAppleClientSecret = (clientId) => {
  const normalizedClientId = String(clientId || '').trim();
  if (!getAppleAudiences().includes(normalizedClientId)) {
    throw configurationError('Apple client identifier is not allowed');
  }

  const teamId = String(process.env.APPLE_TEAM_ID || '').trim();
  const keyId = String(process.env.APPLE_KEY_ID || '').trim();
  if (!teamId || !keyId) throw configurationError('Apple signing credentials are not configured');

  return jwt.sign({}, getApplePrivateKey(), {
    algorithm: 'ES256',
    keyid: keyId,
    issuer: teamId,
    subject: normalizedClientId,
    audience: APPLE_ISSUER,
    expiresIn: '5m',
  });
};

const postAppleForm = async (url, form, httpClient = axios) => httpClient.post(
  url,
  new URLSearchParams(form).toString(),
  {
    timeout: 8000,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  }
);

const exchangeAppleAuthorizationCode = async ({
  authorizationCode,
  clientId,
  expectedSubject,
  expectedNonce,
  httpClient = axios,
}) => {
  const normalizedCode = String(authorizationCode || '').trim();
  if (normalizedCode.length < 20 || normalizedCode.length > 4096) {
    throw invalidCredentialError('Apple authorization code is invalid');
  }

  let response;
  try {
    response = await postAppleForm(APPLE_TOKEN_ENDPOINT, {
      client_id: clientId,
      client_secret: createAppleClientSecret(clientId),
      code: normalizedCode,
      grant_type: 'authorization_code',
    }, httpClient);
  } catch (error) {
    if (['invalid_grant', 'invalid_request'].includes(error?.response?.data?.error)) {
      throw tagAppleError(
        error,
        'APPLE_CREDENTIAL_INVALID',
        401,
        'Apple verification failed. Please try again.'
      );
    }
    throw providerUnavailableError(error);
  }
  const tokenResponse = response.data || {};
  if (!tokenResponse.refresh_token || !tokenResponse.id_token) {
    throw providerUnavailableError(
      new Error('Apple token exchange did not return required tokens')
    );
  }

  const exchangedIdentity = await verifyAppleIdentityToken(tokenResponse.id_token, { httpClient });
  if (
    exchangedIdentity.sub !== expectedSubject
    || exchangedIdentity.aud !== clientId
    || (expectedNonce && exchangedIdentity.nonce !== expectedNonce)
  ) {
    throw invalidCredentialError(
      'Apple token exchange identity did not match the signed-in user'
    );
  }

  return {
    refreshToken: tokenResponse.refresh_token,
    accessToken: tokenResponse.access_token || null,
    clientId,
  };
};

const revokeAppleToken = async ({ token, clientId, httpClient = axios }) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) throw new Error('Apple revocation token is missing');

  const response = await postAppleForm(APPLE_REVOKE_ENDPOINT, {
    client_id: clientId,
    client_secret: createAppleClientSecret(clientId),
    token: normalizedToken,
    token_type_hint: 'refresh_token',
  }, httpClient);
  if (response.status !== 200) throw new Error('Apple token revocation failed');
};

module.exports = {
  APPLE_REVOKE_ENDPOINT,
  APPLE_TOKEN_ENDPOINT,
  createAppleClientSecret,
  exchangeAppleAuthorizationCode,
  getAppleAudiences,
  revokeAppleToken,
  verifyAppleIdentityToken,
};
