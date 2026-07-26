const mongoose = require('mongoose');
const {
  PROFESSIONAL_VERIFICATION_STATES,
} = require('../../config/counsellorVerification');
const {
  APPROVAL_FAILURES,
  PROFESSIONAL_VERIFICATION_TRANSITIONS,
  buildImpossibleEligibilityQuery,
  buildProfessionallyApprovedCounsellorQuery,
  canTransitionProfessionalVerification,
  isCounsellorProfessionallyApproved,
  isProfessionalVerificationExpired,
  validateProfessionalApprovalPrerequisites,
} = require('../counsellorVerificationPolicy');

const NOW = new Date('2026-07-23T12:00:00.000Z');
const USER_ID = new mongoose.Types.ObjectId('64f000000000000000000000');
const APPLICATION_ID = new mongoose.Types.ObjectId('64f000000000000000000001');
const EVIDENCE_ID = new mongoose.Types.ObjectId('64f000000000000000000002');
const REVIEWER_ID = new mongoose.Types.ObjectId('64f000000000000000000003');

const CONFIG = Object.freeze({
  configured: true,
  onboardingConsentVersion: 'counsellor-onboarding-v1-2026-07-23',
  credentialPolicyVersion: 'credential-review-v1-2026-07-23',
  onboardingNoticeUrl: 'https://legal.mentle.app/counsellor-verification',
  invalidFields: Object.freeze([]),
});

const makeApplication = (overrides = {}) => ({
  _id: APPLICATION_ID,
  status: 'under_review',
  legacyReviewRequired: false,
  reviewStartedBy: REVIEWER_ID,
  reviewStartedAt: new Date('2026-07-23T09:00:00.000Z'),
  onboardingConsent: {
    accepted: true,
    version: CONFIG.onboardingConsentVersion,
    acceptedAt: new Date('2026-07-23T08:00:00.000Z'),
    source: 'counsellor_web_registration',
  },
  credentialEvidence: [{
    _id: EVIDENCE_ID,
    reference: 'private-evidence/license.pdf',
    category: 'professional_license',
    submittedAt: new Date('2026-07-23T08:30:00.000Z'),
    source: 'counsellor_web_registration',
    review: {
      decision: 'approved',
      policyVersion: CONFIG.credentialPolicyVersion,
      reviewedBy: REVIEWER_ID,
      reviewedAt: new Date('2026-07-23T10:00:00.000Z'),
    },
  }],
  credentialReview: {
    decision: 'approved',
    policyVersion: CONFIG.credentialPolicyVersion,
    evidenceIds: [EVIDENCE_ID],
    reviewedBy: REVIEWER_ID,
    reviewedAt: new Date('2026-07-23T10:15:00.000Z'),
  },
  verificationExpiresAt: new Date('2027-07-23T12:00:00.000Z'),
  ...overrides,
});

const makeApprovedCounsellor = (overrides = {}) => ({
  status: 'approved',
  isActive: true,
  isAvailable: true,
  user: {
    _id: USER_ID,
    isActive: true,
    role: 'counsellor',
  },
  // The retired boolean must not be able to grant or revoke modern approval.
  isVerified: false,
  professionalVerification: {
    application: APPLICATION_ID,
    schemaVersion: 1,
    legacyReviewRequired: false,
    onboardingConsent: {
      accepted: true,
      version: CONFIG.onboardingConsentVersion,
      acceptedAt: new Date('2026-07-23T08:00:00.000Z'),
      source: 'counsellor_web_registration',
    },
    credentialReview: {
      decision: 'approved',
      policyVersion: CONFIG.credentialPolicyVersion,
      evidenceIds: [EVIDENCE_ID],
      reviewedBy: REVIEWER_ID,
      reviewedAt: new Date('2026-07-23T10:15:00.000Z'),
    },
    approvedBy: REVIEWER_ID,
    approvedAt: new Date('2026-07-23T10:30:00.000Z'),
    expiresAt: new Date('2027-07-23T12:00:00.000Z'),
  },
  ...overrides,
});

describe('counsellor professional-verification transitions', () => {
  const expectedTransitions = Object.freeze({
    draft: ['submitted'],
    submitted: ['under_review'],
    under_review: ['approved', 'rejected'],
    approved: ['suspended', 'expired'],
    rejected: [],
    suspended: ['under_review'],
    expired: ['under_review'],
  });
  const allowedTransitions = new Set(
    Object.entries(expectedTransitions)
      .flatMap(([from, targets]) => targets.map((to) => `${from}->${to}`))
  );

  test('exports the exact lifecycle transition matrix', () => {
    expect(PROFESSIONAL_VERIFICATION_TRANSITIONS).toEqual(expectedTransitions);
  });

  test.each(
    PROFESSIONAL_VERIFICATION_STATES.flatMap((from) =>
      PROFESSIONAL_VERIFICATION_STATES.map((to) => [
        from,
        to,
        allowedTransitions.has(`${from}->${to}`),
      ])
    )
  )('%s -> %s is %s', (from, to, expected) => {
    expect(canTransitionProfessionalVerification(from, to)).toBe(expected);
  });

  test.each([
    ['pending', 'under_review'],
    ['approved', 'pending'],
    [undefined, 'submitted'],
    ['draft', undefined],
    [null, null],
  ])('rejects unsupported transition %p -> %p', (from, to) => {
    expect(canTransitionProfessionalVerification(from, to)).toBe(false);
  });
});

describe('professional approval prerequisites', () => {
  test('accepts a complete current review with optional evidence metadata omitted', () => {
    expect(validateProfessionalApprovalPrerequisites({
      application: makeApplication(),
      now: NOW,
      config: CONFIG,
    })).toEqual({
      ok: true,
      failures: [],
    });
  });

  test('accepts valid optional evidence integrity metadata', () => {
    const application = makeApplication();
    Object.assign(application.credentialEvidence[0], {
      sha256: 'a'.repeat(64),
      contentType: 'application/pdf',
      sizeBytes: 4096,
    });

    expect(validateProfessionalApprovalPrerequisites({
      application,
      now: NOW,
      config: CONFIG,
    })).toEqual({
      ok: true,
      failures: [],
    });
  });

  test.each([
    ['malformed SHA-256', { sha256: 'not-a-sha256' }],
    ['blank content type', { contentType: '   ' }],
    ['zero byte size', { sizeBytes: 0 }],
    ['fractional byte size', { sizeBytes: 1.5 }],
    ['unsafe byte size', { sizeBytes: Number.MAX_SAFE_INTEGER + 1 }],
  ])('rejects %s when optional evidence metadata is supplied', (_label, metadata) => {
    const application = makeApplication();
    Object.assign(application.credentialEvidence[0], metadata);

    const result = validateProfessionalApprovalPrerequisites({
      application,
      now: NOW,
      config: CONFIG,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(
      APPROVAL_FAILURES.CREDENTIAL_EVIDENCE_METADATA_INVALID
    );
  });

  test('rejects duplicate evidence IDs in an aggregate approval', () => {
    const application = makeApplication({
      credentialReview: {
        ...makeApplication().credentialReview,
        evidenceIds: [EVIDENCE_ID, EVIDENCE_ID],
      },
    });

    const result = validateProfessionalApprovalPrerequisites({
      application,
      now: NOW,
      config: CONFIG,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(
      APPROVAL_FAILURES.CREDENTIAL_EVIDENCE_METADATA_INVALID
    );
  });

  test('fails closed when configuration is unavailable', () => {
    const result = validateProfessionalApprovalPrerequisites({
      application: makeApplication(),
      now: NOW,
      config: {},
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(APPROVAL_FAILURES.CONFIG_UNAVAILABLE);
  });

  test.each([undefined, null, true])(
    'does not approve an unresolved legacy application flag (%p)',
    (legacyReviewRequired) => {
      const result = validateProfessionalApprovalPrerequisites({
        application: makeApplication({ legacyReviewRequired }),
        now: NOW,
        config: CONFIG,
      });

      expect(result.ok).toBe(false);
      expect(result.failures).toContain(APPROVAL_FAILURES.LEGACY_REVIEW_REQUIRED);
    }
  );

  test('approval checks do not depend on the public notice URL remaining available', () => {
    const verificationOnlyConfig = {
      configured: false,
      verificationConfigured: true,
      registrationConfigured: false,
      onboardingConsentVersion: CONFIG.onboardingConsentVersion,
      credentialPolicyVersion: CONFIG.credentialPolicyVersion,
      onboardingNoticeUrl: null,
    };

    expect(validateProfessionalApprovalPrerequisites({
      application: makeApplication(),
      now: NOW,
      config: verificationOnlyConfig,
    }).ok).toBe(true);
  });

  test('expiry must be strictly later than the approval clock', () => {
    const atBoundary = validateProfessionalApprovalPrerequisites({
      application: makeApplication({ verificationExpiresAt: new Date(NOW) }),
      now: NOW,
      config: CONFIG,
    });
    const afterBoundary = validateProfessionalApprovalPrerequisites({
      application: makeApplication({
        verificationExpiresAt: new Date(NOW.getTime() + 1),
      }),
      now: NOW,
      config: CONFIG,
    });

    expect(atBoundary.ok).toBe(false);
    expect(atBoundary.failures).toContain(
      APPROVAL_FAILURES.VERIFICATION_EXPIRY_REQUIRED
    );
    expect(afterBoundary.ok).toBe(true);
  });
});

describe('professionally approved counsellor eligibility', () => {
  test('accepts only a current, active, linked modern approval', () => {
    expect(isCounsellorProfessionallyApproved(makeApprovedCounsellor(), {
      now: NOW,
      config: CONFIG,
    })).toBe(true);
  });

  test('requires an active counsellor profile', () => {
    expect(isCounsellorProfessionallyApproved(makeApprovedCounsellor({
      isActive: false,
    }), {
      now: NOW,
      config: CONFIG,
    })).toBe(false);
  });

  test.each([
    ['missing account', undefined],
    ['inactive account', {
      _id: USER_ID,
      isActive: false,
      role: 'counsellor',
    }],
    ['wrong-role account', {
      _id: USER_ID,
      isActive: true,
      role: 'user',
    }],
    ['mismatched account', {
      _id: new mongoose.Types.ObjectId('64f000000000000000000009'),
      isActive: true,
      role: 'counsellor',
    }],
  ])('rejects a %s context', (_label, account) => {
    const counsellor = makeApprovedCounsellor({
      user: USER_ID,
    });

    expect(isCounsellorProfessionallyApproved(counsellor, {
      now: NOW,
      config: CONFIG,
      account,
    })).toBe(false);
  });

  test.each([undefined, null, 'not-an-object-id'])(
    'requires a valid linked application (%p)',
    (application) => {
      const counsellor = makeApprovedCounsellor();
      counsellor.professionalVerification.application = application;

      expect(isCounsellorProfessionallyApproved(counsellor, {
        now: NOW,
        config: CONFIG,
      })).toBe(false);
    }
  );

  test.each([undefined, null, true])(
    'requires legacyReviewRequired to be exactly false (%p)',
    (legacyReviewRequired) => {
      const counsellor = makeApprovedCounsellor();
      counsellor.professionalVerification.legacyReviewRequired =
        legacyReviewRequired;

      expect(isCounsellorProfessionallyApproved(counsellor, {
        now: NOW,
        config: CONFIG,
      })).toBe(false);
    }
  );

  test('does not trust the retired isVerified flag', () => {
    const unapproved = makeApprovedCounsellor({
      status: 'under_review',
      isVerified: true,
    });

    expect(isCounsellorProfessionallyApproved(unapproved, {
      now: NOW,
      config: CONFIG,
    })).toBe(false);
  });

  test('requires availability only when requested', () => {
    const unavailable = makeApprovedCounsellor({ isAvailable: false });

    expect(isCounsellorProfessionallyApproved(unavailable, {
      now: NOW,
      config: CONFIG,
    })).toBe(true);
    expect(isCounsellorProfessionallyApproved(unavailable, {
      now: NOW,
      config: CONFIG,
      requireAvailability: true,
    })).toBe(false);
  });

  test('eligibility and its query remain current when only the notice URL is unavailable', () => {
    const verificationOnlyConfig = {
      configured: false,
      verificationConfigured: true,
      registrationConfigured: false,
      onboardingConsentVersion: CONFIG.onboardingConsentVersion,
      credentialPolicyVersion: CONFIG.credentialPolicyVersion,
      onboardingNoticeUrl: null,
    };

    expect(isCounsellorProfessionallyApproved(makeApprovedCounsellor(), {
      now: NOW,
      config: verificationOnlyConfig,
    })).toBe(true);
    expect(buildProfessionallyApprovedCounsellorQuery({
      now: NOW,
      config: verificationOnlyConfig,
    })).not.toEqual(buildImpossibleEligibilityQuery());
  });

  test('treats expiry at the exact clock boundary as expired', () => {
    const atBoundary = makeApprovedCounsellor();
    atBoundary.professionalVerification.expiresAt = new Date(NOW);

    expect(isProfessionalVerificationExpired(new Date(NOW), { now: NOW }))
      .toBe(true);
    expect(isProfessionalVerificationExpired(
      new Date(NOW.getTime() + 1),
      { now: NOW }
    )).toBe(false);
    expect(isCounsellorProfessionallyApproved(atBoundary, {
      now: NOW,
      config: CONFIG,
    })).toBe(false);
  });

  test('builds the database eligibility query from the same strict boundary', () => {
    const query = buildProfessionallyApprovedCounsellorQuery({
      now: NOW,
      config: CONFIG,
      requireAvailability: true,
    });

    expect(query).toEqual(expect.objectContaining({
      status: 'approved',
      isActive: true,
      isAvailable: true,
      user: { $type: 'objectId' },
      'professionalVerification.application': { $type: 'objectId' },
      'professionalVerification.schemaVersion': 1,
      'professionalVerification.legacyReviewRequired': false,
      'professionalVerification.expiresAt': { $type: 'date', $gt: NOW },
      $expr: expect.any(Object),
    }));
    expect(query).not.toHaveProperty('isVerified');
    expect(query.$expr.$and).toEqual(expect.arrayContaining([
      { $eq: [{ $type: '$status' }, 'string'] },
      { $eq: ['$status', 'approved'] },
      { $eq: [{ $type: '$isActive' }, 'bool'] },
      { $eq: [{ $type: '$user' }, 'objectId'] },
      { $isNumber: '$professionalVerification.schemaVersion' },
      {
        $eq: [
          { $type: '$professionalVerification.application' },
          'objectId',
        ],
      },
    ]));
  });

  test.each([
    [{}, NOW],
    [{
      configured: false,
      verificationConfigured: false,
      onboardingConsentVersion: CONFIG.onboardingConsentVersion,
      credentialPolicyVersion: CONFIG.credentialPolicyVersion,
    }, NOW],
    [{
      onboardingConsentVersion: CONFIG.onboardingConsentVersion,
      credentialPolicyVersion: CONFIG.credentialPolicyVersion,
    }, NOW],
    [CONFIG, new Date('invalid')],
  ])('returns an impossible query for unusable config or time', (config, now) => {
    expect(buildProfessionallyApprovedCounsellorQuery({ config, now }))
      .toEqual(buildImpossibleEligibilityQuery());
  });
});
