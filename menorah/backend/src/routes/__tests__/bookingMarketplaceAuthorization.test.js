const express = require('express');
const request = require('supertest');

const BOOKING_ID = '64f000000000000000000010';
const COUNSELLOR_ID = '64f000000000000000000020';
const SECOND_COUNSELLOR_ID = '64f000000000000000000021';
const USER_ID = '64f000000000000000000030';
const SECOND_USER_ID = '64f000000000000000000031';
const FUTURE_DATE = '2099-01-15T10:00:00.000Z';
const CREATED_AT = '2026-01-01T08:00:00.000Z';
const AUTHORIZED_AT = '2026-01-01T07:55:00.000Z';
const FULL_WEEK_AVAILABILITY = Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map((day) => [day, { isAvailable: true, start: '00:00', end: '23:59' }])
);

let mockAuthUser;
const mockBookingFind = jest.fn();
const mockBookingFindById = jest.fn();
const mockBookingFindOne = jest.fn();
const mockBookingFindOneAndUpdate = jest.fn();
const mockBookingCountDocuments = jest.fn();
const mockCounsellorFindOne = jest.fn();

jest.mock('../../middleware/auth', () => ({
  counsellorAuth: (req, _res, next) => {
    const requestUserId = req.get('x-test-user-id');
    req.user = {
      ...mockAuthUser,
      ...(requestUserId ? { _id: requestUserId } : {}),
    };
    next();
  },
}));

jest.mock('../../models/Booking', () => ({
  find: (...args) => mockBookingFind(...args),
  findById: (...args) => mockBookingFindById(...args),
  findOne: (...args) => mockBookingFindOne(...args),
  findOneAndUpdate: (...args) => mockBookingFindOneAndUpdate(...args),
  countDocuments: (...args) => mockBookingCountDocuments(...args),
}));

jest.mock('../../models/Counsellor', () => ({
  findOne: (...args) => mockCounsellorFindOne(...args),
}));

jest.mock('../../models/User', () => ({
  findById: jest.fn(),
}));

jest.mock('../../models/Payout', () => ({
  exists: jest.fn(),
}));

jest.mock('../../config/redis', () => ({
  getRedisClient: jest.fn(),
}));

jest.mock('../../utils/cloudinary', () => ({
  uploadBuffer: jest.fn(),
  deleteResource: jest.fn(),
}));

jest.mock('../../utils/bankAccountEncryption', () => ({
  encryptBankAccountNumber: jest.fn(),
}));

const counsellorBookingsRouter = require('../counsellor-bookings');

const eligibleCounsellor = (overrides = {}) => ({
  _id: COUNSELLOR_ID,
  user: USER_ID,
  isActive: true,
  isAvailable: true,
  isVerified: true,
  status: 'approved',
  profileImage: 'https://media.example.test/counsellor.jpg',
  voiceIntroUrl: 'https://media.example.test/counsellor.webm',
  timezone: 'UTC',
  availability: FULL_WEEK_AVAILABILITY,
  ...overrides,
});

const validPaymentBooking = (overrides = {}) => ({
  _id: BOOKING_ID,
  user: USER_ID,
  counsellor: null,
  sessionType: 'video',
  sessionDuration: 45,
  scheduledAt: FUTURE_DATE,
  status: 'confirmed',
  paymentStatus: 'paid',
  paymentMethod: 'razorpay',
  isSubscriptionBooking: false,
  paymentId: 'pay_test_123',
  razorpayOrderId: 'order_test_123',
  transactionId: 'order_test_123',
  orderStatus: 'paid',
  amount: 1250,
  amountMinor: 125000,
  currency: 'INR',
  pricing: {
    source: 'service_catalog',
    serviceCode: 'unassigned-45',
    listAmountMinor: 125000,
    currency: 'INR',
  },
  bookingAuthorization: {
    kind: 'payment',
    status: 'authorized',
    reference: 'pay_test_123',
    authorizedAt: AUTHORIZED_AT,
  },
  preferences: {
    sessionType: 'video',
    categoryId: 'stress-support',
    gender: 'female',
  },
  createdAt: CREATED_AT,
  ...overrides,
});

const validSubscriptionBooking = (overrides = {}) => validPaymentBooking({
  paymentMethod: 'subscription',
  isSubscriptionBooking: true,
  amount: 0,
  amountMinor: 0,
  bookingAuthorization: {
    kind: 'subscription_entitlement',
    status: 'authorized',
    reference: 'monthly:2026-01-01T00:00:00.000Z',
    authorizedAt: AUTHORIZED_AT,
    validUntil: '2099-02-01T00:00:00.000Z',
  },
  ...overrides,
});

const previewSource = () => ({
  ...validPaymentBooking(),
  user: {
    _id: USER_ID,
    firstName: 'Private',
    lastName: 'Person',
    email: 'private@example.test',
    phone: '+919999999999',
    profileImage: 'https://media.example.test/private.jpg',
    gender: 'female',
  },
  concerns: ['panic attacks'],
  symptoms: ['insomnia'],
  goals: ['private clinical goal'],
  emergencyContact: { name: 'Family Member', phone: '+918888888888' },
  notes: 'private clinician note',
  statusHistory: [{ status: 'confirmed', notes: 'private history' }],
  videoCall: { roomUrl: 'https://call.example.test/secret-room' },
  razorpayOrderId: 'order_secret',
  transactionId: 'order_secret',
  razorpayPaymentId: 'pay_secret',
});

const expectedPreview = {
  accessScope: 'preview',
  id: BOOKING_ID,
  sessionType: 'video',
  sessionDuration: 45,
  scheduledAt: FUTURE_DATE,
  status: 'confirmed',
  canAccept: true,
  createdAt: CREATED_AT,
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/counsellors', counsellorBookingsRouter);
  return app;
};

const pendingFindQuery = (bookings) => {
  const chain = {};
  chain.select = jest.fn(() => chain);
  chain.sort = jest.fn(() => chain);
  chain.skip = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.lean = jest.fn(async () => bookings);
  return chain;
};

const selectLeanQuery = (value) => {
  const lean = jest.fn(async () => value);
  const select = jest.fn(() => ({ lean }));
  return { query: { select }, select, lean };
};

const populateLeanQuery = (value) => {
  const lean = jest.fn(async () => value);
  const populate = jest.fn(() => ({ lean }));
  return { query: { populate }, populate, lean };
};

const selectQuery = (value) => ({
  select: jest.fn(async () => value),
});

const expectAuthorizedMarketplacePredicate = (query) => {
  expect(query).toEqual(expect.objectContaining({
    counsellor: null,
    status: 'confirmed',
    scheduledAt: { $type: 'date', $gt: expect.any(Date) },
    $and: expect.any(Array),
  }));
  expect(query).not.toHaveProperty('$or');
  expect(query.$and).toHaveLength(2);

  const authorizationBranches = query.$and[0].$or;
  expect(authorizationBranches).toHaveLength(2);
  expect(authorizationBranches.every((branch) => (
    branch.paymentStatus === 'paid'
    && branch['bookingAuthorization.status'] === 'authorized'
    && branch['bookingAuthorization.reference']
    && branch['bookingAuthorization.authorizedAt']
  ))).toBe(true);
  expect(authorizationBranches[0]).toEqual(expect.objectContaining({
    paymentId: { $type: 'string', $regex: expect.any(RegExp) },
    razorpayOrderId: { $type: 'string', $regex: expect.any(RegExp) },
    transactionId: { $type: 'string', $regex: expect.any(RegExp) },
    orderStatus: 'paid',
    amountMinor: {
      $type: 'number',
      $gt: 0,
      $lte: Number.MAX_SAFE_INTEGER,
    },
    $expr: {
      $and: expect.arrayContaining([
        { $eq: ['$bookingAuthorization.reference', '$paymentId'] },
        { $eq: ['$transactionId', '$razorpayOrderId'] },
        { $eq: ['$amountMinor', '$pricing.listAmountMinor'] },
      ]),
    },
  }));

  expect(query.$and[1]).toEqual({
    $or: [
      { 'preferences.gender': 'female' },
      { 'preferences.gender': 'any' },
      { 'preferences.gender': { $exists: false } },
      { 'preferences.gender': null },
    ],
  });
};

const expectEligibilityProjection = (projection) => {
  const fields = projection.split(/\s+/);
  expect(fields).toEqual(expect.arrayContaining([
    'paymentStatus',
    'paymentMethod',
    'isSubscriptionBooking',
    'paymentId',
    'amountMinor',
    'currency',
    'pricing',
    'bookingAuthorization',
    'preferences',
  ]));
};

describe('counsellor booking marketplace authorization boundary', () => {
  beforeEach(() => {
    mockAuthUser = {
      _id: USER_ID,
      firstName: 'Verified',
      lastName: 'Counsellor',
      gender: 'female',
      role: 'counsellor',
    };

    mockBookingFind.mockReset();
    mockBookingFindById.mockReset();
    mockBookingFindOne.mockReset().mockResolvedValue(null);
    mockBookingFindOneAndUpdate.mockReset();
    mockBookingCountDocuments.mockReset().mockResolvedValue(0);
    mockCounsellorFindOne.mockReset().mockResolvedValue(eligibleCounsellor());
  });

  test('returns an exact sanitized preview list and queries only explicitly authorized bookings', async () => {
    const findQuery = pendingFindQuery([previewSource()]);
    mockBookingFind.mockReturnValue(findQuery);
    mockBookingCountDocuments.mockResolvedValue(1);

    const response = await request(buildApp())
      .get('/api/counsellors/me/bookings/pending')
      .expect(200);

    expect(response.body.data.bookings).toEqual([expectedPreview]);
    expect(response.body.data.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      pages: 1,
    });

    const marketplaceQuery = mockBookingFind.mock.calls[0][0];
    expectAuthorizedMarketplacePredicate(marketplaceQuery);
    expect(mockBookingCountDocuments).toHaveBeenCalledWith(marketplaceQuery);

    const projection = findQuery.select.mock.calls[0][0];
    expectEligibilityProjection(projection);
    expect(projection).not.toMatch(/\buser\b|concerns|symptoms|goals|emergency|notes|statusHistory|videoCall|razorpay/i);
  });

  test('returns the same strict preview shape for an eligible unassigned booking detail', async () => {
    const accessQuery = selectLeanQuery(previewSource());
    mockBookingFindById.mockReturnValue(accessQuery.query);

    const response = await request(buildApp())
      .get(`/api/counsellors/me/bookings/${BOOKING_ID}`)
      .expect(200);

    expect(response.body.data.booking).toEqual(expectedPreview);
    expect(mockBookingFindById).toHaveBeenCalledTimes(1);

    const projection = accessQuery.select.mock.calls[0][0];
    expectEligibilityProjection(projection);
    expect(projection).not.toMatch(/\buser\b|concerns|symptoms|goals|emergency|notes|statusHistory|videoCall|razorpay/i);
  });

  test.each([
    ['the pending list', 'get', '/api/counsellors/me/bookings/pending'],
    ['booking acceptance', 'post', `/api/counsellors/me/bookings/${BOOKING_ID}/accept`],
  ])('denies an unverified counsellor access to %s', async (_label, method, path) => {
    mockCounsellorFindOne.mockResolvedValue(eligibleCounsellor({
      isVerified: false,
      status: 'pending',
    }));

    const response = await request(buildApp())[method](path).expect(403);

    expect(response.body).toMatchObject({
      success: false,
      code: 'COUNSELLOR_MARKETPLACE_ACCESS_DENIED',
    });
    expect(mockBookingFind).not.toHaveBeenCalled();
    expect(mockBookingFindById).not.toHaveBeenCalled();
  });

  test.each([
    ['profile image', { profileImage: '' }],
    ['voice introduction', { voiceIntroUrl: null }],
  ])('denies marketplace access when the counsellor is missing a %s', async (_label, overrides) => {
    mockCounsellorFindOne.mockResolvedValue(eligibleCounsellor(overrides));

    const response = await request(buildApp())
      .get('/api/counsellors/me/bookings/pending')
      .expect(403);

    expect(response.body.code).toBe('COUNSELLOR_MARKETPLACE_ACCESS_DENIED');
    expect(mockBookingFind).not.toHaveBeenCalled();
  });

  test.each([
    ['detail', 'get', 404],
    ['acceptance', 'post', 409],
  ])('denies known-ID %s access when the booking gender preference does not match', async (
    _label,
    method,
    expectedStatus
  ) => {
    const mismatchedBooking = validPaymentBooking({
      preferences: { gender: 'male' },
    });
    const bookingQuery = method === 'get'
      ? selectLeanQuery(mismatchedBooking)
      : { query: selectQuery(mismatchedBooking) };
    mockBookingFindById.mockReturnValue(bookingQuery.query);

    const response = await request(buildApp())[method](
      `/api/counsellors/me/bookings/${BOOKING_ID}${method === 'post' ? '/accept' : ''}`
    ).expect(expectedStatus);

    expect(response.body.success).toBe(false);
    if (method === 'get') {
      expect(response.body.message).toBe('Booking not found');
    } else {
      expect(response.body.code).toBe('BOOKING_NOT_ACCEPTABLE');
    }
    expectEligibilityProjection(bookingQuery.query.select.mock.calls[0][0]);
    expect(mockBookingFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test('returns assigned PII only to the counsellor who owns the authorized booking', async () => {
    const assignedAt = '2026-01-01T08:05:00.000Z';
    const assignedBooking = validPaymentBooking({
      counsellor: COUNSELLOR_ID,
      assignedAt,
      user: {
        _id: USER_ID,
        firstName: 'Private',
        lastName: 'Person',
        email: 'private@example.test',
        phone: '+919999999999',
        profileImage: 'https://media.example.test/private.jpg',
        gender: 'female',
      },
      symptoms: ['insomnia'],
      concerns: ['panic attacks'],
      goals: ['private clinical goal'],
      emergencyContact: { name: 'Family Member', phone: '+918888888888' },
      videoCall: { roomUrl: 'https://call.example.test/assigned-room' },
    });
    mockBookingFindById.mockReturnValue(selectLeanQuery(assignedBooking).query);
    const fullBookingQuery = populateLeanQuery(assignedBooking);
    mockBookingFindOne.mockReturnValue(fullBookingQuery.query);

    const response = await request(buildApp())
      .get(`/api/counsellors/me/bookings/${BOOKING_ID}`)
      .expect(200);

    expect(response.body.data.booking).toMatchObject({
      accessScope: 'assigned',
      id: BOOKING_ID,
      userName: 'Private Person',
      userEmail: 'private@example.test',
      userPhone: '+919999999999',
      symptoms: ['insomnia'],
      concerns: ['panic attacks'],
      goals: ['private clinical goal'],
      emergencyContact: { name: 'Family Member', phone: '+918888888888' },
    });

    const fullQuery = mockBookingFindOne.mock.calls[0][0];
    expect(fullQuery).toEqual(expect.objectContaining({
      _id: BOOKING_ID,
      counsellor: COUNSELLOR_ID,
      $or: expect.any(Array),
    }));
    expect(fullQuery.$or[0].$expr).toEqual({
      $and: expect.arrayContaining([
        { $eq: ['$bookingAuthorization.reference', '$paymentId'] },
        { $eq: ['$amountMinor', '$pricing.listAmountMinor'] },
      ]),
    });
    expect(fullBookingQuery.populate).toHaveBeenCalledWith({
      path: 'user',
      select: 'firstName lastName email phone profileImage gender',
    });
  });

  test('hides an assigned booking from another counsellor without loading its full record', async () => {
    mockBookingFindById.mockReturnValue(selectLeanQuery(validPaymentBooking({
      counsellor: SECOND_COUNSELLOR_ID,
    })).query);

    const response = await request(buildApp())
      .get(`/api/counsellors/me/bookings/${BOOKING_ID}`)
      .expect(404);

    expect(response.body).toMatchObject({
      success: false,
      message: 'Booking not found',
    });
    expect(mockBookingFindOne).not.toHaveBeenCalled();
  });

  test('hides a known unassigned booking detail from an unverified counsellor', async () => {
    mockCounsellorFindOne.mockResolvedValue(eligibleCounsellor({
      isVerified: false,
      status: 'pending',
    }));
    mockBookingFindById.mockReturnValue(selectLeanQuery(validPaymentBooking()).query);

    const response = await request(buildApp())
      .get(`/api/counsellors/me/bookings/${BOOKING_ID}`)
      .expect(404);

    expect(response.body.message).toBe('Booking not found');
    expect(mockBookingFindOne).not.toHaveBeenCalled();
  });

  test('hides assigned client data after counsellor approval is revoked', async () => {
    mockCounsellorFindOne.mockResolvedValue(eligibleCounsellor({
      isVerified: false,
      status: 'rejected',
    }));
    mockBookingFindById.mockReturnValue(selectLeanQuery(validPaymentBooking({
      counsellor: COUNSELLOR_ID,
    })).query);

    const response = await request(buildApp())
      .get(`/api/counsellors/me/bookings/${BOOKING_ID}`)
      .expect(404);

    expect(response.body.message).toBe('Booking not found');
    expect(mockBookingFindOne).not.toHaveBeenCalled();
  });

  test.each([
    [
      'unpaid',
      () => validPaymentBooking({
        paymentStatus: 'pending',
        bookingAuthorization: { kind: 'payment', status: 'pending' },
      }),
    ],
    ['refunded', () => validPaymentBooking({ paymentStatus: 'refunded' })],
    ['cancelled', () => validPaymentBooking({ status: 'cancelled' })],
    ['expired by booking status', () => validPaymentBooking({ status: 'expired' })],
    ['completed terminal', () => validPaymentBooking({ status: 'completed' })],
    ['past its scheduled time', () => validPaymentBooking({ scheduledAt: '2020-01-01T00:00:00.000Z' })],
    [
      'malformed subscription entitlement window',
      () => validSubscriptionBooking({
        bookingAuthorization: {
          kind: 'subscription_entitlement',
          status: 'authorized',
          reference: 'monthly:2025-01-01T00:00:00.000Z',
          authorizedAt: '2025-03-01T00:00:00.000Z',
          validUntil: '2025-02-01T00:00:00.000Z',
        },
      }),
    ],
  ])('rejects a %s booking before the atomic acceptance update', async (_label, bookingFactory) => {
    mockBookingFindById.mockReturnValue(selectQuery(bookingFactory()));

    const response = await request(buildApp())
      .post(`/api/counsellors/me/bookings/${BOOKING_ID}/accept`)
      .expect(409);

    expect(response.body).toMatchObject({
      success: false,
      code: 'BOOKING_NOT_ACCEPTABLE',
    });
    expect(mockBookingFindOne).not.toHaveBeenCalled();
    expect(mockBookingFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each(['cancelled', 'completed', 'no-show', 'expired'])(
    'rejects a same-counsellor retry for terminal status %s without changing assignedAt',
    async (status) => {
      const assignedAt = '2026-01-01T08:05:00.000Z';
      mockBookingFindById.mockReturnValue(selectQuery(validPaymentBooking({
        counsellor: COUNSELLOR_ID,
        status,
        assignedAt,
      })));

      const response = await request(buildApp())
        .post(`/api/counsellors/me/bookings/${BOOKING_ID}/accept`)
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        code: 'BOOKING_NOT_ACCEPTABLE',
      });
      expect(mockBookingFindOneAndUpdate).not.toHaveBeenCalled();
    }
  );

  test('denies rescheduling after counsellor professional approval is revoked', async () => {
    mockCounsellorFindOne.mockResolvedValue(eligibleCounsellor({
      isVerified: false,
      status: 'rejected',
    }));

    const response = await request(buildApp())
      .put(`/api/counsellors/me/bookings/${BOOKING_ID}/schedule`)
      .send({ scheduledAt: '2099-01-16T12:00:00.000Z' })
      .expect(403);

    expect(response.body.code).toBe('COUNSELLOR_ASSIGNED_ACCESS_DENIED');
    expect(mockBookingFindOne).not.toHaveBeenCalled();
    expect(mockBookingFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each([
    'refunded or revoked booking',
    'booking owned by another counsellor',
  ])('hides a %s from the reschedule endpoint', async () => {
    const authorizedRead = selectLeanQuery(null);
    mockBookingFindOne.mockReturnValueOnce(authorizedRead.query);

    await request(buildApp())
      .put(`/api/counsellors/me/bookings/${BOOKING_ID}/schedule`)
      .send({ scheduledAt: '2099-01-16T12:00:00.000Z' })
      .expect(404);

    const readPredicate = mockBookingFindOne.mock.calls[0][0];
    expect(readPredicate).toEqual(expect.objectContaining({
      _id: BOOKING_ID,
      counsellor: COUNSELLOR_ID,
      status: { $in: ['pending', 'confirmed'] },
      $or: expect.any(Array),
    }));
    expect(readPredicate.$or[0]).toEqual(expect.objectContaining({
      paymentStatus: 'paid',
      'bookingAuthorization.status': 'authorized',
    }));
    expect(authorizedRead.select).toHaveBeenCalledWith(
      '_id user counsellor status sessionDuration scheduledAt'
    );
    expect(mockBookingFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test('reschedules with an ownership, authorization, state, and old-time CAS predicate', async () => {
    const assignedBooking = validPaymentBooking({
      counsellor: COUNSELLOR_ID,
      scheduledAt: new Date(FUTURE_DATE),
    });
    const authorizedRead = selectLeanQuery(assignedBooking);
    mockBookingFindOne
      .mockReturnValueOnce(authorizedRead.query)
      .mockResolvedValueOnce(null);
    mockBookingFindOneAndUpdate.mockResolvedValue({
      _id: BOOKING_ID,
      user: USER_ID,
      scheduledAt: new Date('2099-01-16T12:00:00.000Z'),
    });

    const response = await request(buildApp())
      .put(`/api/counsellors/me/bookings/${BOOKING_ID}/schedule`)
      .send({ scheduledAt: '2099-01-16T12:00:00.000Z' })
      .expect(200);

    expect(response.body.data.booking).toEqual({
      id: BOOKING_ID,
      scheduledAt: '2099-01-16T12:00:00.000Z',
    });
    expect(mockBookingFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: BOOKING_ID,
        counsellor: COUNSELLOR_ID,
        scheduledAt: new Date(FUTURE_DATE),
        status: { $in: ['pending', 'confirmed'] },
        $or: expect.any(Array),
      }),
      { $set: { scheduledAt: new Date('2099-01-16T12:00:00.000Z') } },
      {
        new: true,
        runValidators: true,
        projection: '_id user scheduledAt',
      }
    );
  });

  test('simulates route-level CAS with one winner for two distinct counsellors', async () => {
    mockBookingFindById.mockImplementation(() => selectQuery(validPaymentBooking()));
    mockBookingFindOne.mockResolvedValue(null);
    mockCounsellorFindOne.mockImplementation(async ({ user }) => eligibleCounsellor({
      _id: user === SECOND_USER_ID ? SECOND_COUNSELLOR_ID : COUNSELLOR_ID,
      user,
    }));

    let claimed = false;
    mockBookingFindOneAndUpdate.mockImplementation(async (_query, update) => {
      if (claimed) return null;
      claimed = true;
      return validPaymentBooking({
        ...update.$set,
        user: USER_ID,
      });
    });

    const app = buildApp();
    const responses = await Promise.all([
      request(app)
        .post(`/api/counsellors/me/bookings/${BOOKING_ID}/accept`)
        .set('x-test-user-id', USER_ID),
      request(app)
        .post(`/api/counsellors/me/bookings/${BOOKING_ID}/accept`)
        .set('x-test-user-id', SECOND_USER_ID),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(mockBookingFindOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(mockCounsellorFindOne).toHaveBeenCalledWith({ user: USER_ID });
    expect(mockCounsellorFindOne).toHaveBeenCalledWith({ user: SECOND_USER_ID });

    const overlapCounsellorIds = [];
    for (const [overlapQuery] of mockBookingFindOne.mock.calls) {
      overlapCounsellorIds.push(overlapQuery.counsellor);
      expect(overlapQuery).toEqual({
        counsellor: expect.any(String),
        scheduledAt: { $lt: new Date('2099-01-15T10:45:00.000Z') },
        status: { $in: ['pending', 'confirmed', 'in-progress'] },
        _id: { $ne: BOOKING_ID },
        $expr: {
          $gt: [
            {
              $add: [
                '$scheduledAt',
                { $multiply: ['$sessionDuration', 60 * 1000] },
              ],
            },
            new Date(FUTURE_DATE),
          ],
        },
      });
    }
    expect(overlapCounsellorIds.sort()).toEqual([
      COUNSELLOR_ID,
      SECOND_COUNSELLOR_ID,
    ]);

    for (const result of mockBookingFindById.mock.results) {
      expectEligibilityProjection(result.value.select.mock.calls[0][0]);
    }

    const assignedCounsellorIds = [];
    for (const [atomicQuery, update, options] of mockBookingFindOneAndUpdate.mock.calls) {
      expect(atomicQuery._id).toBe(BOOKING_ID);
      expectAuthorizedMarketplacePredicate(atomicQuery);
      expect(update.$set).toEqual({
        counsellor: expect.any(String),
        assignedAt: expect.any(Date),
        status: 'confirmed',
      });
      assignedCounsellorIds.push(update.$set.counsellor);
      expect(options).toEqual({ new: true, runValidators: true });
    }

    expect(assignedCounsellorIds.sort()).toEqual([
      COUNSELLOR_ID,
      SECOND_COUNSELLOR_ID,
    ]);
  });
});
