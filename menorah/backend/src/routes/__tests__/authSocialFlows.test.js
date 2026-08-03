const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

const mockFindOne = jest.fn();
const mockFindById = jest.fn();
const mockCreate = jest.fn();
const mockUpdateOne = jest.fn();
const mockAxiosGet = jest.fn();
const mockStartSession = jest.fn();
const mockVerifyAppleIdentityToken = jest.fn();
const mockExchangeAppleAuthorizationCode = jest.fn();
let mockAuthenticatedUser;

jest.mock('../../models/User', () => ({
  findOne: (...args) => mockFindOne(...args),
  findById: (...args) => mockFindById(...args),
  create: (...args) => mockCreate(...args),
  findOneAndUpdate: jest.fn(),
  updateOne: (...args) => mockUpdateOne(...args),
}));

jest.mock('mongoose', () => ({
  startSession: (...args) => mockStartSession(...args),
}));

jest.mock('../../services/appleSignInService', () => ({
  verifyAppleIdentityToken: (...args) => mockVerifyAppleIdentityToken(...args),
  exchangeAppleAuthorizationCode: (...args) => mockExchangeAppleAuthorizationCode(...args),
}));

jest.mock('../../utils/appleRefreshTokenEncryption', () => ({
  encryptAppleRefreshToken: jest.fn(() => 'encrypted-apple-refresh-token'),
}));

jest.mock('axios', () => ({
  get: (...args) => mockAxiosGet(...args),
}));

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = mockAuthenticatedUser;
    next();
  },
}));

jest.mock('../../utils/authTokens', () => ({
  signUserToken: jest.fn(() => 'signed-user-token'),
}));

jest.mock('jsonwebtoken', () => {
  const actual = jest.requireActual('jsonwebtoken');
  return {
    ...actual,
    decode: jest.fn(() => ({ header: { kid: 'apple-test-key' } })),
    verify: jest.fn((_token, _getKey, _options, callback) => callback(null, { sub: 'apple-unknown-subject' })),
  };
});

const authRouter = require('../auth');

const objectId = (value) => ({ toString: () => value });
const selectable = (value) => {
  const resolved = Promise.resolve(value);
  return {
    select: jest.fn(() => resolved),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
  };
};

const makeLinkUser = (overrides = {}) => {
  const user = {
    _id: objectId('64f000000000000000000021'),
    firstName: 'Asha',
    lastName: 'User',
    email: 'asha@example.com',
    phone: '+15551234567',
    role: 'user',
    isActive: true,
    isEmailVerified: true,
    isPhoneVerified: false,
    profileCompleted: true,
    socialAuth: {},
    comparePassword: jest.fn(async () => true),
    save: jest.fn(async () => undefined),
    ...overrides,
  };
  user.get = jest.fn((path) => path.split('.').reduce((value, key) => value?.[key], user));
  user.set = jest.fn((path, value) => {
    const keys = path.split('.');
    let target = user;
    keys.slice(0, -1).forEach((key) => {
      target[key] ||= {};
      target = target[key];
    });
    target[keys[keys.length - 1]] = value;
  });
  return user;
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
};

describe('social authentication contracts', () => {
  const originalEnv = process.env;
  let createPublicKeySpy;
  let consoleErrorSpy;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOOGLE_CLIENT_ID: 'google-test-client',
      APPLE_IOS_BUNDLE_ID: 'com.menorah.test',
      APPLE_SIGN_IN_ENABLED: 'true',
    };
    mockFindOne.mockReset();
    mockFindById.mockReset();
    mockCreate.mockReset();
    mockUpdateOne.mockReset();
    mockAxiosGet.mockReset();
    mockStartSession.mockReset();
    mockVerifyAppleIdentityToken.mockReset();
    mockExchangeAppleAuthorizationCode.mockReset();
    mockStartSession.mockResolvedValue({
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn(async () => undefined),
    });
    mockVerifyAppleIdentityToken.mockResolvedValue({
      sub: 'apple-unknown-subject',
      aud: 'com.menorah.test',
    });
    mockExchangeAppleAuthorizationCode.mockResolvedValue({
      refreshToken: 'apple-refresh-token',
    });
    mockUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mockAuthenticatedUser = makeLinkUser();
    createPublicKeySpy = jest.spyOn(crypto, 'createPublicKey').mockReturnValue({});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    createPublicKeySpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const mockGoogleIdentity = (overrides = {}) => {
    mockAxiosGet.mockResolvedValue({
      data: {
        sub: 'google-subject',
        email: 'google@example.com',
        aud: 'google-test-client',
        email_verified: 'true',
        ...overrides,
      },
    });
  };

  test('an unknown Google subject with signin intent never creates an account', async () => {
    mockGoogleIdentity();
    mockFindOne.mockReturnValue(selectable(null));

    const res = await request(buildApp())
      .post('/api/auth/google')
      .send({ credential: 'g'.repeat(32), intent: 'signin' })
      .expect(404);

    expect(res.body).toMatchObject({
      success: false,
      code: 'ACCOUNT_NOT_FOUND',
      data: { nextIntent: 'signup' },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('social signup does not merge with an existing password-email account', async () => {
    mockGoogleIdentity();
    mockFindOne
      .mockReturnValueOnce(selectable(null))
      .mockReturnValueOnce(selectable({ _id: objectId('64f000000000000000000099') }));

    const res = await request(buildApp())
      .post('/api/auth/google')
      .send({ credential: 'g'.repeat(32), intent: 'signup' })
      .expect(409);

    expect(res.body).toMatchObject({ success: false, code: 'SOCIAL_ACCOUNT_LINK_REQUIRED' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('an existing but unverified linked social account receives no session', async () => {
    mockGoogleIdentity();
    const unverified = makeLinkUser({
      isEmailVerified: false,
      socialAuth: { googleSub: 'google-subject' },
    });
    mockFindOne.mockReturnValue(selectable(unverified));

    const res = await request(buildApp())
      .post('/api/auth/google')
      .send({ credential: 'g'.repeat(32), intent: 'signin' })
      .expect(403);

    expect(res.body).toMatchObject({
      success: false,
      code: 'EMAIL_VERIFICATION_REQUIRED',
      data: { email: 'asha@example.com' },
    });
    expect(res.body.data?.token).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('an unsigned body email cannot create an Apple account for an unknown subject', async () => {
    mockAxiosGet.mockResolvedValue({
      data: { keys: [{ kid: 'apple-test-key', kty: 'RSA', n: 'not-used', e: 'AQAB' }] },
    });
    mockFindOne.mockReturnValue(selectable(null));

    await request(buildApp())
      .post('/api/auth/apple')
      .send({
        identityToken: 'a'.repeat(32),
        authorizationCode: 'c'.repeat(32),
        intent: 'signup',
        email: 'victim@example.com',
      })
      .expect(409);

    expect(mockFindOne).toHaveBeenCalledWith({ 'socialAuth.appleSub': 'apple-unknown-subject' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('an existing Apple subject can repeat sign in when Apple omits profile fields', async () => {
    mockAxiosGet.mockResolvedValue({
      data: { keys: [{ kid: 'apple-test-key', kty: 'RSA', n: 'not-used', e: 'AQAB' }] },
    });
    const linkedAppleUser = makeLinkUser({
      socialAuth: { appleSub: 'apple-unknown-subject' },
    });
    mockFindOne.mockReturnValue(selectable(linkedAppleUser));

    const res = await request(buildApp())
      .post('/api/auth/apple')
      .send({
        identityToken: 'a'.repeat(32),
        authorizationCode: 'c'.repeat(32),
        intent: 'signin',
        email: null,
        fullName: null,
      })
      .expect(200);

    expect(res.body).toMatchObject({
      success: true,
      data: {
        token: 'signed-user-token',
        user: { id: '64f000000000000000000021' },
        isNewUser: false,
      },
    });
    expect(mockFindOne).toHaveBeenCalledWith({ 'socialAuth.appleSub': 'apple-unknown-subject' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('social linking rejects a provider subject already owned by another account', async () => {
    const user = makeLinkUser();
    mockAuthenticatedUser = user;
    mockGoogleIdentity({ sub: 'google-linked-elsewhere' });
    mockFindById.mockReturnValue(selectable(user));
    mockFindOne.mockReturnValue(selectable({ _id: objectId('64f000000000000000000099') }));

    const res = await request(buildApp())
      .post('/api/auth/social/link')
      .send({
        provider: 'google',
        providerToken: 'g'.repeat(32),
        currentPassword: 'correct-password',
      })
      .expect(409);

    expect(res.body).toMatchObject({ success: false, code: 'SOCIAL_IDENTITY_ALREADY_LINKED' });
    expect(user.set).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
  });

  test('social linking reports an incorrect current password without changing links', async () => {
    const user = makeLinkUser({ comparePassword: jest.fn(async () => false) });
    mockAuthenticatedUser = user;
    mockGoogleIdentity();
    mockFindById.mockReturnValue(selectable(user));

    const res = await request(buildApp())
      .post('/api/auth/social/link')
      .send({
        provider: 'google',
        providerToken: 'g'.repeat(32),
        currentPassword: 'wrong-password',
      })
      .expect(400);

    expect(res.body).toMatchObject({ success: false, code: 'CURRENT_PASSWORD_INCORRECT' });
    expect(user.set).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
  });

  test('the user-facing auth router never verifies or resends for an admin account', async () => {
    mockFindOne.mockReturnValue(selectable(null));

    const verifyResponse = await request(buildApp())
      .post('/api/auth/verify-email')
      .send({ email: 'admin@example.com', code: '123456' })
      .expect(400);

    expect(verifyResponse.body.data?.token).toBeUndefined();
    expect(mockFindOne).toHaveBeenCalledWith({
      email: 'admin@example.com',
      isEmailVerified: false,
      role: { $ne: 'admin' },
    });

    mockFindOne.mockClear();
    await request(buildApp())
      .post('/api/auth/resend-email-verification')
      .send({ email: 'admin@example.com' })
      .expect(200);

    expect(mockFindOne).toHaveBeenCalledWith({
      email: 'admin@example.com',
      isEmailVerified: false,
      role: { $ne: 'admin' },
    });
  });
});
