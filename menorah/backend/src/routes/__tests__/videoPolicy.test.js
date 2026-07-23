const express = require('express');
const request = require('supertest');

let mockAuthUser;
const mockAddGrant = jest.fn();
const mockToJwt = jest.fn();
const mockCreateRoom = jest.fn();
const mockDeleteRoom = jest.fn();
const mockRedisStore = new Map();
const mockSetEx = jest.fn((key, _ttl, value) => {
  mockRedisStore.set(key, value);
  return Promise.resolve('OK');
});
const mockGetDel = jest.fn((key) => {
  const value = mockRedisStore.get(key) || null;
  mockRedisStore.delete(key);
  return Promise.resolve(value);
});
const mockGet = jest.fn((key) => Promise.resolve(mockRedisStore.get(key) || null));
const mockDel = jest.fn((key) => {
  mockRedisStore.delete(key);
  return Promise.resolve(1);
});

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = mockAuthUser;
    next();
  },
}));

jest.mock('livekit-server-sdk', () => ({
  AccessToken: jest.fn().mockImplementation(() => ({
    addGrant: mockAddGrant,
    toJwt: mockToJwt,
  })),
  RoomServiceClient: jest.fn().mockImplementation(() => ({
    createRoom: mockCreateRoom,
    deleteRoom: mockDeleteRoom,
  })),
}));

jest.mock('../../models/Booking', () => ({
  findById: jest.fn(),
}));

jest.mock('../../config/redis', () => ({
  getRedisClient: () => ({
    setEx: mockSetEx,
    getDel: mockGetDel,
    get: mockGet,
    del: mockDel,
  }),
}));

const Booking = require('../../models/Booking');
const { AccessToken } = require('livekit-server-sdk');
const videoRouter = require('../video');

const bookingId = '64f000000000000000000000';
const userId = '64f000000000000000000001';
const counsellorUserId = '64f000000000000000000002';
const counsellorId = '64f000000000000000000003';
const applicationId = '64f000000000000000000004';
const adminId = '64f000000000000000000005';
const evidenceId = '64f000000000000000000006';
const outsiderId = '64f000000000000000000099';

const objectId = (value) => ({
  toString: () => value,
  toHexString: () => value,
});

const findByIdChain = (booking) => {
  const chain = {
    populate: jest.fn(() => chain),
    then: (resolve, reject) => Promise.resolve(booking).then(resolve, reject),
    catch: (reject) => Promise.resolve(booking).catch(reject),
  };
  return chain;
};

const makeBooking = (overrides = {}) => {
  const baseUser = {
    _id: objectId(userId),
    firstName: 'Asha',
    lastName: 'User',
    phone: '+919876543210',
    country: 'IN',
    role: 'user',
    isActive: true,
  };
  const baseCounsellorUser = {
    _id: objectId(counsellorUserId),
    firstName: 'Dr',
    lastName: 'Rao',
    phone: '+919000000000',
    country: 'IN',
    role: 'counsellor',
    isActive: true,
  };
  const baseCounsellor = {
    _id: objectId(counsellorId),
    user: baseCounsellorUser,
    status: 'approved',
    isActive: true,
    professionalVerification: {
      schemaVersion: 1,
      legacyReviewRequired: false,
      application: objectId(applicationId),
      onboardingConsent: {
        accepted: true,
        version: 'consent-v1',
        acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
        source: 'counsellor_web_registration',
      },
      credentialReview: {
        decision: 'approved',
        policyVersion: 'credential-v1',
        evidenceIds: [objectId(evidenceId)],
        reviewedBy: objectId(adminId),
        reviewedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      approvedBy: objectId(adminId),
      approvedAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  };
  const booking = {
    _id: objectId(bookingId),
    user: baseUser,
    counsellor: baseCounsellor,
    sessionType: 'video',
    sessionDuration: 50,
    scheduledAt: new Date(),
    status: 'in-progress',
    paymentStatus: 'paid',
    paymentMethod: 'razorpay',
    isSubscriptionBooking: false,
    paymentId: 'pay_current',
    razorpayOrderId: 'order_current',
    transactionId: 'order_current',
    orderStatus: 'paid',
    amountMinor: 50000,
    currency: 'INR',
    pricing: {
      listAmountMinor: 50000,
      currency: 'INR',
    },
    bookingAuthorization: {
      kind: 'payment',
      status: 'authorized',
      reference: 'pay_current',
      authorizedAt: new Date(Date.now() - 60 * 1000),
    },
    videoCall: {
      provider: 'livekit',
      joinMode: 'in_app',
      region: 'IN',
      status: 'started',
      roomId: `menorah-${bookingId}`,
      roomUrl: `wss://calls.example.com/menorah-${bookingId}`,
    },
    save: jest.fn().mockResolvedValue(undefined),
    startSession: jest.fn(async () => {
      booking.status = 'in-progress';
    }),
    ...overrides,
  };
  booking.user = { ...baseUser, ...(overrides.user || {}) };
  booking.counsellor = {
    ...baseCounsellor,
    ...(overrides.counsellor || {}),
    user: {
      ...baseCounsellorUser,
      ...(overrides.counsellor?.user || {}),
    },
  };
  return booking;
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/video', videoRouter);
  return app;
};

describe('video route call policy gates', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      LIVEKIT_URL: 'wss://calls.example.com',
      LIVEKIT_API_URL: 'https://calls.example.com',
      LIVEKIT_API_KEY: 'test-key',
      LIVEKIT_API_SECRET: 'test-secret',
      BLOCK_LIVEKIT_FOR_UNKNOWN_REGION: 'false',
      LIVEKIT_BLOCKED_COUNTRIES: 'AE',
      BLOCKED_COUNTRY_CALL_PROVIDER: 'zoom',
      ZOOM_ENABLED: 'true',
      COUNSELLOR_ONBOARDING_CONSENT_VERSION: 'consent-v1',
      COUNSELLOR_CREDENTIAL_POLICY_VERSION: 'credential-v1',
    };
    mockAuthUser = { _id: objectId(userId), role: 'user', country: 'IN', phone: '+919876543210' };
    mockAddGrant.mockClear();
    mockToJwt.mockReset().mockResolvedValue('signed-livekit-token');
    mockCreateRoom.mockReset().mockResolvedValue(undefined);
    mockDeleteRoom.mockReset().mockResolvedValue(undefined);
    mockRedisStore.clear();
    mockSetEx.mockClear();
    mockGetDel.mockClear();
    mockGet.mockClear();
    mockDel.mockClear();
    AccessToken.mockClear();
    Booking.findById.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('does not mint a LiveKit token for UAE sessions without an external link', async () => {
    const booking = makeBooking({
      user: {
        _id: objectId(userId),
        firstName: 'Noor',
        lastName: 'User',
        phone: '+971501234567',
        country: 'AE',
      },
      videoCall: {},
    });
    Booking.findById.mockReturnValue(findByIdChain(booking));

    const res = await request(buildApp())
      .post(`/api/video/room/${bookingId}/join`)
      .expect(409);

    expect(res.body).toMatchObject({
      success: false,
      provider: 'zoom',
      joinMode: 'external_link',
      status: 'not_configured',
    });
    expect(res.body.livekitToken).toBeUndefined();
    expect(res.body.data.livekitToken).toBeUndefined();
    expect(AccessToken).not.toHaveBeenCalled();
    expect(booking.save).toHaveBeenCalled();
  });

  test('returns only the approved external provider link for UAE sessions', async () => {
    const booking = makeBooking({
      user: {
        _id: objectId(userId),
        firstName: 'Noor',
        lastName: 'User',
        phone: '+971501234567',
        country: 'AE',
      },
      videoCall: {
        provider: 'zoom',
        joinMode: 'external_link',
        externalJoinUrl: 'https://zoom.example/session/user',
        externalHostUrl: 'https://zoom.example/session/host',
        externalProviderName: 'Zoom',
      },
    });
    Booking.findById.mockReturnValue(findByIdChain(booking));

    const res = await request(buildApp())
      .post(`/api/video/room/${bookingId}/join`)
      .expect(200);

    expect(res.body).toMatchObject({
      success: true,
      provider: 'zoom',
      joinMode: 'external_link',
      joinUrl: 'https://zoom.example/session/user',
    });
    expect(res.body.hostUrl).toBeUndefined();
    expect(res.body.externalHostUrl).toBeUndefined();
    expect(res.body.livekitToken).toBeUndefined();
    expect(AccessToken).not.toHaveBeenCalled();
  });

  test('returns only a one-time ticket for India in-app sessions', async () => {
    const booking = makeBooking();
    Booking.findById.mockReturnValue(findByIdChain(booking));

    const res = await request(buildApp())
      .post(`/api/video/room/${bookingId}/join`)
      .expect(200);

    expect(res.body).toMatchObject({
      success: true,
      provider: 'livekit',
      joinMode: 'in_app',
      livekitUrl: 'wss://calls.example.com',
      meetTicket: expect.any(String),
    });
    expect(res.body.livekitToken).toBeUndefined();
    expect(res.body.token).toBeUndefined();
    expect(res.body.data.livekitToken).toBeUndefined();
    expect(res.body.data.token).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.body.meetUrl).toMatch(/\/api\/video\/meet\?type=video#ticket=/);
    expect(new URL(res.body.meetUrl).searchParams.has('ticket')).toBe(false);
    expect(res.body.meetUrl).not.toContain('signed-livekit-token');
    expect(mockSetEx).toHaveBeenCalledTimes(1);
    expect(AccessToken).toHaveBeenCalledTimes(1);
    expect(AccessToken.mock.calls[0][2].ttl).toEqual(expect.any(Number));
    expect(AccessToken.mock.calls[0][2].ttl).toBeGreaterThan(0);
    expect(AccessToken.mock.calls[0][2].ttl).toBeLessThanOrEqual(4 * 60 * 60);
    expect(mockAddGrant).toHaveBeenCalledWith(expect.objectContaining({
      roomJoin: true,
      room: `menorah-${bookingId}`,
    }));
  });

  test('returns only a one-time ticket for non-blocked country sessions', async () => {
    mockAuthUser = { _id: objectId(userId), role: 'user', country: 'US', phone: '+15551234567' };
    const booking = makeBooking({
      user: {
        _id: objectId(userId),
        firstName: 'Sam',
        lastName: 'User',
        phone: '+15551234567',
        country: 'US',
      },
      videoCall: {
        provider: 'livekit',
        joinMode: 'in_app',
        region: 'US',
        status: 'started',
        roomId: `menorah-${bookingId}`,
        roomUrl: `wss://calls.example.com/menorah-${bookingId}`,
      },
    });
    Booking.findById.mockReturnValue(findByIdChain(booking));

    const res = await request(buildApp())
      .post(`/api/video/room/${bookingId}/join`)
      .expect(200);

    expect(res.body).toMatchObject({
      success: true,
      provider: 'livekit',
      joinMode: 'in_app',
      region: 'US',
      meetTicket: expect.any(String),
    });
    expect(res.body.livekitToken).toBeUndefined();
    expect(res.body.token).toBeUndefined();
    expect(res.body.meetUrl).toMatch(/\/api\/video\/meet\?type=video#ticket=/);
    expect(new URL(res.body.meetUrl).searchParams.has('ticket')).toBe(false);
    expect(res.body.meetUrl).not.toContain('signed-livekit-token');
    expect(AccessToken).toHaveBeenCalledTimes(1);
  });

  test('blocks unknown-region sessions when the policy flag is enabled', async () => {
    process.env.BLOCK_LIVEKIT_FOR_UNKNOWN_REGION = 'true';
    mockAuthUser = { _id: objectId(userId), role: 'user', phone: '+15551234567' };
    const booking = makeBooking({
      user: {
        _id: objectId(userId),
        firstName: 'Sam',
        lastName: 'User',
        phone: '+15551234567',
        country: null,
      },
      videoCall: {},
    });
    Booking.findById.mockReturnValue(findByIdChain(booking));

    const res = await request(buildApp())
      .post(`/api/video/room/${bookingId}/join`)
      .expect(403);

    expect(res.body).toMatchObject({
      success: false,
      provider: 'disabled',
      joinMode: 'disabled',
      region: 'UNKNOWN',
    });
    expect(res.body.livekitToken).toBeUndefined();
    expect(AccessToken).not.toHaveBeenCalled();
  });

  test('redeems a generated meet ticket once only', async () => {
    const booking = makeBooking();
    Booking.findById.mockReturnValue(findByIdChain(booking));
    const ticket = await videoRouter._private.createMeetTicket({
      livekitToken: 'signed-livekit-token',
      livekitUrl: 'wss://calls.example.com',
      name: 'Asha User',
      type: 'video',
      bookingId,
      participantId: userId,
    });

    const first = await request(buildApp())
      .post('/api/video/meet/redeem')
      .send({ ticket })
      .expect(200);

    expect(first.body).toMatchObject({
      success: true,
      livekitUrl: 'wss://calls.example.com',
      livekitToken: 'signed-livekit-token',
      name: 'Asha User',
      type: 'video',
      data: {
        livekitUrl: 'wss://calls.example.com',
        livekitToken: 'signed-livekit-token',
      },
    });

    await request(buildApp())
      .post('/api/video/meet/redeem')
      .send({ ticket })
      .expect(410);
  });

  test('rejects expired or unknown meet tickets', async () => {
    await request(buildApp())
      .post('/api/video/meet/redeem')
      .send({ ticket: 'expired-ticket-value-that-is-long-enough' })
      .expect(410);
  });

  test.each([
    ['unassigned user', { _id: objectId(outsiderId), role: 'user' }],
    ['unassigned counsellor', { _id: objectId(outsiderId), role: 'counsellor' }],
  ])('denies a %s without minting a token', async (_label, requester) => {
    mockAuthUser = requester;
    Booking.findById.mockReturnValue(findByIdChain(makeBooking()));

    const res = await request(buildApp())
      .post(`/api/video/room/${bookingId}/join`)
      .expect(403);

    expect(res.body.code).toBe('BOOKING_PARTICIPANT_MISMATCH');
    expect(AccessToken).not.toHaveBeenCalled();
  });

  test('denies calls before the explicit early window', async () => {
    const booking = makeBooking({
      scheduledAt: new Date(Date.now() + 16 * 60 * 1000),
      status: 'confirmed',
    });
    Booking.findById.mockReturnValue(findByIdChain(booking));

    const res = await request(buildApp())
      .post('/api/video/create-room')
      .send({ bookingId })
      .expect(409);

    expect(res.body.code).toBe('CALL_TOO_EARLY');
    expect(mockCreateRoom).not.toHaveBeenCalled();
  });

  test('denies calls after the session duration and late grace window', async () => {
    const booking = makeBooking({
      scheduledAt: new Date(Date.now() - 66 * 60 * 1000),
      status: 'in-progress',
    });
    Booking.findById.mockReturnValue(findByIdChain(booking));

    const res = await request(buildApp())
      .get(`/api/video/room/${bookingId}`)
      .expect(410);

    expect(res.body.code).toBe('CALL_TOO_LATE');
    expect(AccessToken).not.toHaveBeenCalled();
  });

  test.each([
    ['cancelled', { status: 'cancelled' }, 'BOOKING_STATE_NOT_ACTIVE'],
    ['refunded', { paymentStatus: 'refunded' }, 'BOOKING_AUTHORIZATION_NOT_CURRENT'],
  ])('denies a %s booking on join', async (_label, override, code) => {
    Booking.findById.mockReturnValue(findByIdChain(makeBooking(override)));

    const res = await request(buildApp())
      .post(`/api/video/room/${bookingId}/join`)
      .expect(403);

    expect(res.body.code).toBe(code);
    expect(AccessToken).not.toHaveBeenCalled();
  });

  test('rechecks booking authorization when redeeming a one-time ticket', async () => {
    const booking = makeBooking();
    Booking.findById.mockReturnValue(findByIdChain(booking));
    const ticket = await videoRouter._private.createMeetTicket({
      livekitToken: 'signed-livekit-token',
      livekitUrl: 'wss://calls.example.com',
      name: 'Asha User',
      type: 'video',
      bookingId,
      participantId: userId,
    });
    booking.paymentStatus = 'refunded';

    await request(buildApp())
      .post('/api/video/meet/redeem')
      .send({ ticket })
      .expect(410);

    await request(buildApp())
      .post('/api/video/meet/redeem')
      .send({ ticket })
      .expect(410);
  });

  test('allows exactly one winner under concurrent ticket replay', async () => {
    Booking.findById.mockReturnValue(findByIdChain(makeBooking()));
    const ticket = await videoRouter._private.createMeetTicket({
      livekitToken: 'signed-livekit-token',
      livekitUrl: 'wss://calls.example.com',
      name: 'Asha User',
      type: 'video',
      bookingId,
      participantId: userId,
    });
    const app = buildApp();

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app)
          .post('/api/video/meet/redeem')
          .send({ ticket })
      )
    );

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 410)).toHaveLength(19);
  });

  test('keeps recording explicitly disabled without mutating the booking', async () => {
    mockAuthUser = {
      _id: objectId(counsellorUserId),
      role: 'counsellor',
      country: 'IN',
    };
    const booking = makeBooking();
    Booking.findById.mockReturnValue(findByIdChain(booking));

    const res = await request(buildApp())
      .post(`/api/video/room/${bookingId}/recording`)
      .send({ enable: true })
      .expect(501);

    expect(res.body).toMatchObject({
      success: false,
      code: 'CALL_RECORDING_DISABLED',
      isRecordingEnabled: false,
    });
    expect(booking.save).not.toHaveBeenCalled();
  });
});
