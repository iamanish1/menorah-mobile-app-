const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
  APPLE_REVOKE_ENDPOINT,
  APPLE_TOKEN_ENDPOINT,
  createAppleClientSecret,
  exchangeAppleAuthorizationCode,
  revokeAppleToken,
} = require('../appleSignInService');

const APPLE_ISSUER = 'https://appleid.apple.com';
const IOS_CLIENT_ID = 'com.menorah.health';
const WEB_CLIENT_ID = 'com.menorah.health.web';
const APPLE_SUBJECT = '001234.abcdef1234567890.1234';
const AUTHORIZATION_CODE = 'authorization-code-at-least-twenty-characters';
const REFRESH_TOKEN = 'apple-refresh-token-that-must-never-be-logged';

describe('Apple Sign in service', () => {
  let originalEnvironment;
  let appleClientPrivateKey;
  let appleClientPublicKey;
  let appleIdentityPrivateKey;
  let appleIdentityPublicJwk;

  beforeAll(() => {
    const clientKeyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    appleClientPrivateKey = clientKeyPair.privateKey;
    appleClientPublicKey = clientKeyPair.publicKey;

    const identityKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    appleIdentityPrivateKey = identityKeyPair.privateKey;
    appleIdentityPublicJwk = {
      ...identityKeyPair.publicKey.export({ format: 'jwk' }),
      kid: 'apple-test-key',
      alg: 'RS256',
      use: 'sig',
    };
  });

  beforeEach(() => {
    originalEnvironment = {
      APPLE_IOS_BUNDLE_ID: process.env.APPLE_IOS_BUNDLE_ID,
      APPLE_WEB_SERVICE_ID: process.env.APPLE_WEB_SERVICE_ID,
      APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
      APPLE_KEY_ID: process.env.APPLE_KEY_ID,
      APPLE_PRIVATE_KEY: process.env.APPLE_PRIVATE_KEY,
    };
    process.env.APPLE_IOS_BUNDLE_ID = IOS_CLIENT_ID;
    process.env.APPLE_WEB_SERVICE_ID = WEB_CLIENT_ID;
    process.env.APPLE_TEAM_ID = 'MENORAHTEAM';
    process.env.APPLE_KEY_ID = 'APPLEKEY1';
    process.env.APPLE_PRIVATE_KEY = appleClientPrivateKey;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  const signIdentityToken = ({
    subject = APPLE_SUBJECT,
    audience = IOS_CLIENT_ID,
    nonce = 'deletion-reauthentication-nonce',
    email,
    emailVerified,
  } = {}) => jwt.sign(
    {
      nonce,
      ...(email ? { email, email_verified: emailVerified } : {}),
    },
    appleIdentityPrivateKey,
    {
      algorithm: 'RS256',
      keyid: 'apple-test-key',
      issuer: APPLE_ISSUER,
      audience,
      subject,
      expiresIn: '5m',
    }
  );

  const createHttpClient = ({
    identityToken = signIdentityToken(),
    status = 200,
  } = {}) => ({
    get: jest.fn().mockResolvedValue({
      data: { keys: [appleIdentityPublicJwk] },
    }),
    post: jest.fn().mockResolvedValue({
      status,
      data: {
        refresh_token: REFRESH_TOKEN,
        access_token: 'short-lived-access-token',
        id_token: identityToken,
      },
    }),
  });

  test('creates a five-minute ES256 client assertion bound to the allowed client', () => {
    const clientSecret = createAppleClientSecret(IOS_CLIENT_ID);
    const decoded = jwt.decode(clientSecret, { complete: true });

    expect(decoded.header).toMatchObject({
      alg: 'ES256',
      kid: 'APPLEKEY1',
    });
    expect(decoded.payload).toMatchObject({
      iss: 'MENORAHTEAM',
      sub: IOS_CLIENT_ID,
      aud: APPLE_ISSUER,
    });
    expect(decoded.payload.exp - decoded.payload.iat).toBe(5 * 60);
    expect(jwt.verify(clientSecret, appleClientPublicKey, {
      algorithms: ['ES256'],
      issuer: 'MENORAHTEAM',
      subject: IOS_CLIENT_ID,
      audience: APPLE_ISSUER,
    })).toMatchObject({ sub: IOS_CLIENT_ID });
    let configurationError;
    try {
      createAppleClientSecret('attacker-controlled-client');
    } catch (error) {
      configurationError = error;
    }
    expect(configurationError).toMatchObject({
      message: 'Apple client identifier is not allowed',
      appleErrorCode: 'APPLE_CONFIGURATION_ERROR',
      statusCode: 503,
      publicMessage: 'Apple sign-in is temporarily unavailable.',
    });
  });

  test('exchanges an authorization code as a bounded form request and cross-checks identity', async () => {
    const httpClient = createHttpClient();

    await expect(exchangeAppleAuthorizationCode({
      authorizationCode: AUTHORIZATION_CODE,
      clientId: IOS_CLIENT_ID,
      expectedSubject: APPLE_SUBJECT,
      expectedNonce: 'deletion-reauthentication-nonce',
      httpClient,
    })).resolves.toEqual({
      refreshToken: REFRESH_TOKEN,
      accessToken: 'short-lived-access-token',
      clientId: IOS_CLIENT_ID,
    });

    expect(httpClient.post).toHaveBeenCalledTimes(1);
    const [url, encodedForm, requestOptions] = httpClient.post.mock.calls[0];
    const form = new URLSearchParams(encodedForm);
    expect(url).toBe(APPLE_TOKEN_ENDPOINT);
    expect(requestOptions).toEqual({
      timeout: 8000,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(Object.fromEntries(form)).toMatchObject({
      client_id: IOS_CLIENT_ID,
      code: AUTHORIZATION_CODE,
      grant_type: 'authorization_code',
    });
    expect(form.get('client_secret')).toEqual(expect.any(String));
    expect(form.get('client_secret')).not.toContain(appleClientPrivateKey);
    expect(httpClient.get).toHaveBeenCalledWith(
      `${APPLE_ISSUER}/auth/keys`,
      { timeout: 8000 }
    );
  });

  test.each([
    ['subject', { subject: 'different-apple-subject' }, APPLE_SUBJECT, 'deletion-reauthentication-nonce'],
    ['client audience', { audience: WEB_CLIENT_ID }, APPLE_SUBJECT, 'deletion-reauthentication-nonce'],
    ['nonce', { nonce: 'different-nonce' }, APPLE_SUBJECT, 'deletion-reauthentication-nonce'],
  ])('rejects a token-exchange %s mismatch', async (
    _label,
    tokenOverrides,
    expectedSubject,
    expectedNonce
  ) => {
    const httpClient = createHttpClient({
      identityToken: signIdentityToken(tokenOverrides),
    });

    await expect(exchangeAppleAuthorizationCode({
      authorizationCode: AUTHORIZATION_CODE,
      clientId: IOS_CLIENT_ID,
      expectedSubject,
      expectedNonce,
      httpClient,
    })).rejects.toThrow(
      'Apple token exchange identity did not match the signed-in user'
    );
  });

  test('rejects an Apple identity that claims an unverified email', async () => {
    const httpClient = createHttpClient({
      identityToken: signIdentityToken({
        email: 'unverified@example.test',
        emailVerified: 'false',
      }),
    });

    await expect(exchangeAppleAuthorizationCode({
      authorizationCode: AUTHORIZATION_CODE,
      clientId: IOS_CLIENT_ID,
      expectedSubject: APPLE_SUBJECT,
      expectedNonce: 'deletion-reauthentication-nonce',
      httpClient,
    })).rejects.toMatchObject({
      appleErrorCode: 'APPLE_CREDENTIAL_INVALID',
      statusCode: 401,
    });
  });

  test('propagates provider timeouts without logging form credentials or tokens', async () => {
    const timeoutError = Object.assign(new Error('provider timed out'), {
      code: 'ECONNABORTED',
    });
    const httpClient = {
      post: jest.fn().mockRejectedValue(timeoutError),
    };
    const consoleSpies = ['error', 'warn', 'log'].map((method) => (
      jest.spyOn(console, method).mockImplementation(() => undefined)
    ));

    await expect(exchangeAppleAuthorizationCode({
      authorizationCode: AUTHORIZATION_CODE,
      clientId: IOS_CLIENT_ID,
      expectedSubject: APPLE_SUBJECT,
      httpClient,
    })).rejects.toBe(timeoutError);

    expect(timeoutError).toMatchObject({
      appleErrorCode: 'APPLE_PROVIDER_UNAVAILABLE',
      statusCode: 503,
      publicMessage: 'Apple verification is temporarily unavailable.',
    });
    expect(timeoutError.publicMessage).not.toContain(AUTHORIZATION_CODE);
    expect(timeoutError.publicMessage).not.toContain(REFRESH_TOKEN);
    expect(httpClient.post.mock.calls[0][2]).toMatchObject({ timeout: 8000 });
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  test('classifies provider invalid-grant responses as safe credential failures', async () => {
    const providerError = new Error('provider response includes request internals');
    providerError.response = {
      data: {
        error: 'invalid_grant',
        refresh_token: REFRESH_TOKEN,
      },
    };
    const httpClient = {
      post: jest.fn().mockRejectedValue(providerError),
    };

    await expect(exchangeAppleAuthorizationCode({
      authorizationCode: AUTHORIZATION_CODE,
      clientId: IOS_CLIENT_ID,
      expectedSubject: APPLE_SUBJECT,
      httpClient,
    })).rejects.toMatchObject({
      appleErrorCode: 'APPLE_CREDENTIAL_INVALID',
      statusCode: 401,
      publicMessage: 'Apple verification failed. Please try again.',
    });
    expect(providerError.publicMessage).not.toContain(REFRESH_TOKEN);
    expect(providerError.publicMessage).not.toContain(AUTHORIZATION_CODE);
  });

  test('revokes a refresh token with a bounded form request', async () => {
    const httpClient = {
      post: jest.fn().mockResolvedValue({ status: 200, data: {} }),
    };

    await expect(revokeAppleToken({
      token: REFRESH_TOKEN,
      clientId: IOS_CLIENT_ID,
      httpClient,
    })).resolves.toBeUndefined();

    const [url, encodedForm, requestOptions] = httpClient.post.mock.calls[0];
    const form = new URLSearchParams(encodedForm);
    expect(url).toBe(APPLE_REVOKE_ENDPOINT);
    expect(requestOptions).toMatchObject({ timeout: 8000 });
    expect(Object.fromEntries(form)).toMatchObject({
      client_id: IOS_CLIENT_ID,
      token: REFRESH_TOKEN,
      token_type_hint: 'refresh_token',
    });
  });

  test('fails closed on an empty token or a non-success revocation response', async () => {
    const httpClient = {
      post: jest.fn().mockResolvedValue({ status: 202, data: {} }),
    };

    await expect(revokeAppleToken({
      token: '',
      clientId: IOS_CLIENT_ID,
      httpClient,
    })).rejects.toThrow('Apple revocation token is missing');
    expect(httpClient.post).not.toHaveBeenCalled();

    await expect(revokeAppleToken({
      token: REFRESH_TOKEN,
      clientId: IOS_CLIENT_ID,
      httpClient,
    })).rejects.toThrow('Apple token revocation failed');
  });
});
