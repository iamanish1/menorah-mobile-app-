const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../../models/User');
const { adminAuth } = require('../../middleware/auth');
const {
  requirePrivacyReader,
} = require('../../middleware/privacyAuthorization');
const {
  enforcePrivacyAdminPermissionAuthority,
} = require('../privacyAdminPermissionAuthority');
const { signAdminToken } = require('../../utils/authTokens');

const TEST_URI = process.env.PRIVACY_PERMISSION_AUTHORITY_TEST_URI;
const describeWithMongo = TEST_URI ? describe : describe.skip;

jest.setTimeout(30000);

const allPermissions = [
  'privacy_reader',
  'privacy_reviewer',
  'privacy_legal_hold',
];

const userFields = (suffix) => ({
  email: `privacy-authority-${suffix}@example.test`,
  phone: `+1555030${String(suffix).padStart(4, '0')}`,
  password: 'AuthorityPass123',
  firstName: 'Privacy',
  lastName: `Admin${suffix}`,
  dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
  gender: 'prefer-not-to-say',
  role: 'admin',
  isActive: true,
  sessionVersion: 0,
});

const grantMap = (adminId) => JSON.stringify([{
  adminId: String(adminId),
  permissions: allPermissions,
}]);
const ADMIN_ORIGIN = 'https://privacy-admin.example.test';

const buildApp = () => {
  const app = express();
  app.get(
    '/privacy-reader-probe',
    adminAuth,
    requirePrivacyReader,
    (_req, res) => res.json({ success: true })
  );
  return app;
};

describeWithMongo('privacy admin permission authority on isolated MongoDB', () => {
  const originalEnv = {};

  beforeAll(async () => {
    const parsed = new URL(TEST_URI);
    const databaseName = parsed.pathname.replace(/^\//, '');
    if (!/^menorah_privacy_permission_authority_test(?:_|$)/.test(databaseName)) {
      throw new Error(
        'PRIVACY_PERMISSION_AUTHORITY_TEST_URI must name a disposable '
        + 'menorah_privacy_permission_authority_test* database.'
      );
    }
    for (const key of [
      'BCRYPT_ROUNDS',
      'JWT_SECRET',
      'NODE_ENV',
      'PRIVACY_ADMIN_PERMISSION_GRANTS_JSON',
      'WEB_SESSION_ORIGINS',
    ]) {
      originalEnv[key] = process.env[key];
    }
    process.env.BCRYPT_ROUNDS = '4';
    process.env.JWT_SECRET = 'privacy-authority-test-jwt-secret-'.repeat(3);
    process.env.NODE_ENV = 'test';
    process.env.WEB_SESSION_ORIGINS = `${ADMIN_ORIGIN}=admin`;
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await User.createIndexes();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('replaces A with B for already-issued sessions and leaves no persisted grant', async () => {
    const [adminA, adminB] = await User.create([
      userFields(1),
      userFields(2),
    ]);
    await User.collection.updateMany({}, {
      $set: { privacyPermissions: allPermissions },
    });
    process.env.PRIVACY_ADMIN_PERMISSION_GRANTS_JSON = grantMap(adminA._id);
    await enforcePrivacyAdminPermissionAuthority();

    const tokenA = signAdminToken(adminA);
    const tokenB = signAdminToken(adminB);
    const app = buildApp();
    const useSession = (token) => request(app)
      .get('/privacy-reader-probe')
      .set('Origin', ADMIN_ORIGIN)
      .set('Cookie', `__Host-menorah-admin=${token}`);

    await useSession(tokenA).expect(200);
    await useSession(tokenB).expect(403);

    process.env.PRIVACY_ADMIN_PERMISSION_GRANTS_JSON = grantMap(adminB._id);

    const revokedA = await useSession(tokenA).expect(403);
    expect(revokedA.body.code).toBe('PRIVACY_PERMISSION_REQUIRED');
    await useSession(tokenB).expect(200);

    await User.collection.updateOne(
      { _id: adminA._id },
      { $set: { privacyPermissions: allPermissions } }
    );
    await useSession(tokenA).expect(403);

    const reconciliation = await enforcePrivacyAdminPermissionAuthority();
    expect(reconciliation).toEqual({
      configuredAdminCount: 1,
      removedPersistedFields: 1,
    });
    expect(await User.collection.countDocuments({
      privacyPermissions: { $exists: true },
    })).toBe(0);
  });
});
