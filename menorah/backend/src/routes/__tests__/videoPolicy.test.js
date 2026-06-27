const express = require('express');
const request = require('supertest');

let mockAuthUser;
const mockAddGrant = jest.fn();
const mockToJwt = jest.fn();
const mockCreateRoom = jest.fn();
const mockDeleteRoom = jest.fn();

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

const Booking = require('../../models/Booking');
const { AccessToken } = require('livekit-server-sdk');
const videoRouter = require('../video');

const bookingId = '64f000000000000000000000';
const userId = '64f000000000000000000001';
const counsellorUserId = '64f000000000000000000002';

const objectId = (value) => ({ toString: () => value });

const findByIdChain = (booking) => {
  const chain = {
    populate: jest.fn(() => chain),
    then: (resolve, reject) => Promise.resolve(booking).then(resolve, reject),
    catch: (reject) => Promise.resolve(booking).catch(reject),
  };
  return chain;
};

const makeBooking = (overrides = {}) => {
  const booking = {
    _id: objectId(bookingId),
    user: {
      _id: objectId(userId),
      firstName: 'Asha',
      lastName: 'User',
      phone: '+919876543210',
      country: 'IN',
    },
    counsellor: {
      user: {
        _id: objectId(counsellorUserId),
        firstName: 'Dr',
        lastName: 'Rao',
        phone: '+919000000000',
        country: 'IN',
      },
    },
    sessionType: 'video',
    sessionDuration: 50,
    scheduledAt: new Date(),
    status: 'in-progress',
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
    };
    mockAuthUser = { _id: objectId(userId), role: 'user', country: 'IN', phone: '+919876543210' };
    mockAddGrant.mockClear();
    mockToJwt.mockReset().mockResolvedValue('signed-livekit-token');
    mockCreateRoom.mockReset().mockResolvedValue(undefined);
    mockDeleteRoom.mockReset().mockResolvedValue(undefined);
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
      hostUrl: 'https://zoom.example/session/host',
    });
    expect(res.body.livekitToken).toBeUndefined();
    expect(AccessToken).not.toHaveBeenCalled();
  });

  test('mints a LiveKit token for India in-app sessions', async () => {
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
      livekitToken: 'signed-livekit-token',
    });
    expect(AccessToken).toHaveBeenCalledTimes(1);
    expect(mockAddGrant).toHaveBeenCalledWith(expect.objectContaining({
      roomJoin: true,
      room: `menorah-${bookingId}`,
    }));
  });

  test('mints a LiveKit token for non-blocked country sessions', async () => {
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
      livekitToken: 'signed-livekit-token',
    });
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
});
