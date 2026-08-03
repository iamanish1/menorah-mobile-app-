const mongoose = require('mongoose');
const {
  INDEX_PLANS,
  MIGRATION_VERSION,
  assertUserMappings,
  buildApplicationCompareAndSetFilter,
  buildApplicationMigrationUpdate,
  buildCounsellorCompareAndSetFilter,
  buildCounsellorMigrationUpdate,
  buildDuplicatePipeline,
  buildUserDeactivationCompareAndSetFilter,
  buildUserDeactivationUpdate,
  classifyLegacyApplication,
  classifyLegacyCounsellor,
  validateLegacyApplication,
  validateLegacyCounsellor,
} = require('../20260723-professional-verification-state-machine');

const NOW = new Date('2026-07-23T12:00:00.000Z');
const ids = Array.from(
  { length: 12 },
  (_, index) => new mongoose.Types.ObjectId(
    `64f0000000000000000000${index.toString(16).padStart(2, '0')}`
  )
);

const makeCounsellor = (overrides = {}) => ({
  _id: ids[0],
  user: ids[1],
  licenseNumber: 'LICENSE-COUNSELLOR-001',
  status: 'approved',
  isVerified: true,
  isActive: true,
  isAvailable: true,
  approvedBy: ids[2],
  approvedAt: new Date('2026-07-01T09:00:00.000Z'),
  ...overrides,
});

const makeApplication = (overrides = {}) => ({
  _id: ids[3],
  email: 'applicant@example.org',
  phone: '+971500000001',
  licenseNumber: 'LICENSE-001',
  status: 'pending',
  ...overrides,
});

describe('professional-verification migration classification', () => {
  test('maps legacy states fail closed without using a forbidden modern edge', () => {
    expect(classifyLegacyCounsellor(makeCounsellor())).toBe('suspended');
    expect(classifyLegacyCounsellor(makeCounsellor({
      status: 'pending',
      isVerified: false,
      isAvailable: false,
      approvedBy: undefined,
      approvedAt: undefined,
    }))).toBe('draft');
    expect(classifyLegacyCounsellor(makeCounsellor({
      status: 'rejected',
      isVerified: false,
      isAvailable: false,
      approvedBy: undefined,
      approvedAt: undefined,
    }))).toBe('rejected');

    expect(classifyLegacyApplication(makeApplication())).toBe('submitted');
    expect(classifyLegacyApplication(makeApplication({
      reviewedBy: ids[2],
      reviewedAt: new Date('2026-07-02T09:00:00.000Z'),
    }))).toBe('under_review');
    expect(classifyLegacyApplication(makeApplication({
      status: 'rejected',
      rejectionReason: 'Legacy rejection',
      reviewedBy: ids[2],
      reviewedAt: new Date('2026-07-02T09:00:00.000Z'),
    }))).toBe('rejected');
  });

  test.each([
    [{ status: undefined }, 'unknown legacy status'],
    [{ status: 'mystery' }, 'unknown legacy status'],
    [{ isVerified: false }, 'without legacy verification metadata'],
    [{ approvedBy: null }, 'must be a complete, valid pair'],
    [{ isActive: false, isAvailable: true }, 'inactive but marked available'],
    [{
      status: 'pending',
      isVerified: false,
      isAvailable: true,
      approvedBy: undefined,
      approvedAt: undefined,
    }, 'non-approved but marked available'],
    [{
      professionalVerification: {
        onboardingConsent: { accepted: true },
      },
    }, 'ambiguous partial verification data'],
  ])('rejects ambiguous counsellor data %#', (overrides, message) => {
    expect(() => validateLegacyCounsellor(makeCounsellor(overrides)))
      .toThrow(message);
  });

  test.each([
    [{ status: undefined }, 'unsupported legacy status'],
    [{ status: 'approved' }, 'unsupported legacy status'],
    [{ reviewedBy: ids[2] }, 'must be a complete, valid pair'],
    [{ rejectionReason: 'Unexpected' }, 'pending but contains a rejection reason'],
    [{
      status: 'rejected',
      reviewedBy: ids[2],
      reviewedAt: new Date('2026-07-02T09:00:00.000Z'),
    }, 'without complete legacy decision metadata'],
    [{
      onboardingConsent: {
        accepted: true,
        version: 'invented',
      },
    }, 'ambiguous partial lifecycle data'],
    [{
      reverificationAuthorization: {
        tokenHash: 'a'.repeat(64),
      },
    }, 'ambiguous partial lifecycle data'],
  ])('rejects ambiguous application data %#', (overrides, message) => {
    expect(() => validateLegacyApplication(makeApplication(overrides)))
      .toThrow(message);
  });
});

describe('professional-verification migration updates', () => {
  test('records only legacy provenance and no invented approval evidence', () => {
    const update = buildCounsellorMigrationUpdate(makeCounsellor(), NOW);
    const verification = update.$set.professionalVerification;

    expect(update.$set.status).toBe('suspended');
    expect(update.$set.isVerified).toBe(false);
    expect(update.$set.isActive).toBe(false);
    expect(update.$set.isAvailable).toBe(false);
    expect(verification).toEqual(expect.objectContaining({
      schemaVersion: 1,
      migrationVersion: MIGRATION_VERSION,
      legacyReviewRequired: true,
      legacySnapshot: expect.objectContaining({
        status: 'approved',
        isVerified: true,
      }),
      statusHistory: [expect.objectContaining({
        from: 'approved',
        to: 'suspended',
        actorType: 'system',
        actor: null,
      })],
    }));
    expect(verification).not.toHaveProperty('application');
    expect(verification).not.toHaveProperty('onboardingConsent');
    expect(verification).not.toHaveProperty('credentialReview');
    expect(verification).not.toHaveProperty('reviewStartedBy');
    expect(verification).not.toHaveProperty('approvedBy');
    expect(verification).not.toHaveProperty('approvedAt');
    expect(verification).not.toHaveProperty('expiresAt');
    expect(verification).not.toHaveProperty('reverificationInviteTokenHash');
    expect(verification).not.toHaveProperty('reverificationInviteIssuedBy');
    expect(verification).not.toHaveProperty('reverificationInviteIssuedAt');
    expect(verification).not.toHaveProperty('reverificationInviteExpiresAt');
    expect(verification).not.toHaveProperty('reverificationInviteConsentVersion');
  });

  test('does not synthesize application consent, evidence, reviewer, links, or expiry', () => {
    const update = buildApplicationMigrationUpdate(makeApplication(), NOW);

    expect(update.$set).toEqual(expect.objectContaining({
      status: 'submitted',
      lifecycleSchemaVersion: 1,
      legacyMigrationVersion: MIGRATION_VERSION,
      legacyReviewRequired: true,
      statusHistory: [expect.objectContaining({
        from: 'pending',
        to: 'submitted',
        actorType: 'system',
        actor: null,
      })],
    }));
    [
      'onboardingConsent',
      'credentialEvidence',
      'credentialReview',
      'reviewStartedBy',
      'decisionBy',
      'verificationExpiresAt',
      'linkedUser',
      'linkedCounsellor',
      'reviewAccountSnapshot',
      'reverificationAuthorization',
      'supersedesApplication',
    ].forEach((field) => expect(update.$set).not.toHaveProperty(field));
  });

  test('does not record a rejected-to-rejected self-transition', () => {
    const rejectedCounsellor = makeCounsellor({
      status: 'rejected',
      isVerified: false,
      isAvailable: false,
      approvedBy: undefined,
      approvedAt: undefined,
    });
    const rejectedApplication = makeApplication({
      status: 'rejected',
      rejectionReason: 'Legacy rejection',
      reviewedBy: ids[2],
      reviewedAt: new Date('2026-07-02T09:00:00.000Z'),
    });

    expect(buildCounsellorMigrationUpdate(
      rejectedCounsellor,
      NOW
    ).$set.professionalVerification.statusHistory).toEqual([]);
    expect(buildApplicationMigrationUpdate(
      rejectedApplication,
      NOW
    ).$set.statusHistory).toEqual([]);
  });

  test('compare-and-set filters include every classification-relevant source field', () => {
    const counsellor = makeCounsellor();
    const application = makeApplication({
      reviewedBy: ids[2],
      reviewedAt: new Date('2026-07-02T09:00:00.000Z'),
    });

    expect(buildCounsellorCompareAndSetFilter(counsellor)).toEqual(
      expect.objectContaining({
        _id: counsellor._id,
        user: counsellor.user,
        licenseNumber: counsellor.licenseNumber,
        status: counsellor.status,
        isVerified: counsellor.isVerified,
        isActive: counsellor.isActive,
        isAvailable: counsellor.isAvailable,
        approvedBy: counsellor.approvedBy,
        approvedAt: counsellor.approvedAt,
        blockedAt: { $exists: false },
        blockedReason: { $exists: false },
        professionalVerification: { $exists: false },
        $or: [
          {
            'professionalVerification.schemaVersion': { $exists: false },
          },
          { 'professionalVerification.schemaVersion': null },
        ],
      })
    );
    expect(buildApplicationCompareAndSetFilter(application)).toEqual(
      expect.objectContaining({
        _id: application._id,
        email: application.email,
        phone: application.phone,
        licenseNumber: application.licenseNumber,
        status: application.status,
        reviewedBy: application.reviewedBy,
        reviewedAt: application.reviewedAt,
        rejectionReason: { $exists: false },
        lifecycleSchemaVersion: { $exists: false },
        onboardingConsent: { $exists: false },
        credentialEvidence: { $exists: false },
        reviewAccountSnapshot: { $exists: false },
        reverificationAuthorization: { $exists: false },
        statusHistory: { $exists: false },
      })
    );
  });

  test('revokes an active linked user with an exact, idempotency-safe CAS', () => {
    const user = {
      _id: ids[1],
      email: 'counsellor@example.org',
      phone: '+971500000009',
      role: 'counsellor',
      isActive: true,
      sessionVersion: 7,
      lastSessionRevokedAt: null,
    };

    expect(buildUserDeactivationCompareAndSetFilter(user)).toEqual(user);
    expect(buildUserDeactivationUpdate(user, NOW)).toEqual({
      $set: {
        isActive: false,
        lastSessionRevokedAt: NOW,
      },
      $inc: { sessionVersion: 1 },
    });
  });
});

describe('professional-verification migration preflight contracts', () => {
  test('keeps retained application history non-unique', () => {
    const pendingPlan = INDEX_PLANS.find(
      ({ collectionName }) => collectionName === 'pendingapplications'
    );
    const historyIndex = pendingPlan.indexes.find(
      ({ options }) => options.name === 'application_counsellor_history_v1'
    );

    expect(historyIndex.key).toEqual({ linkedCounsellor: 1, createdAt: -1 });
    expect(historyIndex.options.unique).not.toBe(true);
  });

  test('owns normalized unique indexes only for non-legacy current applications', () => {
    const pendingPlan = INDEX_PLANS.find(
      ({ collectionName }) => collectionName === 'pendingapplications'
    );
    const emailIndex = pendingPlan.indexes.find(
      ({ options }) => options.name === 'current_application_email_unique_v1'
    );
    const licenseIndex = pendingPlan.indexes.find(
      ({ options }) => options.name === 'current_application_license_unique_v1'
    );

    expect(emailIndex).toEqual(expect.objectContaining({
      key: { email: 1, legacyReviewRequired: 1 },
      options: expect.objectContaining({
        unique: true,
        collation: { locale: 'en', strength: 2, normalization: true },
        partialFilterExpression: {
          status: { $in: ['submitted', 'under_review', 'approved'] },
          legacyReviewRequired: false,
          email: { $type: 'string' },
        },
      }),
      duplicateCheck: expect.objectContaining({
        description: expect.stringContaining('normalized email'),
      }),
    }));
    expect(licenseIndex).toEqual(expect.objectContaining({
      key: { licenseNumber: 1, legacyReviewRequired: 1 },
      options: expect.objectContaining({
        unique: true,
        collation: { locale: 'en', strength: 2, normalization: true },
        partialFilterExpression: {
          status: { $in: ['submitted', 'under_review', 'approved'] },
          legacyReviewRequired: false,
          licenseNumber: { $type: 'string' },
        },
      }),
      duplicateCheck: expect.objectContaining({
        description: expect.stringContaining('normalized license number'),
      }),
    }));
  });

  test('owns the critical counsellor identity indexes with duplicate preflights', () => {
    const counsellorPlan = INDEX_PLANS.find(
      ({ collectionName }) => collectionName === 'counsellors'
    );
    const userIndex = counsellorPlan.indexes.find(
      ({ key }) => key.user === 1
    );
    const legacyLicenseIndex = counsellorPlan.indexes.find(
      ({ options }) => options.name === 'licenseNumber_1'
    );
    const licenseIdentityIndex = counsellorPlan.indexes.find(
      ({ options }) => options.name === 'counsellor_license_identity_unique_v1'
    );

    expect(userIndex).toEqual(expect.objectContaining({
      key: { user: 1 },
      options: expect.objectContaining({ unique: true }),
      duplicateCheck: expect.any(Object),
    }));
    expect(legacyLicenseIndex).toEqual(expect.objectContaining({
      key: { licenseNumber: 1 },
      options: expect.objectContaining({ unique: true }),
      duplicateCheck: expect.any(Object),
    }));
    expect(licenseIdentityIndex).toEqual(expect.objectContaining({
      key: { licenseNumber: 1 },
      options: {
        name: 'counsellor_license_identity_unique_v1',
        unique: true,
        collation: { locale: 'en', strength: 2, normalization: true },
      },
      coexistingSameKeyIndexNames: ['licenseNumber_1'],
      duplicateCheck: expect.objectContaining({
        groupBy: {
          $toLower: {
            $trim: { input: '$licenseNumber' },
          },
        },
        nonEmptyGroup: true,
        description: expect.stringContaining('license identity collision'),
      }),
    }));
    expect(legacyLicenseIndex.coexistingSameKeyIndexNames).toEqual([
      'counsellor_license_identity_unique_v1',
    ]);
  });

  test('owns the stable bounded professional-verification expiry index', () => {
    const counsellorPlan = INDEX_PLANS.find(
      ({ collectionName }) => collectionName === 'counsellors'
    );
    const expiryIndex = counsellorPlan.indexes.find(
      ({ options }) => (
        options.name === 'professional_verification_expiry_sweep_v1'
      )
    );

    expect(expiryIndex).toEqual({
      key: {
        status: 1,
        'professionalVerification.expiresAt': 1,
        _id: 1,
      },
      options: {
        name: 'professional_verification_expiry_sweep_v1',
      },
    });
  });

  test('builds bounded duplicate-detection aggregation', () => {
    expect(buildDuplicatePipeline({
      match: { status: 'pending' },
      groupBy: '$email',
      nonEmptyGroup: true,
    })).toEqual([
      { $match: { status: 'pending' } },
      { $group: { _id: '$email', count: { $sum: 1 } } },
      {
        $match: {
          count: { $gt: 1 },
          _id: { $ne: '' },
        },
      },
      { $limit: 1 },
    ]);
  });

  test('requires linked counsellor users to remain role/account consistent', () => {
    const counsellor = makeCounsellor();
    const user = {
      _id: counsellor.user,
      role: 'counsellor',
      isActive: true,
      sessionVersion: 0,
      email: 'counsellor@example.org',
      phone: '+971500000009',
    };

    expect(() => assertUserMappings([counsellor], [], [user])).not.toThrow();
    expect(() => assertUserMappings([counsellor], [], [{
      ...user,
      role: 'user',
    }])).toThrow('missing or contradictory linked user account');
    expect(() => assertUserMappings([{
      ...counsellor,
      isActive: false,
      isAvailable: false,
    }], [], [user])).toThrow('missing or contradictory linked user account');
    expect(() => assertUserMappings([counsellor], [], [{
      ...user,
      sessionVersion: Number.MAX_SAFE_INTEGER,
    }])).toThrow('missing or contradictory linked user account');
  });

  test('aborts when an application email and phone map to different users', () => {
    const application = makeApplication();
    const users = [
      {
        _id: ids[4],
        email: application.email,
        phone: '+971500000008',
      },
      {
        _id: ids[5],
        email: 'other@example.org',
        phone: application.phone,
      },
    ];

    expect(() => assertUserMappings([], [application], users))
      .toThrow('maps its email and phone to different users');
  });
});
