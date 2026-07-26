const { Mongoose, Types } = require('mongoose');
const {
  INDEX_PLANS,
  up,
} = require('../20260723-professional-verification-state-machine');

const TEST_URI = process.env.KYC_MIGRATION_TEST_URI;
const describeWithMongo = TEST_URI ? describe : describe.skip;
const NOW = new Date('2026-07-23T12:00:00.000Z');
const ids = Array.from(
  { length: 20 },
  (_, index) => new Types.ObjectId(
    `65f0000000000000000000${index.toString(16).padStart(2, '0')}`
  )
);

const canonicalize = (value) => {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (value && typeof value.toHexString === 'function') {
    return { $oid: value.toHexString() };
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value;
};

const snapshotCollection = async (collection) => (
  canonicalize(await collection.find({}).sort({ _id: 1 }).toArray())
);

const makeDbFacade = (database, overrides = {}, operationLog = []) => ({
  collection(collectionName) {
    const collection = database.collection(collectionName);
    return new Proxy(collection, {
      get(target, property) {
        const original = target[property];
        if (typeof original !== 'function') return original;
        return (...args) => {
          operationLog.push(`${collectionName}.${String(property)}`);
          const override = overrides[collectionName]?.[property];
          if (override) {
            return override({
              args,
              collection: target,
              original: original.bind(target),
            });
          }
          return original.apply(target, args);
        };
      },
    });
  },
});

const seedValidLegacy = async (database) => {
  await database.collection('users').insertMany([
    {
      _id: ids[0],
      email: 'approved-counsellor@example.org',
      phone: '+971500000001',
      role: 'counsellor',
      isActive: true,
      sessionVersion: 3,
      lastSessionRevokedAt: new Date('2026-05-01T10:00:00.000Z'),
    },
    {
      _id: ids[1],
      email: 'pending-counsellor@example.org',
      phone: '+971500000002',
      role: 'counsellor',
      isActive: true,
    },
  ]);
  await database.collection('counsellors').insertMany([
    {
      _id: ids[2],
      user: ids[0],
      licenseNumber: 'LEGACY-APPROVED',
      status: 'approved',
      isVerified: true,
      isActive: true,
      isAvailable: true,
      approvedBy: ids[10],
      approvedAt: new Date('2026-06-01T10:00:00.000Z'),
      verificationDocuments: [{
        _id: ids[11],
        type: 'license',
        url: 'private://legacy-license',
        verified: true,
      }],
    },
    {
      _id: ids[3],
      user: ids[1],
      licenseNumber: 'LEGACY-PENDING',
      status: 'pending',
      isVerified: false,
      isActive: true,
      isAvailable: false,
      verificationDocuments: [],
    },
  ]);
  await database.collection('pendingapplications').insertMany([
    {
      _id: ids[4],
      email: 'submitted@example.org',
      phone: '+971500000004',
      licenseNumber: 'APPLICATION-001',
      status: 'pending',
    },
    {
      _id: ids[5],
      email: 'reviewed@example.org',
      phone: '+971500000005',
      licenseNumber: 'APPLICATION-002',
      status: 'pending',
      reviewedBy: ids[10],
      reviewedAt: new Date('2026-06-02T10:00:00.000Z'),
    },
    {
      _id: ids[6],
      email: 'rejected@example.org',
      phone: '+971500000006',
      licenseNumber: 'APPLICATION-003',
      status: 'rejected',
      rejectionReason: 'Legacy decision',
      reviewedBy: ids[10],
      reviewedAt: new Date('2026-06-03T10:00:00.000Z'),
    },
  ]);
  await database.collection('kycverifications').insertOne({
    _id: ids[7],
    user: ids[0],
    status: 'verified',
    consentAccepted: true,
    consentVersion: 'ordinary-face-check-v1',
    providerRequestId: 'must-remain-untouched',
  });
};

const expectNoInventedCounsellorEvidence = (verification) => {
  [
    'application',
    'onboardingConsent',
    'credentialReview',
    'reviewStartedBy',
    'reviewStartedAt',
    'approvedBy',
    'approvedAt',
    'expiresAt',
    'reverificationInviteTokenHash',
    'reverificationInviteIssuedBy',
    'reverificationInviteIssuedAt',
    'reverificationInviteExpiresAt',
    'reverificationInviteConsentVersion',
  ].forEach((field) => expect(verification).not.toHaveProperty(field));
};

const expectNoInventedApplicationEvidence = (application) => {
  [
    'onboardingConsent',
    'credentialEvidence',
    'credentialReview',
    'reviewStartedBy',
    'reviewStartedAt',
    'decisionBy',
    'decisionAt',
    'verificationExpiresAt',
    'linkedUser',
    'linkedCounsellor',
    'reviewAccountSnapshot',
    'reverificationAuthorization',
  ].forEach((field) => expect(application).not.toHaveProperty(field));
};

describeWithMongo('professional-verification migration on isolated MongoDB', () => {
  let isolatedMongoose;
  let database;
  const mongooseWithDb = (db) => ({
    connection: {
      db,
      startSession: (...args) => isolatedMongoose.connection.startSession(...args),
    },
  });

  beforeAll(async () => {
    const parsed = new URL(TEST_URI);
    const databaseName = parsed.pathname.replace(/^\//, '');
    if (!/^menorah_kyc_migration_test(?:_|$)/.test(databaseName)) {
      throw new Error(
        'KYC_MIGRATION_TEST_URI must name a disposable '
        + 'menorah_kyc_migration_test* database.'
      );
    }

    isolatedMongoose = new Mongoose();
    await isolatedMongoose.connect(TEST_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    database = isolatedMongoose.connection.db;
  });

  beforeEach(async () => {
    await database.dropDatabase();
  });

  afterAll(async () => {
    if (isolatedMongoose) {
      await isolatedMongoose.connection.dropDatabase();
      await isolatedMongoose.disconnect();
    }
  });

  test('migrates fail closed, preserves legacy data, and reruns byte-identically', async () => {
    await seedValidLegacy(database);
    const kycBefore = await snapshotCollection(
      database.collection('kycverifications')
    );
    const originalApproved = await database.collection('counsellors').findOne({
      _id: ids[2],
    });

    await up({ mongoose: isolatedMongoose, now: NOW });

    const approved = await database.collection('counsellors').findOne({
      _id: ids[2],
    });
    const pending = await database.collection('counsellors').findOne({
      _id: ids[3],
    });
    expect(approved._id).toEqual(originalApproved._id);
    expect(approved.user).toEqual(originalApproved.user);
    expect(approved.verificationDocuments).toEqual(
      originalApproved.verificationDocuments
    );
    expect(approved.status).toBe('suspended');
    expect(approved.isActive).toBe(false);
    expect(approved.isAvailable).toBe(false);
    expect(approved.isVerified).toBe(false);
    expect(approved.professionalVerification.statusHistory).toHaveLength(1);
    expectNoInventedCounsellorEvidence(approved.professionalVerification);

    expect(pending.status).toBe('draft');
    expect(pending.isActive).toBe(false);
    expect(pending.isAvailable).toBe(false);
    expect(pending.isVerified).toBe(false);
    expectNoInventedCounsellorEvidence(pending.professionalVerification);

    const applications = await database.collection('pendingapplications')
      .find({})
      .sort({ _id: 1 })
      .toArray();
    expect(applications.map(({ status }) => status)).toEqual([
      'submitted',
      'under_review',
      'rejected',
    ]);
    applications.forEach(expectNoInventedApplicationEvidence);

    const migratedUsers = await database.collection('users')
      .find({})
      .sort({ _id: 1 })
      .toArray();
    expect(migratedUsers).toEqual([
      expect.objectContaining({
        _id: ids[0],
        isActive: false,
        sessionVersion: 4,
        lastSessionRevokedAt: NOW,
      }),
      expect.objectContaining({
        _id: ids[1],
        isActive: false,
        sessionVersion: 1,
        lastSessionRevokedAt: NOW,
      }),
    ]);
    expect(await snapshotCollection(database.collection('kycverifications')))
      .toEqual(kycBefore);

    const pendingIndexes = await database.collection('pendingapplications')
      .indexes();
    const counsellorIndexes = await database.collection('counsellors').indexes();
    expect(counsellorIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'user_1',
        key: { user: 1 },
        unique: true,
      }),
      expect.objectContaining({
        name: 'licenseNumber_1',
        key: { licenseNumber: 1 },
        unique: true,
      }),
      expect.objectContaining({
        name: 'counsellor_license_identity_unique_v1',
        key: { licenseNumber: 1 },
        unique: true,
        collation: expect.objectContaining({
          locale: 'en',
          strength: 2,
          normalization: true,
        }),
      }),
    ]));
    const historyIndex = pendingIndexes.find(
      ({ name }) => name === 'application_counsellor_history_v1'
    );
    expect(historyIndex).toBeTruthy();
    expect(historyIndex.unique).not.toBe(true);

    const counsellorsBeforeRerun = await snapshotCollection(
      database.collection('counsellors')
    );
    const applicationsBeforeRerun = await snapshotCollection(
      database.collection('pendingapplications')
    );
    const usersBeforeRerun = await snapshotCollection(
      database.collection('users')
    );
    const rerunLog = [];
    await up({
      mongoose: mongooseWithDb(makeDbFacade(database, {}, rerunLog)),
      now: new Date('2026-07-24T12:00:00.000Z'),
    });

    expect(rerunLog.some((entry) => entry.endsWith('.bulkWrite'))).toBe(false);
    expect(rerunLog.some((entry) => entry.endsWith('.createIndex'))).toBe(false);
    expect(await snapshotCollection(database.collection('counsellors')))
      .toEqual(counsellorsBeforeRerun);
    expect(await snapshotCollection(database.collection('pendingapplications')))
      .toEqual(applicationsBeforeRerun);
    expect(await snapshotCollection(database.collection('users')))
      .toEqual(usersBeforeRerun);
  });

  test('finishes every preflight read before the first write', async () => {
    await seedValidLegacy(database);
    const operationLog = [];

    await up({
      mongoose: mongooseWithDb(makeDbFacade(database, {}, operationLog)),
      now: NOW,
    });

    const firstWrite = operationLog.findIndex(
      (entry) => entry.endsWith('.bulkWrite') || entry.endsWith('.createIndex')
    );
    expect(firstWrite).toBeGreaterThan(-1);
    expect(operationLog.slice(0, firstWrite)).toEqual(
      expect.arrayContaining([
        'counsellors.findOne',
        'pendingapplications.findOne',
        'counsellors.indexes',
        'pendingapplications.indexes',
        'counsellors.aggregate',
        'pendingapplications.aggregate',
        'counsellors.find',
        'pendingapplications.find',
        'users.find',
      ])
    );
    expect(operationLog.slice(0, firstWrite).some(
      (entry) => entry.endsWith('.createIndex')
    )).toBe(false);
  });

  test('enforces normalized current identity uniqueness without blocking retained history', async () => {
    await seedValidLegacy(database);
    await up({ mongoose: isolatedMongoose, now: NOW });

    const pendingIndexes = await database.collection('pendingapplications')
      .indexes();
    const counsellorIndexes = await database.collection('counsellors')
      .indexes();
    expect(counsellorIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'licenseNumber_1',
        key: { licenseNumber: 1 },
        unique: true,
      }),
      expect.objectContaining({
        name: 'counsellor_license_identity_unique_v1',
        key: { licenseNumber: 1 },
        unique: true,
        collation: expect.objectContaining({
          locale: 'en',
          strength: 2,
          normalization: true,
        }),
      }),
    ]));
    expect(pendingIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'current_application_email_unique_v1',
        key: { email: 1, legacyReviewRequired: 1 },
        unique: true,
        partialFilterExpression: {
          status: { $in: ['submitted', 'under_review', 'approved'] },
          legacyReviewRequired: false,
          email: { $type: 'string' },
        },
        collation: expect.objectContaining({
          locale: 'en',
          strength: 2,
          normalization: true,
        }),
      }),
      expect.objectContaining({
        name: 'current_application_license_unique_v1',
        key: { licenseNumber: 1, legacyReviewRequired: 1 },
        unique: true,
        partialFilterExpression: {
          status: { $in: ['submitted', 'under_review', 'approved'] },
          legacyReviewRequired: false,
          licenseNumber: { $type: 'string' },
        },
        collation: expect.objectContaining({
          locale: 'en',
          strength: 2,
          normalization: true,
        }),
      }),
    ]));

    await database.collection('pendingapplications').insertMany([
      {
        _id: ids[12],
        email: 'current@example.org',
        licenseNumber: 'CURRENT-LICENSE',
        status: 'rejected',
        legacyReviewRequired: false,
      },
      {
        _id: ids[13],
        email: 'current@example.org',
        licenseNumber: 'CURRENT-LICENSE',
        status: 'suspended',
        legacyReviewRequired: false,
      },
      {
        _id: ids[14],
        email: 'current@example.org',
        licenseNumber: 'CURRENT-LICENSE',
        status: 'expired',
        legacyReviewRequired: false,
      },
      {
        _id: ids[15],
        email: 'current@example.org',
        licenseNumber: 'CURRENT-LICENSE',
        status: 'submitted',
        legacyReviewRequired: true,
      },
      {
        _id: ids[16],
        email: 'current@example.org',
        licenseNumber: 'CURRENT-LICENSE',
        status: 'submitted',
        legacyReviewRequired: false,
      },
    ]);

    await expect(database.collection('pendingapplications').insertOne({
      _id: ids[17],
      email: 'CURRENT@EXAMPLE.ORG',
      licenseNumber: 'OTHER-LICENSE',
      status: 'under_review',
      legacyReviewRequired: false,
    })).rejects.toMatchObject({ code: 11000 });
    await expect(database.collection('pendingapplications').insertOne({
      _id: ids[18],
      email: 'other@example.org',
      licenseNumber: 'current-license',
      status: 'approved',
      legacyReviewRequired: false,
    })).rejects.toMatchObject({ code: 11000 });

    // This is an ambiguous duplicate identity check only. It does not make a
    // decision about whether either applicant's qualification is sufficient.
    await expect(database.collection('counsellors').insertOne({
      _id: ids[19],
      user: ids[19],
      licenseNumber: 'legacy-approved',
      status: 'draft',
      isVerified: false,
      isActive: false,
      isAvailable: false,
    })).rejects.toMatchObject({ code: 11000 });
  });

  test('aborts before writes for duplicate normalized current identities', async () => {
    await seedValidLegacy(database);
    await database.collection('pendingapplications').insertMany([
      {
        _id: ids[12],
        email: ' Duplicate@Example.org ',
        phone: '+971500000012',
        licenseNumber: 'CURRENT-ONE',
        status: 'submitted',
        legacyReviewRequired: false,
        lifecycleSchemaVersion: 1,
      },
      {
        _id: ids[13],
        email: 'duplicate@example.org',
        phone: '+971500000013',
        licenseNumber: 'CURRENT-TWO',
        status: 'under_review',
        legacyReviewRequired: false,
        lifecycleSchemaVersion: 1,
      },
    ]);

    await expect(up({ mongoose: isolatedMongoose, now: NOW }))
      .rejects.toThrow('same normalized email');
    expect(await database.collection('counsellors').countDocuments({
      'professionalVerification.schemaVersion': { $exists: false },
    })).toBe(2);
    expect(await database.collection('users').countDocuments({
      isActive: true,
    })).toBe(2);
  });

  test.each([
    ['future schema version', async () => {
      await seedValidLegacy(database);
      await database.collection('counsellors').insertOne({
        _id: ids[12],
        user: ids[13],
        status: 'approved',
        isVerified: false,
        isActive: false,
        isAvailable: false,
        professionalVerification: { schemaVersion: 2 },
      });
    }, 'unsupported or future schema version'],
    ['unknown legacy status', async () => {
      await seedValidLegacy(database);
      await database.collection('pendingapplications').insertOne({
        _id: ids[12],
        email: 'unknown@example.org',
        phone: '+971500000012',
        licenseNumber: 'UNKNOWN-STATUS',
        status: 'approved',
      });
    }, 'unsupported legacy status'],
    ['array counsellor schema version', async () => {
      await seedValidLegacy(database);
      await database.collection('counsellors').updateOne(
        { _id: ids[2] },
        { $set: { 'professionalVerification.schemaVersion': [1] } }
      );
    }, 'unsupported or future schema version'],
    ['string application schema version', async () => {
      await seedValidLegacy(database);
      await database.collection('pendingapplications').updateOne(
        { _id: ids[4] },
        { $set: { lifecycleSchemaVersion: '1' } }
      );
    }, 'unsupported or future schema version'],
    ['object application schema version', async () => {
      await seedValidLegacy(database);
      await database.collection('pendingapplications').updateOne(
        { _id: ids[4] },
        { $set: { lifecycleSchemaVersion: { value: 1 } } }
      );
    }, 'unsupported or future schema version'],
    ['array current status', async () => {
      await seedValidLegacy(database);
      await database.collection('counsellors').updateOne(
        { _id: ids[2] },
        {
          $set: {
            status: ['approved'],
            professionalVerification: { schemaVersion: 1 },
          },
        }
      );
    }, 'invalid versioned status'],
    ['unsafe linked-user session version', async () => {
      await seedValidLegacy(database);
      await database.collection('users').updateOne(
        { _id: ids[0] },
        { $set: { sessionVersion: Number.MAX_SAFE_INTEGER } }
      );
    }, 'missing or contradictory linked user account'],
  ])('aborts all document and index writes for %s', async (
    _label,
    arrange,
    expectedMessage
  ) => {
    await arrange();
    const counsellorsBefore = await snapshotCollection(
      database.collection('counsellors')
    );
    const applicationsBefore = await snapshotCollection(
      database.collection('pendingapplications')
    );
    const usersBefore = await snapshotCollection(database.collection('users'));

    await expect(up({ mongoose: isolatedMongoose, now: NOW }))
      .rejects.toThrow(expectedMessage);

    expect(await snapshotCollection(database.collection('counsellors')))
      .toEqual(counsellorsBefore);
    expect(await snapshotCollection(database.collection('pendingapplications')))
      .toEqual(applicationsBefore);
    expect(await snapshotCollection(database.collection('users')))
      .toEqual(usersBefore);
    const plannedNames = INDEX_PLANS.flatMap(
      ({ indexes }) => indexes.map(({ options }) => options.name)
    );
    const actualNames = [
      ...(await database.collection('counsellors').indexes()),
      ...(await database.collection('pendingapplications').indexes()),
    ].map(({ name }) => name);
    plannedNames.forEach((name) => expect(actualNames).not.toContain(name));
  });

  test('aborts before document writes when an index name is incompatible', async () => {
    await seedValidLegacy(database);
    await database.collection('counsellors').createIndex(
      { status: 1 },
      { name: 'professional_verification_eligibility_v1' }
    );
    const counsellorsBefore = await snapshotCollection(
      database.collection('counsellors')
    );
    const applicationsBefore = await snapshotCollection(
      database.collection('pendingapplications')
    );

    await expect(up({ mongoose: isolatedMongoose, now: NOW }))
      .rejects.toThrow('is incompatible');

    expect(await snapshotCollection(database.collection('counsellors')))
      .toEqual(counsellorsBefore);
    expect(await snapshotCollection(database.collection('pendingapplications')))
      .toEqual(applicationsBefore);
  });

  test.each([
    ['user link', async () => {
      await database.collection('counsellors').insertOne({
        _id: ids[12],
        user: ids[0],
        licenseNumber: 'DUPLICATE-USER-LINK',
        status: 'pending',
        isVerified: false,
        isActive: true,
        isAvailable: false,
      });
    }],
    ['case-only license identity', async () => {
      await database.collection('users').insertOne({
        _id: ids[13],
        email: 'duplicate-license@example.org',
        phone: '+971500000013',
        role: 'counsellor',
        isActive: true,
      });
      await database.collection('counsellors').insertOne({
        _id: ids[12],
        user: ids[13],
        licenseNumber: 'legacy-approved',
        status: 'pending',
        isVerified: false,
        isActive: true,
        isAvailable: false,
      });
    }],
  ])('aborts before writes for a duplicate counsellor %s', async (
    _label,
    arrange
  ) => {
    await seedValidLegacy(database);
    await arrange();
    const counsellorsBefore = await snapshotCollection(
      database.collection('counsellors')
    );
    const applicationsBefore = await snapshotCollection(
      database.collection('pendingapplications')
    );

    await expect(up({ mongoose: isolatedMongoose, now: NOW }))
      .rejects.toThrow(/Duplicate counsellor profiles/);

    expect(await snapshotCollection(database.collection('counsellors')))
      .toEqual(counsellorsBefore);
    expect(await snapshotCollection(database.collection('pendingapplications')))
      .toEqual(applicationsBefore);
    const actualNames = (await database.collection('counsellors').indexes())
      .map(({ name }) => name);
    expect(actualNames).not.toContain('user_1');
    expect(actualNames).not.toContain('licenseNumber_1');
    expect(actualNames).not.toContain('counsellor_license_identity_unique_v1');
  });

  test('aborts before writes when a legacy license identity is not already trimmed', async () => {
    await seedValidLegacy(database);
    await database.collection('counsellors').updateOne(
      { _id: ids[3] },
      { $set: { licenseNumber: ' LEGACY-PENDING ' } }
    );
    const counsellorsBefore = await snapshotCollection(
      database.collection('counsellors')
    );
    const applicationsBefore = await snapshotCollection(
      database.collection('pendingapplications')
    );

    await expect(up({ mongoose: isolatedMongoose, now: NOW }))
      .rejects.toThrow('malformed or untrimmed');

    expect(await snapshotCollection(database.collection('counsellors')))
      .toEqual(counsellorsBefore);
    expect(await snapshotCollection(database.collection('pendingapplications')))
      .toEqual(applicationsBefore);
    const actualNames = (await database.collection('counsellors').indexes())
      .map(({ name }) => name);
    expect(actualNames).not.toContain('counsellor_license_identity_unique_v1');
  });

  test('a compare-and-set miss fails without advancing applications or indexes', async () => {
    await seedValidLegacy(database);
    const operationLog = [];
    const facade = makeDbFacade(database, {
      counsellors: {
        bulkWrite: async () => ({ matchedCount: 0, modifiedCount: 0 }),
      },
    }, operationLog);

    await expect(up({
      mongoose: mongooseWithDb(facade),
      now: NOW,
    })).rejects.toThrow('changed concurrently');

    const applications = await database.collection('pendingapplications')
      .find({})
      .toArray();
    expect(applications.map(({ status }) => status).sort()).toEqual([
      'pending',
      'pending',
      'rejected',
    ]);
    expect(await database.collection('users').countDocuments({
      isActive: false,
    })).toBe(0);
    expect(operationLog).not.toContain('pendingapplications.bulkWrite');
    expect(operationLog.some((entry) => entry.endsWith('.createIndex')))
      .toBe(false);
  });

  test('a linked-user CAS miss rolls back counsellor and application updates', async () => {
    await seedValidLegacy(database);
    const operationLog = [];
    const facade = makeDbFacade(database, {
      users: {
        bulkWrite: async () => ({ matchedCount: 0, modifiedCount: 0 }),
      },
    }, operationLog);

    await expect(up({
      mongoose: mongooseWithDb(facade),
      now: NOW,
    })).rejects.toThrow('changed concurrently');

    expect(await database.collection('counsellors').countDocuments({
      'professionalVerification.schemaVersion': { $exists: false },
    })).toBe(2);
    expect(await database.collection('pendingapplications').countDocuments({
      lifecycleSchemaVersion: { $exists: false },
    })).toBe(3);
    expect(await database.collection('users').countDocuments({
      isActive: true,
    })).toBe(2);
    expect(operationLog).toContain('users.bulkWrite');
    expect(operationLog.some((entry) => entry.endsWith('.createIndex')))
      .toBe(false);
  });

  test('rolls back every document update when a collection write fails', async () => {
    await seedValidLegacy(database);
    let failApplicationWrite = true;
    const facade = makeDbFacade(database, {
      pendingapplications: {
        bulkWrite: async ({ args, original }) => {
          if (failApplicationWrite) {
            failApplicationWrite = false;
            throw new Error('injected application-write failure');
          }
          return original(...args);
        },
      },
    });

    await expect(up({
      mongoose: mongooseWithDb(facade),
      now: NOW,
    })).rejects.toThrow('injected application-write failure');
    expect(await database.collection('counsellors').countDocuments({
      'professionalVerification.schemaVersion': 1,
    })).toBe(0);
    expect(await database.collection('pendingapplications').countDocuments({
      lifecycleSchemaVersion: { $exists: false },
    })).toBe(3);
    expect(await database.collection('users').countDocuments({
      isActive: false,
    })).toBe(0);

    await up({ mongoose: isolatedMongoose, now: NOW });
    const counsellors = await database.collection('counsellors').find({}).toArray();
    const applications = await database.collection('pendingapplications')
      .find({})
      .toArray();
    counsellors.forEach(({ professionalVerification }) => {
      expect(professionalVerification.statusHistory).toHaveLength(1);
    });
    applications.forEach(({ status, statusHistory }) => {
      expect(statusHistory).toHaveLength(status === 'rejected' ? 0 : 1);
    });
  });

  test('reruns safely after an index-stage failure', async () => {
    await seedValidLegacy(database);
    let createCalls = 0;
    const failSecondCreate = async ({ args, original }) => {
      createCalls += 1;
      if (createCalls === 2) throw new Error('injected index failure');
      return original(...args);
    };
    const facade = makeDbFacade(database, {
      counsellors: { createIndex: failSecondCreate },
      pendingapplications: { createIndex: failSecondCreate },
    });

    await expect(up({
      mongoose: mongooseWithDb(facade),
      now: NOW,
    })).rejects.toThrow('injected index failure');
    expect(await database.collection('counsellors').countDocuments({
      'professionalVerification.schemaVersion': 1,
    })).toBe(2);
    expect(await database.collection('pendingapplications').countDocuments({
      lifecycleSchemaVersion: 1,
    })).toBe(3);

    await up({ mongoose: isolatedMongoose, now: NOW });
    const allIndexes = [
      ...(await database.collection('counsellors').indexes()),
      ...(await database.collection('pendingapplications').indexes()),
    ];
    INDEX_PLANS.flatMap(({ indexes }) => indexes).forEach(({ options }) => {
      expect(allIndexes.some(({ name }) => name === options.name)).toBe(true);
    });
    const counsellors = await database.collection('counsellors').find({}).toArray();
    const applications = await database.collection('pendingapplications')
      .find({})
      .toArray();
    counsellors.forEach(({ professionalVerification }) => {
      expect(professionalVerification.statusHistory).toHaveLength(1);
    });
    applications.forEach(({ status, statusHistory }) => {
      expect(statusHistory).toHaveLength(status === 'rejected' ? 0 : 1);
    });
  });
});
