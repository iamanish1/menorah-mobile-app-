const express = require('express');
const request = require('supertest');

let mockAuthUser;
const mockChatRoomFind = jest.fn();
const mockChatRoomFindById = jest.fn();
const mockMessageConstructor = jest.fn();
const mockMessageFindOne = jest.fn();
const mockRedisGet = jest.fn();
const mockSocketTo = jest.fn();
const mockSocketEmit = jest.fn();

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = mockAuthUser;
    next();
  },
}));

jest.mock('../../models/ChatRoom', () => ({
  find: (...args) => mockChatRoomFind(...args),
  findById: (...args) => mockChatRoomFindById(...args),
}));

jest.mock('../../models/Message', () => {
  function Message(...args) {
    return mockMessageConstructor(...args);
  }
  Message.findOne = (...args) => mockMessageFindOne(...args);
  return Message;
});

jest.mock('../../models/Counsellor', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../../config/redis', () => ({
  getRedisClient: () => ({
    get: mockRedisGet,
  }),
}));

const chatRouter = require('../chat');

const objectId = (value) => ({
  toString: () => value,
  toHexString: () => value,
});
const userId = '64f000000000000000000001';
const counsellorUserId = '64f000000000000000000002';
const outsiderId = '64f000000000000000000003';
const roomId = '64f000000000000000000010';
const messageId = '64f000000000000000000020';
const counsellorId = '64f000000000000000000030';
const applicationId = '64f000000000000000000040';
const adminId = '64f000000000000000000050';
const evidenceId = '64f000000000000000000060';
const bookingId = '64f000000000000000000070';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.set('io', { to: mockSocketTo });
  app.use('/api/chat', chatRouter);
  return app;
};

const roomForUserAndCounsellor = {
  _id: objectId(roomId),
  user: {
    _id: objectId(userId),
    role: 'user',
    isActive: true,
  },
  counsellor: {
    _id: objectId(counsellorId),
    user: {
      _id: objectId(counsellorUserId),
      role: 'counsellor',
      isActive: true,
    },
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
      expiresAt: new Date('2027-07-01T00:00:00.000Z'),
    },
  },
  booking: null,
  isActive: true,
};

const queryResult = (value) => {
  const query = {
    populate: jest.fn(() => query),
    select: jest.fn(() => query),
    sort: jest.fn(() => query),
    lean: jest.fn().mockResolvedValue(value),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch: (reject) => Promise.resolve(value).catch(reject),
  };
  return query;
};

const bookingForRoom = (overrides = {}) => ({
  _id: objectId(bookingId),
  user: objectId(userId),
  counsellor: objectId(counsellorId),
  status: 'confirmed',
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
  ...overrides,
});

describe('chat authorization hardening', () => {
  beforeEach(() => {
    process.env.COUNSELLOR_ONBOARDING_CONSENT_VERSION = 'consent-v1';
    process.env.COUNSELLOR_CREDENTIAL_POLICY_VERSION = 'credential-v1';
    mockAuthUser = { _id: objectId(userId), role: 'user', firstName: 'Asha', lastName: 'User' };
    mockChatRoomFind.mockReset();
    mockChatRoomFindById.mockReset();
    mockMessageConstructor.mockReset();
    mockMessageFindOne.mockReset();
    mockRedisGet.mockReset();
    mockSocketTo.mockReset().mockReturnValue({ emit: mockSocketEmit });
    mockSocketEmit.mockReset();
    chatRouter.setSocketIO({ to: mockSocketTo });
  });

  test('online-status only returns people sharing an active room with the requester', async () => {
    mockChatRoomFind.mockReturnValue(queryResult([
      roomForUserAndCounsellor,
    ]));
    mockRedisGet.mockImplementation((key) =>
      Promise.resolve(key === `presence:${counsellorUserId}` ? 'Dr Rao' : null)
    );

    const res = await request(buildApp())
      .get('/api/chat/online-status')
      .expect(200);

    expect(res.body.data.onlineStatus).toEqual([
      { userId: counsellorUserId, userName: 'Dr Rao', isOnline: true },
    ]);
    expect(mockRedisGet).toHaveBeenCalledWith(`presence:${counsellorUserId}`);
    expect(mockRedisGet).not.toHaveBeenCalledWith(`presence:${outsiderId}`);
  });

  test('room lists fail closed after the backing booking is cancelled', async () => {
    mockChatRoomFind.mockReturnValue(queryResult([
      {
        ...roomForUserAndCounsellor,
        booking: bookingForRoom({ status: 'cancelled' }),
      },
    ]));

    const res = await request(buildApp())
      .get('/api/chat/rooms')
      .expect(200);

    expect(res.body.data.chatRooms).toEqual([]);
  });

  test('delete requires the requester to be a member of the supplied room', async () => {
    mockAuthUser = { _id: objectId(outsiderId), role: 'user', firstName: 'Out', lastName: 'Sider' };
    mockChatRoomFindById.mockReturnValue(queryResult(roomForUserAndCounsellor));

    await request(buildApp())
      .delete(`/api/chat/rooms/${roomId}/messages/${messageId}`)
      .expect(403);

    expect(mockMessageFindOne).not.toHaveBeenCalled();
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });

  test('delete requires the message to belong to the supplied room before emitting', async () => {
    mockChatRoomFindById.mockReturnValue(queryResult(roomForUserAndCounsellor));
    mockMessageFindOne.mockResolvedValue(null);

    await request(buildApp())
      .delete(`/api/chat/rooms/${roomId}/messages/${messageId}`)
      .expect(404);

    expect(mockMessageFindOne).toHaveBeenCalledWith({ _id: messageId, room: roomId });
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });

  test('delete emits only after membership, room ownership, and sender checks pass', async () => {
    const message = {
      _id: objectId(messageId),
      room: objectId(roomId),
      sender: objectId(userId),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };
    mockChatRoomFindById.mockReturnValue(queryResult(roomForUserAndCounsellor));
    mockMessageFindOne.mockResolvedValue(message);

    await request(buildApp())
      .delete(`/api/chat/rooms/${roomId}/messages/${messageId}`)
      .expect(200);

    expect(message.softDelete).toHaveBeenCalledWith(mockAuthUser._id);
    expect(mockSocketTo).toHaveBeenCalledWith([
      `chat_${roomId}`,
      `user_${userId}`,
      `user_${counsellorUserId}`,
    ]);
    expect(mockSocketEmit).toHaveBeenCalledWith('message_deleted', expect.objectContaining({ messageId }));
  });

  test('a persisted message is fanned out to every signed-in participant device', async () => {
    const room = {
      ...roomForUserAndCounsellor,
      updateLastMessage: jest.fn().mockResolvedValue(undefined),
      incrementUnread: jest.fn().mockResolvedValue(undefined),
    };
    const message = {
      _id: objectId(messageId),
      sender: {
        _id: objectId(userId),
        firstName: 'Asha',
        lastName: 'User',
        profileImage: null,
      },
      content: 'Continue this conversation on my phone',
      type: 'text',
      status: 'sent',
      createdAt: new Date('2026-08-02T10:00:00.000Z'),
      save: jest.fn().mockResolvedValue(undefined),
      populate: jest.fn().mockResolvedValue(undefined),
    };
    mockChatRoomFindById.mockReturnValue(queryResult(room));
    mockMessageConstructor.mockReturnValue(message);

    const response = await request(buildApp())
      .post(`/api/chat/rooms/${roomId}/messages`)
      .send({ content: message.content, type: 'text' })
      .expect(201);

    expect(response.body.data.message).toMatchObject({
      id: messageId,
      roomId,
      content: message.content,
    });
    expect(room.incrementUnread).toHaveBeenCalledWith('counsellor');
    expect(mockSocketTo).toHaveBeenCalledWith([
      `chat_${roomId}`,
      `user_${userId}`,
      `user_${counsellorUserId}`,
    ]);
    expect(mockSocketEmit).toHaveBeenCalledWith(
      'new_message',
      expect.objectContaining({ roomId, id: messageId })
    );
  });

  test('does not write sensitive message content to production error logs', async () => {
    const sensitiveContent = 'private clinical disclosure unique-log-sentinel';
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockChatRoomFindById.mockReturnValue(queryResult(roomForUserAndCounsellor));
    mockMessageConstructor.mockImplementation(() => {
      throw new Error(sensitiveContent);
    });

    try {
      await request(buildApp())
        .post(`/api/chat/rooms/${roomId}/messages`)
        .send({ content: sensitiveContent, type: 'text' })
        .expect(500);

      expect(consoleError).toHaveBeenCalledWith(
        'Send message error:',
        'CHAT_MESSAGE_SEND_FAILED'
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sensitiveContent);
    } finally {
      consoleError.mockRestore();
    }
  });

  test.each([
    [
      'counsellor suspension',
      () => ({
        ...roomForUserAndCounsellor,
        counsellor: {
          ...roomForUserAndCounsellor.counsellor,
          status: 'suspended',
        },
      }),
      'CHAT_COUNSELLOR_NOT_APPROVED',
    ],
    [
      'user deactivation',
      () => ({
        ...roomForUserAndCounsellor,
        user: {
          ...roomForUserAndCounsellor.user,
          isActive: false,
        },
      }),
      'CHAT_USER_INACTIVE',
    ],
    [
      'user deletion',
      () => ({
        ...roomForUserAndCounsellor,
        user: null,
      }),
      'CHAT_USER_INACTIVE',
    ],
    [
      'booking cancellation',
      () => ({
        ...roomForUserAndCounsellor,
        booking: bookingForRoom({ status: 'cancelled' }),
      }),
      'CHAT_BOOKING_NOT_ACTIVE',
    ],
    [
      'booking refund',
      () => ({
        ...roomForUserAndCounsellor,
        booking: bookingForRoom({ paymentStatus: 'refunded' }),
      }),
      'CHAT_BOOKING_AUTHORIZATION_NOT_CURRENT',
    ],
    [
      'booking reassignment',
      () => ({
        ...roomForUserAndCounsellor,
        booking: bookingForRoom({
          counsellor: objectId('64f000000000000000000099'),
        }),
      }),
      'CHAT_BOOKING_ASSIGNMENT_CHANGED',
    ],
  ])('denies REST actions after %s', async (_label, makeRoom, code) => {
    mockChatRoomFindById.mockReturnValue(queryResult(makeRoom()));

    const res = await request(buildApp())
      .delete(`/api/chat/rooms/${roomId}/messages/${messageId}`)
      .expect(403);

    expect(res.body.code).toBe(code);
    expect(mockMessageFindOne).not.toHaveBeenCalled();
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });
});
