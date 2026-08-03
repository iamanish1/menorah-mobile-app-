const express = require('express');
const request = require('supertest');
const {
  installCounsellorVerificationTestConfig,
  withCurrentProfessionalApproval,
} = require('../../testUtils/counsellorVerification');

installCounsellorVerificationTestConfig();

const counsellorUserId = '64f000000000000000000001';
const counsellorId = '64f000000000000000000010';
const bookingId = '64f000000000000000000020';
const patientId = '64f000000000000000000030';

const mockCounsellorFindOne = jest.fn();
const mockBookingFindOne = jest.fn();
const mockBookingFindById = jest.fn();
const mockBookingFind = jest.fn();
const mockBookingCountDocuments = jest.fn();

jest.mock('../../middleware/auth', () => ({
  counsellorAuth: (req, _res, next) => {
    req.user = {
      _id: counsellorUserId,
      role: 'counsellor',
      gender: 'female',
      isActive: true,
    };
    next();
  },
}));

jest.mock('../../models/Counsellor', () => ({
  findOne: (...args) => mockCounsellorFindOne(...args),
}));

jest.mock('../../models/Booking', () => ({
  findOne: (...args) => mockBookingFindOne(...args),
  findById: (...args) => mockBookingFindById(...args),
  find: (...args) => mockBookingFind(...args),
  countDocuments: (...args) => mockBookingCountDocuments(...args),
}));

jest.mock('../../models/User', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock('../../utils/cloudinary', () => ({
  uploadBuffer: jest.fn(),
  deleteResource: jest.fn(),
}));

jest.mock('../../config/redis', () => ({
  getRedisClient: () => ({
    scan: jest.fn().mockResolvedValue({ cursor: '0', keys: [] }),
    del: jest.fn(),
  }),
}));

const counsellorRouter = require('../counsellor-bookings');

const buildQuery = (result) => {
  const query = {};
  ['select', 'populate', 'sort', 'skip', 'limit'].forEach((method) => {
    query[method] = jest.fn(() => query);
  });
  query.lean = jest.fn().mockResolvedValue(result);
  return query;
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/counsellors', counsellorRouter);
  return app;
};

const currentEmergencyContact = {
  name: 'Maya Rao',
  relationship: 'Sister',
  phone: '+971501234567',
};

const legacyBookingContact = {
  name: 'Legacy Contact',
  relationship: 'Friend',
  phone: '+971509999999',
};

const makeBooking = (overrides = {}) => ({
  _id: bookingId,
  user: {
    _id: patientId,
    firstName: 'Asha',
    lastName: 'Patient',
    email: 'asha@example.com',
    phone: '+971501111111',
    emergencyContact: currentEmergencyContact,
  },
  counsellor: counsellorId,
  status: 'confirmed',
  paymentStatus: 'paid',
  paymentMethod: 'razorpay',
  paymentId: 'pay_test_123',
  razorpayOrderId: 'order_test_123',
  transactionId: 'order_test_123',
  orderStatus: 'paid',
  amountMinor: 100000,
  pricing: { listAmountMinor: 100000, currency: 'INR' },
  bookingAuthorization: {
    kind: 'payment',
    status: 'authorized',
    reference: 'pay_test_123',
    authorizedAt: new Date(),
  },
  sessionType: 'video',
  sessionDuration: 60,
  scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
  amount: 1000,
  currency: 'INR',
  emergencyContact: legacyBookingContact,
  ...overrides,
});

describe('counsellor emergency-contact access', () => {
  beforeEach(() => {
    mockCounsellorFindOne.mockReset().mockResolvedValue(withCurrentProfessionalApproval({
      _id: counsellorId,
      user: counsellorUserId,
      isActive: true,
      isAvailable: true,
      status: 'approved',
      profileImage: 'https://cdn.example.com/counsellor.jpg',
      voiceIntroUrl: 'https://cdn.example.com/intro.webm',
    }));
    mockBookingFindOne.mockReset();
    mockBookingFindById.mockReset();
    mockBookingFind.mockReset();
    mockBookingCountDocuments.mockReset().mockResolvedValue(0);
  });

  test('returns the current user profile contact in an assigned booking detail', async () => {
    const assignedQuery = buildQuery(makeBooking());
    mockBookingFindById.mockReturnValueOnce(buildQuery(makeBooking()));
    mockBookingFindOne.mockReturnValueOnce(assignedQuery);

    const response = await request(buildApp())
      .get(`/api/counsellors/me/bookings/${bookingId}`)
      .expect(200);

    expect(mockBookingFindOne).toHaveBeenCalledWith(expect.objectContaining({
      _id: bookingId,
      counsellor: counsellorId,
      $or: expect.any(Array),
    }));
    expect(assignedQuery.populate).toHaveBeenCalledWith(expect.objectContaining({
      path: 'user',
      select: expect.stringContaining('emergencyContact'),
    }));
    expect(assignedQuery.select).toHaveBeenCalledWith('-emergencyContact');
    expect(response.body.data.booking.emergencyContact).toEqual(currentEmergencyContact);
    expect(response.body.data.booking.emergencyContact).not.toEqual(legacyBookingContact);
  });

  test('does not load or return emergency contact for an unassigned booking detail', async () => {
    const unassignedQuery = buildQuery(makeBooking({ counsellor: null }));
    mockBookingFindById.mockReturnValueOnce(unassignedQuery);

    const response = await request(buildApp())
      .get(`/api/counsellors/me/bookings/${bookingId}`)
      .expect(200);

    expect(mockBookingFindOne).not.toHaveBeenCalled();
    expect(response.body.data.booking).not.toHaveProperty('emergencyContact');
  });

  test('returns no booking data when the booking belongs to another counsellor', async () => {
    mockBookingFindById.mockReturnValue(buildQuery(makeBooking({
      counsellor: '64f000000000000000000099',
    })));

    const response = await request(buildApp())
      .get(`/api/counsellors/me/bookings/${bookingId}`)
      .expect(404);

    expect(response.body).not.toHaveProperty('data');
    expect(JSON.stringify(response.body)).not.toContain(currentEmergencyContact.phone);
  });

  test.each([
    ['/api/counsellors/me/bookings/pending', { counsellor: null }],
    ['/api/counsellors/me/bookings', { counsellor: counsellorId }],
  ])('omits emergency contact from the bulk response at %s', async (url, overrides) => {
    const listQuery = buildQuery([makeBooking(overrides)]);
    mockBookingFind.mockReturnValue(listQuery);
    mockBookingCountDocuments.mockResolvedValue(1);

    const response = await request(buildApp())
      .get(url)
      .expect(200);

    expect(response.body.data.bookings).toHaveLength(1);
    expect(response.body.data.bookings[0]).not.toHaveProperty('emergencyContact');
    if (url.endsWith('/pending')) {
      const projection = listQuery.select.mock.calls[0][0];
      expect(projection).not.toMatch(/emergencyContact|\buser\b/);
    } else {
      expect(listQuery.select).toHaveBeenCalledWith('-emergencyContact');
    }
    expect(JSON.stringify(response.body)).not.toContain(currentEmergencyContact.phone);
    expect(JSON.stringify(response.body)).not.toContain(legacyBookingContact.phone);
  });
});
