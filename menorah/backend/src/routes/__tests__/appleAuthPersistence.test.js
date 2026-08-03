const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');

const mockFindOne = jest.fn();
const mockCreate = jest.fn();
const mockUpdateOne = jest.fn();
const mockVerifyAppleIdentityToken = jest.fn();
const mockExchangeAppleAuthorizationCode = jest.fn();
const mockEncryptAppleRefreshToken = jest.fn();

jest.mock('../../models/User', () => ({
  findOne: (...args) => mockFindOne(...args),
  create: (...args) => mockCreate(...args),
  updateOne: (...args) => mockUpdateOne(...args),
}));

jest.mock('../../services/appleSignInService', () => ({
  verifyAppleIdentityToken: (...args) => mockVerifyAppleIdentityToken(...args),
  exchangeAppleAuthorizationCode: (...args) => mockExchangeAppleAuthorizationCode(...args),
}));

jest.mock('../../utils/appleRefreshTokenEncryption', () => ({
  encryptAppleRefreshToken: (...args) => mockEncryptAppleRefreshToken(...args),
}));

const authRouter = require('../auth');

const USER_ID = new mongoose.Types.ObjectId('64f000000000000000000001');
const APPLE_SUBJECT = '001234.abcdef1234567890.1234';
const CLIENT_ID = 'com.menorah.health.app';
const AUTHORIZATION_CODE = 'authorization-code-at-least-twenty-characters';
const IDENTITY_TOKEN = 'identity-token-at-least-twenty-characters';

const queryResult = (value) => ({
  select: jest.fn().mockReturnThis(),
  session: jest.fn().mockResolvedValue(value),
});

const userDocument = () => ({
  _id: USER_ID,
  email: 'apple-user@example.test',
  firstName: 'Apple',
  lastName: 'User',
  isActive: true,
  isEmailVerified: true,
  passwordAuthEnabled: false,
  role: 'user',
  sessionVersion: 0,
  socialAuth: { appleSub: APPLE_SUBJECT },
  toObject() {
    return { ...this };
  },
});

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
};

describe('Apple auth credential persistence', () => {
  let startSessionSpy;
  let consoleErrorSpy;
  let session;

  beforeEach(() => {
    process.env.APPLE_SIGN_IN_ENABLED = 'true';
    process.env.JWT_SECRET = 'j'.repeat(64);
    process.env.JWT_EXPIRES_IN = '1h';

    session = {
      withTransaction: jest.fn(async (work) => work()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    startSessionSpy = jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFindOne.mockReset();
    mockCreate.mockReset();
    mockUpdateOne.mockReset();
    mockVerifyAppleIdentityToken.mockReset().mockResolvedValue({
      sub: APPLE_SUBJECT,
      aud: CLIENT_ID,
      email: 'apple-user@example.test',
      email_verified: 'true',
    });
    mockExchangeAppleAuthorizationCode.mockReset().mockResolvedValue({
      refreshToken: 'provider-refresh-token',
      accessToken: 'provider-access-token',
      clientId: CLIENT_ID,
    });
    mockEncryptAppleRefreshToken.mockReset().mockReturnValue('v1:encrypted-refresh-token');
  });

  afterEach(() => {
    startSessionSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    delete process.env.APPLE_SIGN_IN_ENABLED;
  });

  test('persists an existing user refresh token inside the social-auth transaction', async () => {
    const user = userDocument();
    const socialQuery = queryResult(user);
    mockFindOne.mockReturnValueOnce(socialQuery);
    mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const response = await request(buildApp())
      .post('/api/auth/apple')
      .send({
        identityToken: IDENTITY_TOKEN,
        authorizationCode: AUTHORIZATION_CODE,
      })
      .expect(200);

    expect(startSessionSpy).toHaveBeenCalledTimes(1);
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(socialQuery.session).toHaveBeenCalledWith(session);
    expect(mockEncryptAppleRefreshToken).toHaveBeenCalledWith(
      'provider-refresh-token',
      { userId: USER_ID, clientId: CLIENT_ID }
    );
    expect(mockExchangeAppleAuthorizationCode).toHaveBeenCalledWith({
      authorizationCode: AUTHORIZATION_CODE,
      clientId: CLIENT_ID,
      expectedSubject: APPLE_SUBJECT,
    });
    expect(mockUpdateOne).toHaveBeenCalledWith(
      {
        _id: USER_ID,
        isActive: true,
        'socialAuth.appleSub': APPLE_SUBJECT,
      },
      {
        $set: {
          'socialAuth.appleRefreshTokenEncrypted': 'v1:encrypted-refresh-token',
          'socialAuth.appleClientId': CLIENT_ID,
        },
      },
      { session }
    );
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        isNewUser: false,
        user: { id: USER_ID.toString() },
        token: expect.any(String),
      },
    });
  });

  test('fails without issuing a session if atomic credential persistence does not match', async () => {
    const user = userDocument();
    mockFindOne.mockReturnValueOnce(queryResult(user));
    mockUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const response = await request(buildApp())
      .post('/api/auth/apple')
      .send({
        identityToken: IDENTITY_TOKEN,
        authorizationCode: AUTHORIZATION_CODE,
      })
      .expect(500);

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual({
      success: false,
      message: 'Apple sign-in is temporarily unavailable.',
    });
    expect(response.body).not.toHaveProperty('data.token');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Apple auth error code:',
      'APPLE_AUTH_UNEXPECTED'
    );
  });
});
