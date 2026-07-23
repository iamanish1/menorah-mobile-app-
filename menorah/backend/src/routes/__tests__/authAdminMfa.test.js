const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const mockFindOne = jest.fn();
const mockFindById = jest.fn();
const mockSendOTPEmail = jest.fn();
const mockRecordSecurityEvent = jest.fn();
let mockRedis;

jest.mock('../../models/User', () => ({
  findOne: (...args) => mockFindOne(...args),
  findById: (...args) => mockFindById(...args),
}));
jest.mock('../../config/redis', () => ({
  getRedisClient: () => mockRedis,
}));
jest.mock('../../utils/email', () => ({
  sendOTPEmail: (...args) => mockSendOTPEmail(...args),
}));
jest.mock('../../utils/securityAudit', () => ({
  recordSecurityEvent: (...args) => mockRecordSecurityEvent(...args),
}));

const authAdminRouter = require('../auth-admin');

const ADMIN_ID = '64f000000000000000000031';
const MAX_ADMIN_MFA_ATTEMPTS = 5;

class AtomicRedisDouble {
  constructor() {
    this.entries = new Map();
    this.wrongAttemptsApplied = 0;
    this.successfulConsumptions = 0;
    this.evalCalls = 0;
  }

  async setEx(key, ttlSeconds, value) {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key) {
    return this.entries.delete(key) ? 1 : 0;
  }

  async eval(_script, { keys, arguments: args }) {
    this.evalCalls += 1;

    const [key] = keys;
    const [submittedHash, rawMaxAttempts, rawMaxTtlMs] = args;
    const maxAttempts = Number(rawMaxAttempts);
    const maxTtlMs = Number(rawMaxTtlMs);
    const entry = this.entries.get(key);

    if (!entry || entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return [0];
    }

    let challenge;
    try {
      challenge = JSON.parse(entry.value);
    } catch {
      this.entries.delete(key);
      return [0];
    }

    if (
      typeof challenge.userId !== 'string' ||
      !challenge.userId ||
      typeof challenge.otp !== 'string' ||
      !challenge.otp ||
      !Number.isInteger(challenge.attempts) ||
      challenge.attempts < 0 ||
      challenge.attempts >= maxAttempts
    ) {
      this.entries.delete(key);
      return [0];
    }

    if (challenge.otp === submittedHash) {
      this.entries.delete(key);
      this.successfulConsumptions += 1;
      return [1, challenge.userId];
    }

    challenge.attempts += 1;
    this.wrongAttemptsApplied += 1;
    if (challenge.attempts >= maxAttempts) {
      this.entries.delete(key);
      return [0];
    }

    this.entries.set(key, {
      value: JSON.stringify(challenge),
      expiresAt: Math.min(entry.expiresAt, Date.now() + maxTtlMs),
    });
    return [0];
  }

  getChallenge(challengeId) {
    const entry = this.entries.get(`pending:admin-mfa:${challengeId}`);
    return entry ? JSON.parse(entry.value) : null;
  }
}

const makeAdmin = () => ({
  _id: { toString: () => ADMIN_ID },
  firstName: 'Mira',
  lastName: 'Admin',
  email: 'mira.admin@example.com',
  phone: '+15551234567',
  role: 'admin',
  privacyPermissions: [],
  isActive: true,
  isEmailVerified: true,
  isPhoneVerified: true,
  profileImage: null,
  sessionVersion: 0,
  isLocked: jest.fn(() => false),
  comparePassword: jest.fn(async () => true),
  incLoginAttempts: jest.fn(async () => undefined),
  resetLoginAttempts: jest.fn(async () => undefined),
});

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authAdminRouter);
  return app;
};

const issueChallenge = async (app, admin) => {
  mockFindOne.mockReturnValue({
    select: jest.fn().mockResolvedValue(admin),
  });

  const response = await request(app)
    .post('/api/auth/login')
    .send({
      email: admin.email,
      password: 'correct-password',
    })
    .expect(200);

  return {
    challengeId: response.body.data.challengeId,
    otp: mockSendOTPEmail.mock.calls.at(-1)[1],
  };
};

describe('admin MFA atomic challenge redemption', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      ADMIN_MFA_REQUIRED: 'true',
      JWT_SECRET: 'x'.repeat(64),
      ADMIN_ROLE_GRANTS_JSON: JSON.stringify([{
        adminId: ADMIN_ID,
        role: 'admin',
      }]),
      PRIVACY_ADMIN_PERMISSION_GRANTS_JSON: JSON.stringify([{
        adminId: ADMIN_ID,
        permissions: [
          'privacy_reader',
          'privacy_reviewer',
          'privacy_legal_hold',
        ],
      }]),
    };
    mockRedis = new AtomicRedisDouble();
    mockFindOne.mockReset();
    mockFindById.mockReset();
    mockSendOTPEmail.mockReset().mockResolvedValue(true);
    mockRecordSecurityEvent.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('a concurrent wrong-code flood applies the maximum exactly once and exhausts the challenge', async () => {
    const admin = makeAdmin();
    const app = buildApp();
    const { challengeId, otp } = await issueChallenge(app, admin);
    const wrongOtp = otp === '000000' ? '000001' : '000000';

    const responses = await Promise.all(
      Array.from({ length: 30 }, () =>
        request(app)
          .post('/api/auth/login/mfa')
          .send({ challengeId, otp: wrongOtp })
      )
    );

    expect(responses.every(({ status }) => status === 401)).toBe(true);
    expect(responses.every(({ body }) => (
      body.success === false &&
      body.message === 'Invalid or expired MFA challenge' &&
      !Object.hasOwn(body, 'errors')
    ))).toBe(true);
    expect(mockRedis.wrongAttemptsApplied).toBe(MAX_ADMIN_MFA_ATTEMPTS);
    expect(mockRedis.evalCalls).toBe(30);
    expect(mockRedis.getChallenge(challengeId)).toBeNull();
    expect(mockFindById).not.toHaveBeenCalled();

    for (const response of responses) {
      expect(JSON.stringify(response.body)).not.toContain(challengeId);
      expect(JSON.stringify(response.body)).not.toContain(wrongOtp);
    }
  });

  test('simultaneous correct submissions consume once and mint one admin session', async () => {
    const admin = makeAdmin();
    const app = buildApp();
    const { challengeId, otp } = await issueChallenge(app, admin);

    mockFindById.mockImplementation(() => ({
      select: jest.fn(async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return admin;
      }),
    }));

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app)
          .post('/api/auth/login/mfa')
          .send({ challengeId, otp })
      )
    );

    const successes = responses.filter(({ status }) => status === 200);
    const failures = responses.filter(({ status }) => status === 401);

    expect(successes).toHaveLength(1);
    expect(successes[0].body.data.token).toEqual(expect.any(String));
    expect(successes[0].body.data.user.privacyPermissions.sort()).toEqual([
      'privacy_legal_hold',
      'privacy_reader',
      'privacy_reviewer',
    ]);
    expect(successes[0].body.data.user.operationalRole).toBe('admin');
    expect(failures).toHaveLength(19);
    expect(failures.every(({ body }) => (
      body.success === false &&
      body.message === 'Invalid or expired MFA challenge' &&
      !Object.hasOwn(body, 'errors')
    ))).toBe(true);
    expect(mockRedis.successfulConsumptions).toBe(1);
    expect(mockRedis.getChallenge(challengeId)).toBeNull();
    expect(mockFindById).toHaveBeenCalledTimes(1);
    expect(admin.resetLoginAttempts).toHaveBeenCalledTimes(1);
  });

  test('does not issue an MFA challenge to an unassigned administrator', async () => {
    const admin = makeAdmin();
    mockFindOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(admin),
    });
    process.env.ADMIN_ROLE_GRANTS_JSON = JSON.stringify([{
      adminId: '64f000000000000000000099',
      role: 'admin',
    }]);

    const response = await request(buildApp())
      .post('/api/auth/login')
      .send({
        email: admin.email,
        password: 'correct-password',
      })
      .expect(403);

    expect(response.body.code).toBe('ADMIN_ROLE_ASSIGNMENT_REQUIRED');
    expect(mockSendOTPEmail).not.toHaveBeenCalled();
    expect(mockRecordSecurityEvent).toHaveBeenCalledWith(
      'admin_permission_denied',
      expect.objectContaining({
        outcome: 'failure',
        statusCode: 403,
        details: { reason: 'admin_role_assignment_required' },
      })
    );
  });

  test('does not mint a session when the role assignment is removed during MFA', async () => {
    const admin = makeAdmin();
    const app = buildApp();
    const { challengeId, otp } = await issueChallenge(app, admin);
    process.env.ADMIN_ROLE_GRANTS_JSON = JSON.stringify([{
      adminId: '64f000000000000000000099',
      role: 'admin',
    }]);
    mockFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue(admin),
    });

    const response = await request(app)
      .post('/api/auth/login/mfa')
      .send({ challengeId, otp })
      .expect(403);

    expect(response.body.code).toBe('ADMIN_ROLE_ASSIGNMENT_REQUIRED');
    expect(response.body.data).toBeUndefined();
    expect(admin.resetLoginAttempts).not.toHaveBeenCalled();
  });

  test('validation failures do not echo submitted OTP or challenge details', async () => {
    const submittedChallenge = crypto.randomUUID();
    const submittedOtp = '123456-not-valid';

    const response = await request(buildApp())
      .post('/api/auth/login/mfa')
      .send({
        challengeId: submittedChallenge,
        otp: submittedOtp,
      })
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      message: 'Invalid or expired MFA challenge',
    });
    expect(JSON.stringify(response.body)).not.toContain(submittedChallenge);
    expect(JSON.stringify(response.body)).not.toContain(submittedOtp);
    expect(mockRedis.evalCalls).toBe(0);
  });
});
