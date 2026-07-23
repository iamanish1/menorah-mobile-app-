const crypto = require('crypto');
const mongoose = require('mongoose');
const {
  COUNSELLOR_VERIFICATION_TRANSACTION_OPTIONS,
  createCounsellorVerificationService,
  prepareCounsellorActivation,
} = require('../counsellorVerificationService');

const NOW = new Date('2026-07-23T08:00:00.000Z');
const ADMIN_ID = new mongoose.Types.ObjectId('64f000000000000000000001');
const CURRENT_CONFIG = Object.freeze({
  configured: true,
  onboardingConsentVersion: 'counsellor-onboarding-v1-2026-07-23',
  credentialPolicyVersion: 'credential-review-v1-2026-07-23',
  onboardingNoticeUrl: 'https://legal.menorah.example/counsellor-onboarding',
  invalidFields: Object.freeze([]),
});

const idString = (value) => String(value?._id || value || '');

const makeApplication = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  firstName: 'Mira',
  lastName: 'Shah',
  email: 'mira@example.org',
  phone: '+919999999999',
  dateOfBirth: new Date('1988-04-12T00:00:00.000Z'),
  gender: 'female',
  licenseNumber: 'DECLARED-LICENSE-42',
  specialization: 'Anxiety',
  specializations: ['Anxiety'],
  experience: 8,
  bio: 'Applicant supplied biography',
  languages: ['English', 'Hindi'],
  hourlyRate: 1400,
  currency: 'INR',
  education: [{ degree: 'Applicant supplied degree' }],
  certifications: [{ name: 'Applicant supplied certificate' }],
  availability: {},
  statusLookupTokenHash: 'status-token-hash',
  status: 'submitted',
  legacyReviewRequired: false,
  onboardingConsent: {
    accepted: true,
    version: CURRENT_CONFIG.onboardingConsentVersion,
    acceptedAt: new Date('2026-07-23T07:00:00.000Z'),
    source: 'counsellor_web_registration',
  },
  credentialEvidence: [],
  credentialReview: {
    decision: 'pending',
    policyVersion: null,
    evidenceIds: [],
    reviewedBy: null,
    reviewedAt: null,
  },
  statusHistory: [],
  ...overrides,
});

const makeApprovalGraph = ({
  application: applicationOverrides = {},
  counsellor: counsellorOverrides = {},
  user: userOverrides = {},
} = {}) => {
  const applicationId = new mongoose.Types.ObjectId();
  const counsellorId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const application = makeApplication({
    _id: applicationId,
    status: 'under_review',
    linkedUser: userId,
    linkedCounsellor: counsellorId,
    reviewStartedBy: ADMIN_ID,
    reviewStartedAt: new Date('2026-07-23T07:30:00.000Z'),
    statusHistory: [],
    ...applicationOverrides,
  });
  const user = {
    _id: userId,
    firstName: 'Mira',
    lastName: 'Shah',
    email: application.email,
    phone: application.phone,
    role: 'counsellor',
    isActive: false,
    isEmailVerified: false,
    isPhoneVerified: true,
    sessionVersion: 4,
    ...userOverrides,
  };
  if (!Object.prototype.hasOwnProperty.call(applicationOverrides, 'reviewAccountSnapshot')) {
    application.reviewAccountSnapshot = {
      user: userId,
      role: user.role,
      isActive: user.isActive,
      sessionVersion: user.sessionVersion,
      email: user.email.toLowerCase(),
      phone: user.phone,
      capturedAt: application.reviewStartedAt,
    };
  }
  const baseVerification = {
    application: applicationId,
    onboardingConsent: application.onboardingConsent,
    reviewStartedBy: ADMIN_ID,
    reviewStartedAt: application.reviewStartedAt,
    legacyReviewRequired: false,
    schemaVersion: 1,
    statusHistory: [],
  };
  const counsellor = {
    _id: counsellorId,
    user: userId,
    status: 'under_review',
    isVerified: false,
    isActive: false,
    isAvailable: false,
    professionalVerification: {
      ...baseVerification,
      ...(counsellorOverrides.professionalVerification || {}),
    },
    ...counsellorOverrides,
  };
  counsellor.professionalVerification = {
    ...baseVerification,
    ...(counsellorOverrides.professionalVerification || {}),
  };
  return { application, counsellor, user };
};

const validCredentialEvidence = (overrides = {}) => [{
  reference: 'vault://counsellor-evidence/license-42',
  category: 'license',
  sha256: 'A'.repeat(64),
  contentType: 'application/pdf',
  sizeBytes: 4096,
  ...overrides,
}];

const createHarness = ({
  applications = [],
  counsellors = [],
  users = [],
  saveErrors = {},
  config = CURRENT_CONFIG,
} = {}) => {
  const session = {
    withTransaction: jest.fn(async (operation) => operation()),
    endSession: jest.fn(async () => undefined),
  };
  const mongooseInstance = {
    startSession: jest.fn(async () => session),
    Types: mongoose.Types,
  };
  const collections = {
    application: [...applications],
    counsellor: [...counsellors],
    user: [...users],
  };
  const created = {
    application: [],
    counsellor: [],
    user: [],
  };
  const updates = [];
  const queries = [];

  const attachSave = (document, kind) => {
    if (!document._id) document._id = new mongoose.Types.ObjectId();
    document.save = jest.fn(async (options) => {
      if (saveErrors[kind]) throw saveErrors[kind];
      document.lastSaveOptions = options;
      return document;
    });
    return document;
  };

  Object.entries(collections).forEach(([kind, documents]) => {
    documents.forEach((document) => attachSave(document, kind));
  });

  const makeQuery = (value) => {
    const query = {};
    query.collation = jest.fn((receivedCollation) => {
      query.receivedCollation = receivedCollation;
      return query;
    });
    query.select = jest.fn(() => query);
    query.session = jest.fn(async (receivedSession) => {
      query.receivedSession = receivedSession;
      return value;
    });
    queries.push(query);
    return query;
  };

  const findById = (kind, id) => (
    collections[kind].find((document) => idString(document) === idString(id)) || null
  );

  class UserModel {
    constructor(data) {
      Object.assign(this, data);
      attachSave(this, 'user');
      collections.user.push(this);
      created.user.push(this);
    }

    static findOne(filter) {
      const user = collections.user.find((candidate) => (
        ('email' in filter && candidate.email === filter.email)
        || ('phone' in filter && candidate.phone === filter.phone)
      )) || null;
      return makeQuery(user);
    }

    static findById(id) {
      return makeQuery(findById('user', id));
    }
  }

  class CounsellorModel {
    constructor(data) {
      Object.assign(this, data);
      attachSave(this, 'counsellor');
      collections.counsellor.push(this);
      created.counsellor.push(this);
    }

    static findOne(filter) {
      const counsellor = collections.counsellor.find((candidate) => {
        if ('_id' in filter && idString(candidate) !== idString(filter._id)) {
          return false;
        }
        if ('user' in filter && idString(candidate.user) !== idString(filter.user)) {
          return false;
        }
        if (
          'licenseNumber' in filter
          && String(candidate.licenseNumber || '').toLocaleLowerCase('en-US')
            !== String(filter.licenseNumber || '').toLocaleLowerCase('en-US')
        ) {
          return false;
        }
        return true;
      }) || null;
      return makeQuery(counsellor);
    }

    static findById(id) {
      return makeQuery(findById('counsellor', id));
    }

    static async updateOne(filter, update, options) {
      updates.push({ filter, update, options });
      const counsellor = findById('counsellor', filter._id);
      const matches = Boolean(
        counsellor
        && counsellor.status === filter.status
        && idString(counsellor.user) === idString(filter.user)
        && idString(counsellor.professionalVerification?.application)
          === idString(filter['professionalVerification.application'])
        && counsellor.professionalVerification?.expiresAt?.getTime?.()
          === filter['professionalVerification.expiresAt']?.getTime?.()
      );
      return {
        acknowledged: true,
        matchedCount: matches ? 1 : 0,
        modifiedCount: matches ? 1 : 0,
      };
    }
  }

  class PendingApplicationModel {
    constructor(data) {
      Object.assign(this, data);
      attachSave(this, 'application');
      collections.application.push(this);
      created.application.push(this);
    }

    static findById(id) {
      return makeQuery(findById('application', id));
    }

    static findOne(filter) {
      const application = collections.application.find((candidate) => {
        if ('_id' in filter && idString(candidate) !== idString(filter._id)) {
          return false;
        }
        if (
          'linkedCounsellor' in filter
          && idString(candidate.linkedCounsellor) !== idString(filter.linkedCounsellor)
        ) {
          return false;
        }
        if (filter.status?.$in && !filter.status.$in.includes(candidate.status)) {
          return false;
        }
        if (
          'legacyReviewRequired' in filter
          && candidate.legacyReviewRequired !== filter.legacyReviewRequired
        ) {
          return false;
        }
        if (
          'licenseNumber' in filter
          && String(candidate.licenseNumber || '').toLocaleLowerCase('en-US')
            !== String(filter.licenseNumber || '').toLocaleLowerCase('en-US')
        ) {
          return false;
        }
        return true;
      }) || null;
      return makeQuery(application);
    }
  }

  const service = createCounsellorVerificationService({
    mongooseInstance,
    UserModel,
    CounsellorModel,
    PendingApplicationModel,
    configReader: jest.fn(() => config),
    nowProvider: () => new Date(NOW),
  });

  return {
    collections,
    created,
    mongooseInstance,
    queries,
    service,
    session,
    updates,
  };
};

describe('counsellorVerificationService', () => {
  describe('transaction wrapper and start review', () => {
    test('starts review in a majority transaction and creates separated dormant records', async () => {
      const application = makeApplication();
      const harness = createHarness({ applications: [application] });

      const result = await harness.service.startReview({
        applicationId: application._id,
        adminId: ADMIN_ID,
      });

      expect(harness.mongooseInstance.startSession).toHaveBeenCalledTimes(1);
      expect(harness.session.withTransaction).toHaveBeenCalledWith(
        expect.any(Function),
        COUNSELLOR_VERIFICATION_TRANSACTION_OPTIONS
      );
      expect(harness.session.endSession).toHaveBeenCalledTimes(1);
      expect(harness.queries.every((query) => query.receivedSession === harness.session)).toBe(true);

      expect(result.createdDormantUser).toBe(true);
      expect(result.user).toEqual(expect.objectContaining({
        role: 'counsellor',
        isActive: false,
        isEmailVerified: false,
        isPhoneVerified: false,
      }));
      expect(result.counsellor).toEqual(expect.objectContaining({
        user: result.user._id,
        status: 'under_review',
        isVerified: false,
        isActive: false,
        isAvailable: false,
      }));
      expect(result.counsellor.professionalVerification).toEqual(expect.objectContaining({
        application: application._id,
        onboardingConsent: application.onboardingConsent,
        reviewStartedBy: ADMIN_ID,
        reviewStartedAt: NOW,
      }));
      expect(application).toEqual(expect.objectContaining({
        status: 'under_review',
        linkedUser: result.user._id,
        linkedCounsellor: result.counsellor._id,
        reviewAccountSnapshot: {
          user: result.user._id,
          role: 'counsellor',
          isActive: false,
          sessionVersion: 0,
          email: application.email,
          phone: application.phone,
          capturedAt: NOW,
        },
      }));
      expect(application.save).toHaveBeenCalledWith({ session: harness.session });
      expect(result.counsellor.save).toHaveBeenCalledWith({ session: harness.session });
      expect(result.user.save).toHaveBeenCalledWith({ session: harness.session });
      expect(harness.collections.application).toContain(application);
    });

    test('rejects an anonymous application that matches an existing account', async () => {
      const application = makeApplication();
      const existingUser = {
        _id: new mongoose.Types.ObjectId(),
        email: application.email,
        phone: application.phone,
        role: 'user',
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: false,
      };
      const harness = createHarness({
        applications: [application],
        users: [existingUser],
      });

      await expect(harness.service.startReview({
        applicationId: application._id,
        adminId: ADMIN_ID,
      })).rejects.toMatchObject({
        code: 'EXISTING_ACCOUNT_REQUIRES_SEPARATE_INTAKE',
        status: 409,
      });

      expect(existingUser).toEqual(expect.objectContaining({
        role: 'user',
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: false,
      }));
      expect(existingUser.save).not.toHaveBeenCalled();
      expect(harness.created.user).toHaveLength(0);
      expect(harness.created.counsellor).toHaveLength(0);
      expect(application.save).not.toHaveBeenCalled();
    });

    test('rejects a case-only license collision without inferring qualification sufficiency', async () => {
      const application = makeApplication({
        licenseNumber: 'declared-license-42',
      });
      const existingCounsellor = {
        _id: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        licenseNumber: 'DECLARED-LICENSE-42',
      };
      const harness = createHarness({
        applications: [application],
        counsellors: [existingCounsellor],
      });

      await expect(harness.service.startReview({
        applicationId: application._id,
        adminId: ADMIN_ID,
      })).rejects.toMatchObject({
        code: 'LICENSE_CONFLICT',
        status: 409,
      });

      const licenseQuery = harness.queries.find(
        ({ receivedCollation }) => receivedCollation
      );
      expect(licenseQuery.receivedCollation).toEqual({
        locale: 'en',
        strength: 2,
        normalization: true,
      });
      expect(harness.created.user).toHaveLength(0);
      expect(harness.created.counsellor).toHaveLength(0);
      expect(application.save).not.toHaveBeenCalled();
    });

    test('starts linked re-verification for a case-only license variant using the retained canonical audit', async () => {
      const userId = new mongoose.Types.ObjectId();
      const counsellorId = new mongoose.Types.ObjectId();
      const previousApplicationId = new mongoose.Types.ObjectId();
      const user = {
        _id: userId,
        email: 'mira@example.org',
        phone: '+919999999999',
        role: 'counsellor',
        isActive: false,
        sessionVersion: 3,
      };
      const previousApplication = makeApplication({
        _id: previousApplicationId,
        status: 'suspended',
        linkedUser: userId,
        linkedCounsellor: counsellorId,
      });
      const counsellor = {
        _id: counsellorId,
        user: userId,
        licenseNumber: previousApplication.licenseNumber,
        status: 'suspended',
        isVerified: false,
        isActive: false,
        isAvailable: false,
        professionalVerification: {
          application: previousApplicationId,
          schemaVersion: 1,
          legacyReviewRequired: false,
          statusHistory: [],
        },
      };
      const application = makeApplication({
        status: 'submitted',
        licenseNumber: previousApplication.licenseNumber.toLowerCase(),
        linkedUser: userId,
        linkedCounsellor: counsellorId,
        supersedesApplication: previousApplicationId,
        onboardingConsent: {
          accepted: true,
          version: CURRENT_CONFIG.onboardingConsentVersion,
          acceptedAt: new Date('2026-07-23T07:00:00.000Z'),
          source: 'counsellor_web_reverification',
        },
        reverificationAuthorization: {
          tokenHash: 'a'.repeat(64),
          issuedBy: ADMIN_ID,
          issuedAt: new Date('2026-07-23T06:30:00.000Z'),
          expiresAt: new Date('2026-07-24T06:30:00.000Z'),
          consentVersion: CURRENT_CONFIG.onboardingConsentVersion,
          redeemedAt: new Date('2026-07-23T07:00:00.000Z'),
        },
      });
      const harness = createHarness({
        applications: [previousApplication, application],
        counsellors: [counsellor],
        users: [user],
      });

      const result = await harness.service.startReview({
        applicationId: application._id,
        adminId: ADMIN_ID,
      });

      expect(result.createdDormantUser).toBe(false);
      expect(application.status).toBe('under_review');
      expect(application.reviewAccountSnapshot).toEqual({
        user: userId,
        role: 'counsellor',
        isActive: false,
        sessionVersion: 4,
        email: user.email,
        phone: user.phone,
        capturedAt: NOW,
      });
      expect(previousApplication.status).toBe('suspended');
      expect(counsellor).toEqual(expect.objectContaining({
        licenseNumber: application.licenseNumber,
        status: 'under_review',
        isVerified: false,
        isActive: false,
        isAvailable: false,
      }));
      expect(counsellor.professionalVerification.application).toEqual(application._id);
      expect(user).toEqual(expect.objectContaining({
        isActive: false,
        sessionVersion: 4,
      }));
      const identityQueries = harness.queries.filter(
        ({ receivedCollation }) => receivedCollation
      );
      expect(identityQueries).toHaveLength(2);
      identityQueries.forEach(({ receivedCollation }) => {
        expect(receivedCollation).toEqual({
          locale: 'en',
          strength: 2,
          normalization: true,
        });
      });
    });

    test('rejects linked re-verification without the redeemed invitation audit', async () => {
      const userId = new mongoose.Types.ObjectId();
      const counsellorId = new mongoose.Types.ObjectId();
      const previousApplication = makeApplication({
        status: 'suspended',
        linkedUser: userId,
        linkedCounsellor: counsellorId,
      });
      const user = {
        _id: userId,
        email: previousApplication.email,
        phone: previousApplication.phone,
        role: 'counsellor',
        isActive: false,
      };
      const counsellor = {
        _id: counsellorId,
        user: userId,
        licenseNumber: previousApplication.licenseNumber,
        status: 'suspended',
        isVerified: false,
        isActive: false,
        isAvailable: false,
        professionalVerification: {
          application: previousApplication._id,
          schemaVersion: 1,
          legacyReviewRequired: false,
          statusHistory: [],
        },
      };
      const application = makeApplication({
        status: 'submitted',
        linkedUser: userId,
        linkedCounsellor: counsellorId,
        supersedesApplication: previousApplication._id,
        onboardingConsent: {
          accepted: true,
          version: CURRENT_CONFIG.onboardingConsentVersion,
          acceptedAt: new Date('2026-07-23T07:00:00.000Z'),
          source: 'counsellor_web_reverification',
        },
        reverificationAuthorization: undefined,
      });
      const harness = createHarness({
        applications: [previousApplication, application],
        counsellors: [counsellor],
        users: [user],
      });

      await expect(harness.service.startReview({
        applicationId: application._id,
        adminId: ADMIN_ID,
      })).rejects.toMatchObject({ code: 'REVIEW_LINKAGE_INVALID' });

      expect(application.status).toBe('submitted');
      expect(counsellor.status).toBe('suspended');
      expect(user.sessionVersion).toBeUndefined();
      expect(application.save).not.toHaveBeenCalled();
    });

    test('allows a fail-closed migrated profile to bootstrap review without an invented predecessor', async () => {
      const userId = new mongoose.Types.ObjectId();
      const counsellorId = new mongoose.Types.ObjectId();
      const user = {
        _id: userId,
        email: 'mira@example.org',
        phone: '+919999999999',
        role: 'counsellor',
        isActive: false,
        sessionVersion: 1,
      };
      const counsellor = {
        _id: counsellorId,
        user: userId,
        licenseNumber: 'DECLARED-LICENSE-42',
        status: 'suspended',
        isVerified: false,
        isActive: false,
        isAvailable: false,
        professionalVerification: {
          application: null,
          schemaVersion: 1,
          legacyReviewRequired: true,
          migrationVersion: '20260723-professional-verification-v1',
          statusHistory: [],
        },
      };
      const application = makeApplication({
        status: 'submitted',
        linkedUser: userId,
        linkedCounsellor: counsellorId,
        supersedesApplication: null,
        onboardingConsent: {
          accepted: true,
          version: CURRENT_CONFIG.onboardingConsentVersion,
          acceptedAt: new Date('2026-07-23T07:00:00.000Z'),
          source: 'counsellor_web_reverification',
        },
        reverificationAuthorization: {
          tokenHash: 'b'.repeat(64),
          issuedBy: ADMIN_ID,
          issuedAt: new Date('2026-07-23T06:30:00.000Z'),
          expiresAt: new Date('2026-07-24T06:30:00.000Z'),
          consentVersion: CURRENT_CONFIG.onboardingConsentVersion,
          redeemedAt: new Date('2026-07-23T07:00:00.000Z'),
        },
      });
      const harness = createHarness({
        applications: [application],
        counsellors: [counsellor],
        users: [user],
      });

      await expect(harness.service.startReview({
        applicationId: application._id,
        adminId: ADMIN_ID,
      })).resolves.toEqual(expect.objectContaining({ createdDormantUser: false }));

      expect(application.status).toBe('under_review');
      expect(counsellor.status).toBe('under_review');
      expect(counsellor.professionalVerification).toEqual(expect.objectContaining({
        application: application._id,
        migrationVersion: '20260723-professional-verification-v1',
        legacyReviewRequired: false,
      }));
    });

    test.each([
      [
        'stale consent',
        {
          onboardingConsent: {
            accepted: true,
            version: 'stale-version',
            acceptedAt: new Date('2026-07-23T07:00:00.000Z'),
            source: 'counsellor_web_registration',
          },
        },
        'CURRENT_COUNSELLOR_CONSENT_REQUIRED',
      ],
      [
        'an already-started state',
        { status: 'under_review' },
        'INVALID_VERIFICATION_TRANSITION',
      ],
    ])('fails closed for %s and always ends the session', async (_label, overrides, code) => {
      const application = makeApplication(overrides);
      const harness = createHarness({ applications: [application] });

      await expect(harness.service.startReview({
        applicationId: application._id,
        adminId: ADMIN_ID,
      })).rejects.toMatchObject({ code });

      expect(harness.created.user).toHaveLength(0);
      expect(harness.created.counsellor).toHaveLength(0);
      expect(harness.session.endSession).toHaveBeenCalledTimes(1);
    });

    test('rejects applications whenever either asserted identity belongs to an account', async () => {
      const application = makeApplication();
      const harness = createHarness({
        applications: [application],
        users: [
          {
            _id: new mongoose.Types.ObjectId(),
            email: application.email,
            phone: '+911111111111',
            role: 'user',
          },
          {
            _id: new mongoose.Types.ObjectId(),
            email: 'other@example.org',
            phone: application.phone,
            role: 'user',
          },
        ],
      });

      await expect(harness.service.startReview({
        applicationId: application._id,
        adminId: ADMIN_ID,
      })).rejects.toMatchObject({ code: 'EXISTING_ACCOUNT_REQUIRES_SEPARATE_INTAKE' });

      expect(harness.created.user).toHaveLength(0);
      expect(harness.created.counsellor).toHaveLength(0);
      expect(application.save).not.toHaveBeenCalled();
    });

    test('maps a duplicate-key race to a stable conflict and releases the session', async () => {
      const duplicateKeyError = Object.assign(new Error('duplicate key'), { code: 11000 });
      const application = makeApplication();
      const harness = createHarness({
        applications: [application],
        saveErrors: { counsellor: duplicateKeyError },
      });

      await expect(harness.service.startReview({
        applicationId: application._id,
        adminId: ADMIN_ID,
      })).rejects.toMatchObject({
        code: 'COUNSELLOR_REVIEW_CONFLICT',
        status: 409,
      });

      expect(application.save).not.toHaveBeenCalled();
      expect(harness.session.endSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('approval', () => {
    test.each([
      [
        'a stale credential policy',
        {
          credentialEvidence: validCredentialEvidence(),
          credentialPolicyVersion: 'stale-policy',
          verificationExpiresAt: new Date('2027-07-23T08:00:00.000Z'),
        },
        'CREDENTIAL_POLICY_VERSION_MISMATCH',
      ],
      [
        'missing reviewed evidence',
        {
          credentialEvidence: [],
          credentialPolicyVersion: CURRENT_CONFIG.credentialPolicyVersion,
          verificationExpiresAt: new Date('2027-07-23T08:00:00.000Z'),
        },
        'CREDENTIAL_EVIDENCE_REQUIRED',
      ],
    ])('rejects %s before opening a transaction', async (_label, input, code) => {
      const graph = makeApprovalGraph();
      const harness = createHarness({
        applications: [graph.application],
        counsellors: [graph.counsellor],
        users: [graph.user],
      });

      await expect(harness.service.approve({
        applicationId: graph.application._id,
        adminId: ADMIN_ID,
        ...input,
      })).rejects.toMatchObject({ code, status: 422 });

      expect(harness.mongooseInstance.startSession).not.toHaveBeenCalled();
    });

    test('requires a future verification expiry and rolls back an incomplete approval', async () => {
      const graph = makeApprovalGraph();
      const harness = createHarness({
        applications: [graph.application],
        counsellors: [graph.counsellor],
        users: [graph.user],
      });

      await expect(harness.service.approve({
        applicationId: graph.application._id,
        adminId: ADMIN_ID,
        credentialEvidence: validCredentialEvidence(),
        credentialPolicyVersion: CURRENT_CONFIG.credentialPolicyVersion,
        verificationExpiresAt: NOW,
      })).rejects.toMatchObject({
        code: 'APPROVAL_PREREQUISITES_INCOMPLETE',
        status: 422,
        details: expect.arrayContaining(['VERIFICATION_EXPIRY_REQUIRED']),
      });

      expect(graph.application.save).not.toHaveBeenCalled();
      expect(graph.counsellor.save).not.toHaveBeenCalled();
      expect(graph.user.save).not.toHaveBeenCalled();
      expect(harness.session.endSession).toHaveBeenCalledTimes(1);
    });

    test('stamps reviewed evidence and activates without changing contact verification', async () => {
      const graph = makeApprovalGraph();
      const suppliedEvidenceId = new mongoose.Types.ObjectId();
      const suppliedReviewTime = new Date('2020-01-01T00:00:00.000Z');
      const harness = createHarness({
        applications: [graph.application],
        counsellors: [graph.counsellor],
        users: [graph.user],
      });

      const result = await harness.service.approve({
        applicationId: graph.application._id,
        adminId: ADMIN_ID,
        credentialEvidence: validCredentialEvidence({
          _id: suppliedEvidenceId,
          source: 'applicant',
          submittedAt: suppliedReviewTime,
          review: {
            decision: 'rejected',
            policyVersion: 'untrusted-policy',
            reviewedBy: new mongoose.Types.ObjectId(),
            reviewedAt: suppliedReviewTime,
          },
        }),
        credentialPolicyVersion: CURRENT_CONFIG.credentialPolicyVersion,
        verificationExpiresAt: new Date('2027-07-23T08:00:00.000Z'),
      });

      const [storedEvidence] = graph.application.credentialEvidence;
      expect(idString(storedEvidence._id)).not.toBe(idString(suppliedEvidenceId));
      expect(storedEvidence).toEqual(expect.objectContaining({
        reference: 'vault://counsellor-evidence/license-42',
        category: 'license',
        sha256: 'a'.repeat(64),
        contentType: 'application/pdf',
        sizeBytes: 4096,
        submittedAt: NOW,
        source: 'admin_review',
        review: {
          decision: 'approved',
          policyVersion: CURRENT_CONFIG.credentialPolicyVersion,
          reviewedBy: ADMIN_ID,
          reviewedAt: NOW,
          reason: null,
        },
      }));
      expect(graph.application).toEqual(expect.objectContaining({
        status: 'approved',
        decisionBy: ADMIN_ID,
        decisionAt: NOW,
        verificationExpiresAt: new Date('2027-07-23T08:00:00.000Z'),
      }));
      expect(graph.application.credentialReview.evidenceIds).toEqual([storedEvidence._id]);
      expect(graph.counsellor).toEqual(expect.objectContaining({
        status: 'approved',
        isVerified: true,
        isActive: true,
        isAvailable: false,
      }));
      expect(graph.user).toEqual(expect.objectContaining({
        role: 'counsellor',
        isActive: true,
        isEmailVerified: false,
        isPhoneVerified: true,
        sessionVersion: 5,
      }));
      expect(result.activationToken).toMatch(/^[a-f0-9]{64}$/);
      expect(graph.user.passwordResetToken).toBe(
        crypto.createHash('sha256').update(result.activationToken).digest('hex')
      );
      expect(graph.user.passwordResetExpires).toEqual(
        new Date('2026-07-24T08:00:00.000Z')
      );
      expect(graph.application.save).toHaveBeenCalledWith({ session: harness.session });
      expect(graph.counsellor.save).toHaveBeenCalledWith({ session: harness.session });
      expect(graph.user.save).toHaveBeenCalledWith({ session: harness.session });
    });

    test.each([
      ['role', 'user'],
      ['isActive', true],
      ['sessionVersion', 5],
      ['email', 'changed@example.org'],
      ['phone', '+918888888888'],
    ])('rejects approval when the review account %s drifts', async (field, changedValue) => {
      const graph = makeApprovalGraph();
      graph.user[field] = changedValue;
      const harness = createHarness({
        applications: [graph.application],
        counsellors: [graph.counsellor],
        users: [graph.user],
      });

      await expect(harness.service.approve({
        applicationId: graph.application._id,
        adminId: ADMIN_ID,
        credentialEvidence: validCredentialEvidence(),
        credentialPolicyVersion: CURRENT_CONFIG.credentialPolicyVersion,
        verificationExpiresAt: new Date('2027-07-23T08:00:00.000Z'),
      })).rejects.toMatchObject({
        code: 'REVIEW_LINKAGE_INVALID',
        status: 409,
      });

      expect(graph.application.save).not.toHaveBeenCalled();
      expect(graph.counsellor.save).not.toHaveBeenCalled();
      expect(graph.user.save).not.toHaveBeenCalled();
    });

    test('clears stale suspension metadata when a re-reviewed counsellor is approved', async () => {
      const suspendedAt = new Date('2026-07-01T08:00:00.000Z');
      const graph = makeApprovalGraph({
        counsellor: {
          blockedAt: suspendedAt,
          blockedReason: 'Previous credential concern',
          professionalVerification: {
            suspendedBy: ADMIN_ID,
            suspendedAt,
            suspensionReason: 'Previous credential concern',
          },
        },
      });
      const harness = createHarness({
        applications: [graph.application],
        counsellors: [graph.counsellor],
        users: [graph.user],
      });

      await harness.service.approve({
        applicationId: graph.application._id,
        adminId: ADMIN_ID,
        credentialEvidence: validCredentialEvidence(),
        credentialPolicyVersion: CURRENT_CONFIG.credentialPolicyVersion,
        verificationExpiresAt: new Date('2027-07-23T08:00:00.000Z'),
      });

      expect(graph.counsellor).toEqual(expect.objectContaining({
        blockedAt: null,
        blockedReason: null,
      }));
      expect(graph.counsellor.professionalVerification).toEqual(expect.objectContaining({
        suspendedBy: null,
        suspendedAt: null,
        suspensionReason: null,
      }));
    });

    test('refuses approval unless both retained records are under review', async () => {
      const graph = makeApprovalGraph({
        counsellor: { status: 'approved' },
      });
      const harness = createHarness({
        applications: [graph.application],
        counsellors: [graph.counsellor],
        users: [graph.user],
      });

      await expect(harness.service.approve({
        applicationId: graph.application._id,
        adminId: ADMIN_ID,
        credentialEvidence: validCredentialEvidence(),
        credentialPolicyVersion: CURRENT_CONFIG.credentialPolicyVersion,
        verificationExpiresAt: new Date('2027-07-23T08:00:00.000Z'),
      })).rejects.toMatchObject({ code: 'INVALID_VERIFICATION_TRANSITION' });

      expect(graph.application.save).not.toHaveBeenCalled();
      expect(graph.user.save).not.toHaveBeenCalled();
    });
  });

  describe('rejection and suspension', () => {
    test('rejects only an under-review application and disables its linked profile', async () => {
      const graph = makeApprovalGraph();
      const harness = createHarness({
        applications: [graph.application],
        counsellors: [graph.counsellor],
      });

      const result = await harness.service.reject({
        applicationId: graph.application._id,
        adminId: ADMIN_ID,
        reason: 'Evidence could not be validated',
      });

      expect(result.application).toEqual(expect.objectContaining({
        status: 'rejected',
        rejectionReason: 'Evidence could not be validated',
        decisionBy: ADMIN_ID,
      }));
      expect(result.application.credentialReview).toEqual(expect.objectContaining({
        decision: 'rejected',
        reviewedBy: ADMIN_ID,
        reviewedAt: NOW,
      }));
      expect(result.counsellor).toEqual(expect.objectContaining({
        status: 'rejected',
        isVerified: false,
        isActive: false,
        isAvailable: false,
      }));

      const submitted = makeApplication();
      const invalidHarness = createHarness({ applications: [submitted] });
      await expect(invalidHarness.service.reject({
        applicationId: submitted._id,
        adminId: ADMIN_ID,
        reason: 'Premature rejection',
      })).rejects.toMatchObject({ code: 'INVALID_VERIFICATION_TRANSITION' });
      expect(submitted.save).not.toHaveBeenCalled();
    });

    test('suspends only approved counsellors and synchronizes the retained application', async () => {
      const graph = makeApprovalGraph({
        application: { status: 'approved' },
        counsellor: {
          status: 'approved',
          isVerified: true,
          isActive: true,
          isAvailable: true,
        },
        user: { role: 'counsellor', isActive: true, sessionVersion: 2 },
      });
      const harness = createHarness({
        applications: [graph.application],
        counsellors: [graph.counsellor],
        users: [graph.user],
      });

      await harness.service.suspend({
        counsellorId: graph.counsellor._id,
        adminId: ADMIN_ID,
        reason: 'Credential concern',
      });

      expect(graph.counsellor).toEqual(expect.objectContaining({
        status: 'suspended',
        isVerified: false,
        isActive: false,
        isAvailable: false,
        blockedAt: NOW,
        blockedReason: 'Credential concern',
      }));
      expect(graph.counsellor.professionalVerification).toEqual(expect.objectContaining({
        suspendedBy: ADMIN_ID,
        suspendedAt: NOW,
        suspensionReason: 'Credential concern',
      }));
      expect(graph.user).toEqual(expect.objectContaining({
        isActive: false,
        sessionVersion: 3,
      }));
      expect(graph.application.status).toBe('suspended');

      await expect(harness.service.suspend({
        counsellorId: graph.counsellor._id,
        adminId: ADMIN_ID,
        reason: 'Second suspension',
      })).rejects.toMatchObject({ code: 'INVALID_VERIFICATION_TRANSITION' });
    });
  });

  describe('expiry and re-verification', () => {
    test('expires only an approved verification at or beyond its server-side deadline', async () => {
      const futureGraph = makeApprovalGraph({
        application: { status: 'approved' },
        counsellor: {
          status: 'approved',
          isVerified: true,
          isActive: true,
          isAvailable: true,
          professionalVerification: {
            expiresAt: new Date('2026-07-23T08:00:00.001Z'),
          },
        },
        user: { role: 'counsellor', isActive: true },
      });
      const futureHarness = createHarness({
        applications: [futureGraph.application],
        counsellors: [futureGraph.counsellor],
        users: [futureGraph.user],
      });
      await expect(futureHarness.service.expire({
        counsellorId: futureGraph.counsellor._id,
        now: NOW,
      })).rejects.toMatchObject({ code: 'VERIFICATION_NOT_DUE_FOR_EXPIRY' });
      expect(futureGraph.counsellor.save).not.toHaveBeenCalled();
      expect(futureGraph.user.save).not.toHaveBeenCalled();

      const dueGraph = makeApprovalGraph({
        application: { status: 'approved' },
        counsellor: {
          status: 'approved',
          isVerified: true,
          isActive: true,
          isAvailable: true,
          professionalVerification: { expiresAt: NOW },
        },
        user: { role: 'counsellor', isActive: true, sessionVersion: 0 },
      });
      const dueHarness = createHarness({
        applications: [dueGraph.application],
        counsellors: [dueGraph.counsellor],
        users: [dueGraph.user],
      });
      await dueHarness.service.expire({
        counsellorId: dueGraph.counsellor._id,
        now: NOW,
      });

      expect(dueGraph.counsellor).toEqual(expect.objectContaining({
        status: 'expired',
        isVerified: false,
        isActive: false,
        isAvailable: false,
      }));
      expect(dueGraph.counsellor.professionalVerification.expiredAt).toEqual(NOW);
      expect(dueGraph.user).toEqual(expect.objectContaining({
        isActive: false,
        sessionVersion: 1,
      }));
      expect(dueGraph.application.status).toBe('expired');
      expect(dueHarness.updates).toEqual([
        expect.objectContaining({
          filter: expect.objectContaining({
            _id: dueGraph.counsellor._id,
            status: 'approved',
            'professionalVerification.application': dueGraph.application._id,
            'professionalVerification.expiresAt': NOW,
          }),
          update: {
            $set: expect.objectContaining({
              status: 'expired',
              isVerified: false,
              isActive: false,
              isAvailable: false,
              'professionalVerification.expiredAt': NOW,
            }),
            $push: {
              'professionalVerification.statusHistory': expect.objectContaining({
                from: 'approved',
                to: 'expired',
                actorType: 'system',
                actor: null,
                reason: 'verification_expired',
              }),
            },
          },
          options: {
            session: dueHarness.session,
            runValidators: true,
          },
        }),
      ]);
      expect(dueGraph.counsellor.save).not.toHaveBeenCalled();
    });

    test('issues a hashed, expiring invitation bound to the current consent version', async () => {
      const graph = makeApprovalGraph({
        application: { status: 'suspended' },
        counsellor: {
          status: 'suspended',
          isVerified: false,
          isActive: false,
          isAvailable: false,
        },
        user: { role: 'counsellor', isActive: false },
      });
      const harness = createHarness({
        applications: [graph.application],
        counsellors: [graph.counsellor],
        users: [graph.user],
      });

      const result = await harness.service.issueReverificationInvitation({
        counsellorId: graph.counsellor._id,
        adminId: ADMIN_ID,
      });

      expect(result.user).toBe(graph.user);
      expect(result.invitationToken).toMatch(/^[a-f0-9]{64}$/);
      expect(result.expiresAt).toEqual(new Date('2026-07-24T08:00:00.000Z'));
      expect(graph.counsellor.professionalVerification).toEqual(expect.objectContaining({
        reverificationInviteTokenHash: crypto
          .createHash('sha256')
          .update(result.invitationToken)
          .digest('hex'),
        reverificationInviteIssuedBy: ADMIN_ID,
        reverificationInviteIssuedAt: NOW,
        reverificationInviteExpiresAt: new Date('2026-07-24T08:00:00.000Z'),
        reverificationInviteConsentVersion: CURRENT_CONFIG.onboardingConsentVersion,
      }));
      expect(graph.counsellor.professionalVerification.reverificationInviteToken)
        .toBeUndefined();
      expect(graph.counsellor.save).toHaveBeenCalledWith({ session: harness.session });
      expect(graph.user.save).not.toHaveBeenCalled();
    });

    test('refuses to issue an invitation while a current application is active', async () => {
      const graph = makeApprovalGraph({
        application: { status: 'suspended' },
        counsellor: {
          status: 'suspended',
          isVerified: false,
          isActive: false,
          isAvailable: false,
        },
        user: { role: 'counsellor', isActive: false },
      });
      const activeApplication = makeApplication({
        status: 'submitted',
        linkedUser: graph.user._id,
        linkedCounsellor: graph.counsellor._id,
        legacyReviewRequired: false,
      });
      const harness = createHarness({
        applications: [graph.application, activeApplication],
        counsellors: [graph.counsellor],
        users: [graph.user],
      });

      await expect(harness.service.issueReverificationInvitation({
        counsellorId: graph.counsellor._id,
        adminId: ADMIN_ID,
      })).rejects.toMatchObject({
        code: 'COUNSELLOR_REVIEW_CONFLICT',
        status: 409,
      });

      expect(graph.counsellor.save).not.toHaveBeenCalled();
      expect(graph.user.save).not.toHaveBeenCalled();
      expect(harness.session.endSession).toHaveBeenCalledTimes(1);
    });

    test.each([
      ['approved state', { status: 'approved' }, {}, 'INVALID_VERIFICATION_TRANSITION'],
      ['non-counsellor account', { status: 'suspended' }, { role: 'user' }, 'REVIEW_LINKAGE_INVALID'],
      ['missing canonical email', { status: 'suspended' }, { email: '' }, 'REVIEW_LINKAGE_INVALID'],
    ])(
      'fails invitation issuance closed for %s',
      async (_label, counsellorOverrides, userOverrides, code) => {
        const graph = makeApprovalGraph({
          application: { status: counsellorOverrides.status },
          counsellor: {
            ...counsellorOverrides,
            isVerified: false,
            isActive: false,
            isAvailable: false,
          },
          user: {
            role: 'counsellor',
            isActive: false,
            ...userOverrides,
          },
        });
        const harness = createHarness({
          applications: [graph.application],
          counsellors: [graph.counsellor],
          users: [graph.user],
        });

        await expect(harness.service.issueReverificationInvitation({
          counsellorId: graph.counsellor._id,
          adminId: ADMIN_ID,
        })).rejects.toMatchObject({ code });

        expect(graph.counsellor.save).not.toHaveBeenCalled();
        expect(harness.session.endSession).toHaveBeenCalledTimes(1);
      }
    );
  });

  test('prepareCounsellorActivation issues a one-time 24-hour reset without contact side effects', () => {
    const user = {
      password: 'old-password',
      isEmailVerified: false,
      isPhoneVerified: true,
    };

    const token = prepareCounsellorActivation(user, NOW);

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(user.password).not.toBe('old-password');
    expect(user.password).not.toContain(token);
    expect(user.passwordResetToken).toBe(
      crypto.createHash('sha256').update(token).digest('hex')
    );
    expect(user.passwordResetExpires).toEqual(new Date('2026-07-24T08:00:00.000Z'));
    expect(user).toEqual(expect.objectContaining({
      isEmailVerified: false,
      isPhoneVerified: true,
    }));
  });
});
