const {
  _private: {
    loadAuthorizedRoom,
    getChatEventRooms,
    shouldRecordSocketChatDenial,
  },
} = require('../createSocketServer');

const USER_ID = '64f000000000000000000001';
const COUNSELLOR_ID = '64f000000000000000000002';
const COUNSELLOR_USER_ID = '64f000000000000000000003';
const APPLICATION_ID = '64f000000000000000000004';
const ADMIN_ID = '64f000000000000000000005';
const ROOM_ID = '64f000000000000000000006';
const BOOKING_ID = '64f000000000000000000007';

const approvedCounsellor = () => ({
  _id: COUNSELLOR_ID,
  user: {
    _id: COUNSELLOR_USER_ID,
    role: 'counsellor',
    isActive: true,
  },
  status: 'approved',
  isActive: true,
  professionalVerification: {
    schemaVersion: 1,
    legacyReviewRequired: false,
    application: APPLICATION_ID,
    onboardingConsent: {
      accepted: true,
      version: 'consent-v1',
      acceptedAt: new Date('2026-07-01T00:00:00.000Z'),
      source: 'counsellor_web_registration',
    },
    credentialReview: {
      decision: 'approved',
      policyVersion: 'credential-v1',
      evidenceIds: ['64f000000000000000000008'],
      reviewedBy: ADMIN_ID,
      reviewedAt: new Date('2026-07-01T00:00:00.000Z'),
    },
    approvedBy: ADMIN_ID,
    approvedAt: new Date('2026-07-01T00:00:00.000Z'),
    expiresAt: new Date('2027-07-01T00:00:00.000Z'),
  },
});

const room = (overrides = {}) => ({
  _id: ROOM_ID,
  user: {
    _id: USER_ID,
    role: 'user',
    isActive: true,
  },
  counsellor: approvedCounsellor(),
  booking: null,
  isActive: true,
  ...overrides,
});

const queryResult = (value) => {
  const query = {
    populate: jest.fn(() => query),
    lean: jest.fn().mockResolvedValue(value),
  };
  return query;
};

const modelFor = (value) => ({
  findById: jest.fn(() => queryResult(value)),
});

describe('Socket.IO chat room authorization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      COUNSELLOR_ONBOARDING_CONSENT_VERSION: 'consent-v1',
      COUNSELLOR_CREDENTIAL_POLICY_VERSION: 'credential-v1',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('authorizes a current participant in an active room', async () => {
    const authorization = await loadAuthorizedRoom(
      ROOM_ID,
      USER_ID,
      {
        ChatRoomModel: modelFor(room()),
        now: new Date('2026-07-23T10:00:00.000Z'),
      }
    );

    expect(authorization.access).toMatchObject({
      allowed: true,
      participantRole: 'user',
    });
  });

  test.each([
    [
      'professional suspension',
      () => {
        const value = room();
        value.counsellor.status = 'suspended';
        return value;
      },
      'CHAT_COUNSELLOR_NOT_APPROVED',
    ],
    [
      'booking cancellation',
      () => room({
        booking: {
          _id: BOOKING_ID,
          user: USER_ID,
          counsellor: COUNSELLOR_ID,
          status: 'cancelled',
        },
      }),
      'CHAT_BOOKING_NOT_ACTIVE',
    ],
    [
      'booking reassignment',
      () => room({
        booking: {
          _id: BOOKING_ID,
          user: USER_ID,
          counsellor: '64f000000000000000000099',
          status: 'confirmed',
        },
      }),
      'CHAT_BOOKING_ASSIGNMENT_CHANGED',
    ],
  ])('denies socket room actions after %s', async (_label, makeRoom, reason) => {
    const authorization = await loadAuthorizedRoom(
      ROOM_ID,
      USER_ID,
      {
        ChatRoomModel: modelFor(makeRoom()),
        now: new Date('2026-07-23T10:00:00.000Z'),
      }
    );

    expect(authorization.access).toMatchObject({
      allowed: false,
      reason,
    });
  });

  test('rate-bounds repeated denial audit events per socket and room', () => {
    const socket = {};
    expect(shouldRecordSocketChatDenial(socket, `cancelled:${ROOM_ID}`, 1000))
      .toBe(true);
    expect(shouldRecordSocketChatDenial(socket, `cancelled:${ROOM_ID}`, 2000))
      .toBe(false);
    expect(shouldRecordSocketChatDenial(socket, `cancelled:${ROOM_ID}`, 31001))
      .toBe(true);
  });

  test('targets the open chat room and every device owned by both participants', () => {
    expect(getChatEventRooms(room(), ROOM_ID)).toEqual([
      `chat_${ROOM_ID}`,
      `user_${USER_ID}`,
      `user_${COUNSELLOR_USER_ID}`,
    ]);
  });
});
