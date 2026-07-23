const Counsellor = require('../Counsellor');
const PendingApplication = require('../PendingApplication');

const USER_ID = '64f000000000000000000001';

const makeCounsellor = (overrides = {}) => new Counsellor({
  user: USER_ID,
  licenseNumber: 'MH-TEST-001',
  specialization: 'Counselling',
  experience: 5,
  bio: 'Test profile for schema validation.',
  languages: ['English'],
  hourlyRate: 1000,
  ...overrides,
});

const makeEvidence = (overrides = {}) => ({
  reference: 'private-evidence/license.pdf',
  category: 'professional_license',
  submittedAt: new Date('2026-07-23T08:30:00.000Z'),
  source: 'counsellor_web_registration',
  ...overrides,
});

describe('Counsellor professional-verification schema', () => {
  test('new counsellor profiles default to dormant and unverified', () => {
    const counsellor = makeCounsellor();

    expect(counsellor.validateSync()).toBeUndefined();
    expect(counsellor.status).toBe('draft');
    expect(counsellor.isVerified).toBe(false);
    expect(counsellor.isActive).toBe(false);
    expect(counsellor.isAvailable).toBe(false);
    expect(counsellor.professionalVerification.application).toBeNull();
    expect(counsellor.professionalVerification.onboardingConsent.accepted)
      .toBe(false);
    expect(counsellor.professionalVerification.onboardingConsent.version)
      .toBeNull();
    expect(counsellor.professionalVerification.credentialReview.decision)
      .toBe('pending');
    expect(counsellor.professionalVerification.credentialReview.evidenceIds)
      .toHaveLength(0);
    expect(counsellor.professionalVerification.approvedBy).toBeNull();
    expect(counsellor.professionalVerification.approvedAt).toBeNull();
    expect(counsellor.professionalVerification.expiresAt).toBeNull();
    expect(counsellor.professionalVerification.reverificationInviteTokenHash)
      .toBeNull();
    expect(counsellor.professionalVerification.reverificationInviteIssuedBy)
      .toBeNull();
    expect(counsellor.professionalVerification.reverificationInviteIssuedAt)
      .toBeNull();
    expect(counsellor.professionalVerification.reverificationInviteExpiresAt)
      .toBeNull();
    expect(counsellor.professionalVerification.reverificationInviteConsentVersion)
      .toBeNull();
    expect(counsellor.professionalVerification.marketplaceAssignmentFence)
      .toBe(0);
    expect(counsellor.professionalVerification.legacyReviewRequired).toBe(false);
  });

  test.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an unsafe marketplace assignment fence (%p)',
    (marketplaceAssignmentFence) => {
      const counsellor = makeCounsellor({
        professionalVerification: { marketplaceAssignmentFence },
      });

      expect(counsellor.validateSync()?.errors[
        'professionalVerification.marketplaceAssignmentFence'
      ]).toBeTruthy();
    }
  );

  test('keeps re-verification invite secrets private and validates a complete tuple', () => {
    [
      'reverificationInviteTokenHash',
      'reverificationInviteIssuedBy',
      'reverificationInviteIssuedAt',
      'reverificationInviteExpiresAt',
      'reverificationInviteConsentVersion',
    ].forEach((field) => {
      expect(Counsellor.schema.path(
        `professionalVerification.${field}`
      ).options.select).toBe(false);
    });

    const issuedAt = new Date('2026-07-23T08:30:00.000Z');
    const valid = makeCounsellor({
      professionalVerification: {
        reverificationInviteTokenHash: 'A'.repeat(64),
        reverificationInviteIssuedBy: USER_ID,
        reverificationInviteIssuedAt: issuedAt,
        reverificationInviteExpiresAt: new Date('2026-07-24T08:30:00.000Z'),
        reverificationInviteConsentVersion: 'consent-2026-07',
      },
    });

    expect(valid.validateSync()).toBeUndefined();
    expect(valid.professionalVerification.reverificationInviteTokenHash)
      .toBe('a'.repeat(64));

    const incomplete = makeCounsellor({
      professionalVerification: {
        reverificationInviteTokenHash: 'a'.repeat(64),
      },
    });
    const incompleteError = incomplete.validateSync();
    [
      'reverificationInviteIssuedBy',
      'reverificationInviteIssuedAt',
      'reverificationInviteExpiresAt',
      'reverificationInviteConsentVersion',
    ].forEach((field) => {
      expect(incompleteError?.errors[`professionalVerification.${field}`])
        .toBeTruthy();
    });

    const invalid = makeCounsellor({
      professionalVerification: {
        reverificationInviteTokenHash: 'not-a-token-hash',
        reverificationInviteIssuedBy: USER_ID,
        reverificationInviteIssuedAt: issuedAt,
        reverificationInviteExpiresAt: issuedAt,
        reverificationInviteConsentVersion: 'x'.repeat(129),
      },
    });
    const invalidError = invalid.validateSync();
    expect(invalidError?.errors[
      'professionalVerification.reverificationInviteTokenHash'
    ]).toBeTruthy();
    expect(invalidError?.errors[
      'professionalVerification.reverificationInviteExpiresAt'
    ]).toBeTruthy();
    expect(invalidError?.errors[
      'professionalVerification.reverificationInviteConsentVersion'
    ]).toBeTruthy();
  });

  test('does not expose the legacy isVerified-only availability helper', () => {
    expect(Counsellor.findAvailable).toBeUndefined();
  });

  test('owns a case-insensitive license identity index without rewriting display values', () => {
    const counsellor = makeCounsellor({
      licenseNumber: 'Applicant-Issued-License-AbC',
    });
    const licenseIdentityIndex = Counsellor.schema.indexes().find(
      ([, options]) => options.name === 'counsellor_license_identity_unique_v1'
    );

    expect(counsellor.licenseNumber).toBe('Applicant-Issued-License-AbC');
    expect(licenseIdentityIndex).toEqual([
      { licenseNumber: 1 },
      expect.objectContaining({
        unique: true,
        collation: { locale: 'en', strength: 2, normalization: true },
      }),
    ]);
  });
});

describe('PendingApplication professional-verification schema', () => {
  test('new applications contain no positive consent or review defaults', () => {
    const application = new PendingApplication();

    expect(application.validateSync()).toBeUndefined();
    expect(application.status).toBe('submitted');
    expect(application.onboardingConsent.accepted).toBe(false);
    expect(application.onboardingConsent.version).toBeNull();
    expect(application.onboardingConsent.acceptedAt).toBeNull();
    expect(application.onboardingConsent.source).toBeNull();
    expect(application.credentialEvidence).toHaveLength(0);
    expect(application.credentialReview.decision).toBe('pending');
    expect(application.credentialReview.evidenceIds).toHaveLength(0);
    expect(application.credentialReview.reviewedBy).toBeNull();
    expect(application.credentialReview.reviewedAt).toBeNull();
    expect(application.verificationExpiresAt).toBeNull();
    expect(application.linkedUser).toBeNull();
    expect(application.linkedCounsellor).toBeNull();
    expect(application.reviewAccountSnapshot).toBeUndefined();
    expect(application.reverificationAuthorization).toBeUndefined();
    expect(application.legacyReviewRequired).toBe(false);
  });

  test('declares unique non-legacy current-application identity indexes', () => {
    const indexes = PendingApplication.schema.indexes();
    const emailIndex = indexes.find(
      ([, options]) => options.name === 'current_application_email_unique_v1'
    );
    const licenseIndex = indexes.find(
      ([, options]) => options.name === 'current_application_license_unique_v1'
    );

    expect(emailIndex).toEqual([
      { email: 1, legacyReviewRequired: 1 },
      expect.objectContaining({
        unique: true,
        collation: { locale: 'en', strength: 2, normalization: true },
        partialFilterExpression: {
          status: { $in: ['submitted', 'under_review', 'approved'] },
          legacyReviewRequired: false,
          email: { $type: 'string' },
        },
      }),
    ]);
    expect(licenseIndex).toEqual([
      { licenseNumber: 1, legacyReviewRequired: 1 },
      expect.objectContaining({
        unique: true,
        collation: { locale: 'en', strength: 2, normalization: true },
        partialFilterExpression: {
          status: { $in: ['submitted', 'under_review', 'approved'] },
          legacyReviewRequired: false,
          licenseNumber: { $type: 'string' },
        },
      }),
    ]);
  });

  test('requires the minimum private evidence metadata', () => {
    const application = new PendingApplication({
      credentialEvidence: [{}],
    });
    const error = application.validateSync();

    expect(error?.errors['credentialEvidence.0.reference']).toBeTruthy();
    expect(error?.errors['credentialEvidence.0.category']).toBeTruthy();
    expect(error?.errors['credentialEvidence.0.submittedAt']).toBeTruthy();
    expect(error?.errors['credentialEvidence.0.source']).toBeTruthy();
  });

  test('allows optional evidence integrity metadata to be omitted', () => {
    const application = new PendingApplication({
      credentialEvidence: [makeEvidence()],
    });

    expect(application.validateSync()).toBeUndefined();
    expect(application.credentialEvidence[0].sha256).toBeNull();
    expect(application.credentialEvidence[0].contentType).toBeNull();
    expect(application.credentialEvidence[0].sizeBytes).toBeNull();
  });

  test('accepts valid optional evidence integrity metadata', () => {
    const application = new PendingApplication({
      credentialEvidence: [makeEvidence({
        sha256: 'a'.repeat(64),
        contentType: 'application/pdf',
        sizeBytes: 4096,
      })],
    });

    expect(application.validateSync()).toBeUndefined();
  });

  test.each([
    ['sha256', { sha256: 'not-a-sha256' }],
    ['contentType', { contentType: '   ' }],
    ['sizeBytes', { sizeBytes: 0 }],
    ['sizeBytes', { sizeBytes: 1.5 }],
    ['sizeBytes', { sizeBytes: Number.MAX_SAFE_INTEGER + 1 }],
  ])('rejects invalid optional %s metadata', (path, metadata) => {
    const application = new PendingApplication({
      credentialEvidence: [makeEvidence(metadata)],
    });
    const error = application.validateSync();

    expect(error?.errors[`credentialEvidence.0.${path}`]).toBeTruthy();
  });

  test('keeps evidence references excluded from normal query selection', () => {
    expect(PendingApplication.schema.path('credentialEvidence.reference')
      .options.select).toBe(false);
  });

  test('rejects duplicate aggregate evidence IDs', () => {
    const application = new PendingApplication({
      credentialReview: {
        evidenceIds: [
          '64f000000000000000000010',
          '64f000000000000000000010',
        ],
      },
    });

    expect(application.validateSync()?.errors['credentialReview.evidenceIds'])
      .toBeTruthy();
  });

  test('requires a user actor for admin history and forbids one for system history', () => {
    const missingAdminActor = new PendingApplication({
      statusHistory: [{
        from: 'submitted',
        to: 'under_review',
        at: new Date(),
        actorType: 'admin',
      }],
    });
    const namedSystemActor = new PendingApplication({
      statusHistory: [{
        from: 'pending',
        to: 'submitted',
        at: new Date(),
        actorType: 'system',
        actor: USER_ID,
      }],
    });

    expect(missingAdminActor.validateSync()?.errors['statusHistory.0.actor'])
      .toBeTruthy();
    expect(namedSystemActor.validateSync()?.errors['statusHistory.0.actor'])
      .toBeTruthy();
  });

  test('allows an actorless applicant history event before account creation', () => {
    const application = new PendingApplication({
      status: 'submitted',
      statusHistory: [{
        from: 'draft',
        to: 'submitted',
        at: new Date(),
        actorType: 'applicant',
        actor: null,
        reason: 'application_submitted',
      }],
    });

    expect(application.validateSync()).toBeUndefined();
  });

  test('keeps the review account snapshot server-only and validates its exact shape', () => {
    expect(PendingApplication.schema.path('reviewAccountSnapshot').options.select)
      .toBe(false);

    const valid = new PendingApplication({
      reviewAccountSnapshot: {
        user: USER_ID,
        role: 'user',
        isActive: true,
        sessionVersion: 4,
        email: 'Applicant@Example.org',
        phone: '+971501234567',
        capturedAt: new Date(),
      },
    });
    expect(valid.validateSync()).toBeUndefined();
    expect(valid.reviewAccountSnapshot.email).toBe('applicant@example.org');

    const invalid = new PendingApplication({
      reviewAccountSnapshot: {
        user: USER_ID,
        role: 'admin',
        isActive: true,
        sessionVersion: 1.5,
        email: 'not-an-email',
        phone: '',
        capturedAt: null,
      },
    });
    const error = invalid.validateSync();
    expect(error?.errors['reviewAccountSnapshot.role']).toBeTruthy();
    expect(error?.errors['reviewAccountSnapshot.sessionVersion']).toBeTruthy();
    expect(error?.errors['reviewAccountSnapshot.email']).toBeTruthy();
    expect(error?.errors['reviewAccountSnapshot.phone']).toBeTruthy();
    expect(error?.errors['reviewAccountSnapshot.capturedAt']).toBeTruthy();
  });

  test('keeps an immutable, complete re-verification authorization audit', () => {
    const authorizationPath = PendingApplication.schema.path(
      'reverificationAuthorization'
    );
    expect(authorizationPath.options.select).toBe(false);
    expect(authorizationPath.options.immutable).toBe(true);
    expect(PendingApplication.schema.path(
      'reverificationAuthorization.tokenHash'
    ).options.select).toBe(false);

    const issuedAt = new Date('2026-07-23T08:30:00.000Z');
    const valid = new PendingApplication({
      reverificationAuthorization: {
        tokenHash: 'A'.repeat(64),
        issuedBy: USER_ID,
        issuedAt,
        expiresAt: new Date('2026-07-24T08:30:00.000Z'),
        consentVersion: 'consent-2026-07',
        redeemedAt: new Date('2026-07-23T09:00:00.000Z'),
      },
    });
    expect(valid.validateSync()).toBeUndefined();
    expect(valid.reverificationAuthorization.tokenHash).toBe('a'.repeat(64));

    const incomplete = new PendingApplication({
      reverificationAuthorization: {
        tokenHash: 'a'.repeat(64),
      },
    });
    const incompleteError = incomplete.validateSync();
    ['issuedBy', 'issuedAt', 'expiresAt', 'consentVersion', 'redeemedAt']
      .forEach((field) => {
        expect(incompleteError?.errors[
          `reverificationAuthorization.${field}`
        ]).toBeTruthy();
      });

    const invalid = new PendingApplication({
      reverificationAuthorization: {
        tokenHash: 'not-a-token-hash',
        issuedBy: USER_ID,
        issuedAt,
        expiresAt: issuedAt,
        consentVersion: 'x'.repeat(129),
        redeemedAt: new Date('2026-07-25T08:30:00.000Z'),
      },
    });
    const invalidError = invalid.validateSync();
    ['tokenHash', 'expiresAt', 'consentVersion', 'redeemedAt']
      .forEach((field) => {
        expect(invalidError?.errors[
          `reverificationAuthorization.${field}`
        ]).toBeTruthy();
      });
  });
});
