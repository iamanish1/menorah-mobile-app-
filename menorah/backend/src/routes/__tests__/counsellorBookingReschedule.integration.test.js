const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const {
  TEST_COUNSELLOR_CREDENTIAL_POLICY_VERSION,
  TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
  installCounsellorVerificationTestConfig,
} = require('../../testUtils/counsellorVerification');

installCounsellorVerificationTestConfig();

const Booking = require('../../models/Booking');
const Counsellor = require('../../models/Counsellor');
const User = require('../../models/User');

let mockAuthenticatedCounsellor;

jest.mock('../../middleware/auth', () => ({
  counsellorAuth: (req, _res, next) => {
    req.user = mockAuthenticatedCounsellor;
    next();
  },
}));

jest.mock('../../utils/cloudinary', () => ({
  uploadBuffer: jest.fn(),
  deleteResource: jest.fn(),
}));

jest.mock('../../utils/bankAccountEncryption', () => ({
  encryptBankAccountNumber: jest.fn(),
}));

const counsellorBookingsRouter = require('../counsellor-bookings');

const BASE_TEST_URI = process.env.KYC_MIGRATION_TEST_URI;
const describeWithMongo = BASE_TEST_URI ? describe : describe.skip;

jest.setTimeout(90000);

const buildDisposableSuiteUri = (baseUri) => {
  const parsed = new URL(baseUri);
  const databaseName = parsed.pathname.replace(/^\//, '');
  if (!/^menorah_kyc_migration_test(?:_|$)/.test(databaseName)) {
    throw new Error(
      'KYC_MIGRATION_TEST_URI must name a disposable '
      + 'menorah_kyc_migration_test* database.'
    );
  }

  parsed.pathname = `/menorah_kyc_migration_test_reschedule_${process.pid}`;
  return parsed.toString();
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/counsellors', counsellorBookingsRouter);
  return app;
};

const futureUtcTime = (daysFromNow, hour, minute = 0) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + daysFromNow);
  value.setUTCHours(hour, minute, 0, 0);
  return value;
};

const allWeekAvailability = () => Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map((day) => [day, {
      isAvailable: true,
      start: '00:00',
      end: '23:59',
    }])
);

const authorizedBooking = ({
  _id,
  user,
  counsellor,
  scheduledAt,
  reference,
  now,
}) => ({
  _id,
  user,
  counsellor,
  sessionType: 'video',
  sessionDuration: 60,
  scheduledAt,
  timezone: 'UTC',
  status: 'confirmed',
  amount: 1000,
  amountMinor: 100000,
  currency: 'INR',
  pricing: {
    source: 'counsellor_rate',
    listAmount: 1000,
    listAmountMinor: 100000,
    currency: 'INR',
    resolvedAt: now,
  },
  paymentStatus: 'paid',
  paymentMethod: 'razorpay',
  bookingAuthorization: {
    kind: 'payment',
    status: 'authorized',
    reference,
    authorizedAt: new Date(now.getTime() - 60 * 1000),
  },
  paymentId: reference,
  razorpayOrderId: `order_${reference}`,
  transactionId: `order_${reference}`,
  orderStatus: 'paid',
  isSubscriptionBooking: false,
  createdAt: now,
  updatedAt: now,
});

const seedConcurrentRescheduleGraph = async () => {
  const now = new Date();
  const counsellorUserId = new mongoose.Types.ObjectId();
  const counsellorId = new mongoose.Types.ObjectId();
  const applicationId = new mongoose.Types.ObjectId();
  const reviewerId = new mongoose.Types.ObjectId();
  const evidenceId = new mongoose.Types.ObjectId();
  const firstBookingId = new mongoose.Types.ObjectId();
  const secondBookingId = new mongoose.Types.ObjectId();
  const firstClientId = new mongoose.Types.ObjectId();
  const secondClientId = new mongoose.Types.ObjectId();
  const approvedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  await User.collection.insertOne({
    _id: counsellorUserId,
    email: 'reschedule-integration@example.org',
    phone: '+971501234500',
    password: 'not-used-by-this-integration-test',
    firstName: 'Reschedule',
    lastName: 'Counsellor',
    dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    gender: 'prefer-not-to-say',
    role: 'counsellor',
    isActive: true,
    sessionVersion: 0,
    marketplaceAssignmentFence: 0,
    createdAt: approvedAt,
    updatedAt: approvedAt,
  });
  await Counsellor.collection.insertOne({
    _id: counsellorId,
    user: counsellorUserId,
    licenseNumber: 'RESCHEDULE-INTEGRATION-LICENSE',
    specialization: 'Integration testing',
    specializations: ['Integration testing'],
    experience: 8,
    bio: 'A production-shaped counsellor profile used for reschedule concurrency testing.',
    languages: ['English'],
    hourlyRate: 1000,
    currency: 'INR',
    timezone: 'UTC',
    availability: allWeekAvailability(),
    status: 'approved',
    isVerified: true,
    isActive: true,
    isAvailable: true,
    professionalVerification: {
      application: applicationId,
      onboardingConsent: {
        accepted: true,
        version: TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
        acceptedAt: approvedAt,
        source: 'counsellor_web_registration',
      },
      credentialReview: {
        decision: 'approved',
        policyVersion: TEST_COUNSELLOR_CREDENTIAL_POLICY_VERSION,
        evidenceIds: [evidenceId],
        reviewedBy: reviewerId,
        reviewedAt: approvedAt,
      },
      approvedBy: reviewerId,
      approvedAt,
      expiresAt: futureUtcTime(365, 0),
      legacyReviewRequired: false,
      schemaVersion: 1,
      marketplaceAssignmentFence: 0,
      statusHistory: [],
    },
    createdAt: approvedAt,
    updatedAt: approvedAt,
  });

  const firstOriginalTime = futureUtcTime(2, 8);
  const secondOriginalTime = futureUtcTime(2, 14);
  await Booking.collection.insertMany([
    authorizedBooking({
      _id: firstBookingId,
      user: firstClientId,
      counsellor: counsellorId,
      scheduledAt: firstOriginalTime,
      reference: 'pay_reschedule_first',
      now,
    }),
    authorizedBooking({
      _id: secondBookingId,
      user: secondClientId,
      counsellor: counsellorId,
      scheduledAt: secondOriginalTime,
      reference: 'pay_reschedule_second',
      now,
    }),
  ]);

  mockAuthenticatedCounsellor = {
    _id: counsellorUserId.toString(),
    firstName: 'Reschedule',
    lastName: 'Counsellor',
    gender: 'prefer-not-to-say',
    role: 'counsellor',
    isActive: true,
  };

  return {
    counsellorId,
    counsellorUserId,
    firstBookingId,
    firstOriginalTime,
    secondBookingId,
    secondOriginalTime,
    firstRequestedTime: futureUtcTime(4, 10),
    secondRequestedTime: futureUtcTime(4, 10, 30),
  };
};

describeWithMongo(
  'counsellor booking reschedule transactions on MongoDB 7 replica set',
  () => {
    let app;

    beforeAll(async () => {
      await mongoose.connect(buildDisposableSuiteUri(BASE_TEST_URI), {
        autoCreate: false,
        autoIndex: false,
        serverSelectionTimeoutMS: 10000,
      });

      const admin = mongoose.connection.db.admin();
      const [buildInfo, hello] = await Promise.all([
        admin.command({ buildInfo: 1 }),
        admin.command({ hello: 1 }),
      ]);
      if (Number(buildInfo.versionArray?.[0]) !== 7) {
        throw new Error(
          `KYC reschedule integration tests require MongoDB 7; received ${buildInfo.version}.`
        );
      }
      if (typeof hello.setName !== 'string' || hello.setName.length === 0) {
        throw new Error(
          'KYC reschedule integration tests require a MongoDB replica set.'
        );
      }

      await mongoose.connection.dropDatabase();
      app = buildApp();
    });

    beforeEach(async () => {
      await Promise.all([
        Booking.collection.deleteMany({}),
        Counsellor.collection.deleteMany({}),
        User.collection.deleteMany({}),
      ]);
    });

    afterAll(async () => {
      if (mongoose.connection.readyState !== 0) {
        try {
          await mongoose.connection.dropDatabase();
        } finally {
          await mongoose.disconnect();
        }
      }
    });

    test('serializes distinct non-identical overlapping reschedules with one committed winner', async () => {
      const graph = await seedConcurrentRescheduleGraph();
      const originalFenceWrite = Counsellor.findOneAndUpdate.bind(Counsellor);
      let initialFenceArrivals = 0;
      let releaseInitialFenceWrites;
      const initialFenceBarrier = new Promise((resolve) => {
        releaseInitialFenceWrites = resolve;
      });
      const fenceSpy = jest
        .spyOn(Counsellor, 'findOneAndUpdate')
        .mockImplementation(async (...args) => {
          initialFenceArrivals += 1;
          if (initialFenceArrivals <= 2) {
            if (initialFenceArrivals === 2) releaseInitialFenceWrites();
            await initialFenceBarrier;
          }
          return originalFenceWrite(...args);
        });

      let responses;
      try {
        responses = await Promise.all([
          request(app)
            .put(`/api/counsellors/me/bookings/${graph.firstBookingId}/schedule`)
            .send({ scheduledAt: graph.firstRequestedTime.toISOString() }),
          request(app)
            .put(`/api/counsellors/me/bookings/${graph.secondBookingId}/schedule`)
            .send({ scheduledAt: graph.secondRequestedTime.toISOString() }),
        ]);
      } finally {
        fenceSpy.mockRestore();
      }

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
      expect(
        responses.find(({ status }) => status === 409)?.body
      ).toEqual(expect.objectContaining({
        success: false,
        code: 'COUNSELLOR_SCHEDULE_CONFLICT',
      }));
      expect(initialFenceArrivals).toBeGreaterThanOrEqual(3);

      const [firstBooking, secondBooking, counsellor, counsellorUser] = await Promise.all([
        Booking.findById(graph.firstBookingId).lean(),
        Booking.findById(graph.secondBookingId).lean(),
        Counsellor.findById(graph.counsellorId).lean(),
        User.findById(graph.counsellorUserId).lean(),
      ]);
      const firstWon = firstBooking.scheduledAt.getTime()
        === graph.firstRequestedTime.getTime();
      const secondWon = secondBooking.scheduledAt.getTime()
        === graph.secondRequestedTime.getTime();

      expect([firstWon, secondWon].filter(Boolean)).toHaveLength(1);
      expect(firstBooking.scheduledAt).toEqual(
        firstWon ? graph.firstRequestedTime : graph.firstOriginalTime
      );
      expect(secondBooking.scheduledAt).toEqual(
        secondWon ? graph.secondRequestedTime : graph.secondOriginalTime
      );
      expect(counsellor.professionalVerification.marketplaceAssignmentFence)
        .toBe(1);
      expect(counsellorUser.marketplaceAssignmentFence).toBe(1);
    });
  }
);
