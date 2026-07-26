const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Counsellor = require('../models/Counsellor');
const PendingApplication = require('../models/PendingApplication');
const { revokeAllSessions } = require('../utils/sessionLifecycle');
const {
  COUNSELLOR_LICENSE_IDENTITY_COLLATION,
  COUNSELLOR_CONSENT_SOURCES,
  readCounsellorVerificationConfig,
} = require('../config/counsellorVerification');
const {
  canTransitionProfessionalVerification,
  validateProfessionalApprovalPrerequisites,
} = require('./counsellorVerificationPolicy');

const COUNSELLOR_VERIFICATION_TRANSACTION_OPTIONS = Object.freeze({
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
});
const REVERIFICATION_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

class CounsellorVerificationError extends Error {
  constructor(code, message, { status = 409, details = [] } = {}) {
    super(message);
    this.name = 'CounsellorVerificationError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const comparableId = (value) => String(value?._id || value || '');

const toDate = (value) => {
  if (value instanceof Date) return new Date(value.getTime());
  const parsed = value ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
};

const consentSnapshot = (consent = {}) => ({
  accepted: consent.accepted === true,
  version: typeof consent.version === 'string' ? consent.version.trim() : null,
  acceptedAt: toDate(consent.acceptedAt),
  source: typeof consent.source === 'string' ? consent.source.trim() : null,
});

const reviewAccountSnapshot = (user, capturedAt) => ({
  user: user._id,
  role: user.role,
  isActive: user.isActive === true,
  sessionVersion: Number.isSafeInteger(user.sessionVersion) ? user.sessionVersion : 0,
  email: String(user.email || '').trim().toLowerCase(),
  phone: String(user.phone || '').trim(),
  capturedAt,
});

const reviewAccountMatchesSnapshot = (user, snapshot) => Boolean(
  user
  && snapshot
  && comparableId(user) === comparableId(snapshot.user)
  && user.role === snapshot.role
  && (user.isActive === true) === snapshot.isActive
  && (Number.isSafeInteger(user.sessionVersion) ? user.sessionVersion : 0)
    === snapshot.sessionVersion
  && String(user.email || '').trim().toLowerCase() === snapshot.email
  && String(user.phone || '').trim() === snapshot.phone
  && toDate(snapshot.capturedAt)
);

const isObjectIdLike = (value) => /^[a-f0-9]{24}$/i.test(comparableId(value));

const isValidReverificationAuthorization = ({
  authorization,
  consent,
  config,
  now,
}) => {
  const issuedAt = toDate(authorization?.issuedAt);
  const expiresAt = toDate(authorization?.expiresAt);
  const redeemedAt = toDate(authorization?.redeemedAt);
  const acceptedAt = toDate(consent?.acceptedAt);
  return Boolean(
    authorization
    && typeof authorization.tokenHash === 'string'
    && /^[a-f0-9]{64}$/.test(authorization.tokenHash)
    && isObjectIdLike(authorization.issuedBy)
    && issuedAt
    && expiresAt
    && redeemedAt
    && acceptedAt
    && issuedAt <= redeemedAt
    && redeemedAt < expiresAt
    && redeemedAt <= now
    && redeemedAt.getTime() === acceptedAt.getTime()
    && authorization.consentVersion === config.onboardingConsentVersion
    && authorization.consentVersion === consent.version
  );
};

const assertConfigured = (config) => {
  const verificationConfigured = config?.verificationConfigured === true
    || (config?.verificationConfigured === undefined && config?.configured === true);
  if (!verificationConfigured) {
    throw new CounsellorVerificationError(
      'VERIFICATION_CONFIG_UNAVAILABLE',
      'Counsellor verification configuration is unavailable.',
      {
        status: 503,
        details: (config?.invalidFields || []).filter(
          (field) => field !== 'COUNSELLOR_ONBOARDING_NOTICE_URL'
        ),
      }
    );
  }
};

const assertApplicationConsent = ({ application, config, now }) => {
  const consent = consentSnapshot(application?.onboardingConsent);
  if (
    consent.accepted !== true
    || consent.version !== config.onboardingConsentVersion
    || !consent.acceptedAt
    || consent.acceptedAt > now
    || !COUNSELLOR_CONSENT_SOURCES.includes(consent.source)
  ) {
    throw new CounsellorVerificationError(
      'CURRENT_COUNSELLOR_CONSENT_REQUIRED',
      'The application does not contain current counsellor verification consent.',
      { status: 422 }
    );
  }
  return consent;
};

const statusHistoryEntry = ({
  from,
  to,
  at,
  actor,
  actorType = actor ? 'admin' : 'system',
  reason = null,
}) => ({
  from,
  to,
  at,
  actorType,
  actor: actor || null,
  reason,
});

const prepareCounsellorActivation = (user, now = new Date()) => {
  const activationToken = crypto.randomBytes(32).toString('hex');
  user.password = `${crypto.randomBytes(32).toString('base64url')}Aa1`;
  user.passwordResetToken = crypto.createHash('sha256').update(activationToken).digest('hex');
  user.passwordResetExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return activationToken;
};

const createDormantPassword = () => `${crypto.randomBytes(48).toString('base64url')}Aa1`;

const normalizeCredentialEvidence = ({ evidence, adminId, now, config, mongooseInstance }) => {
  if (!Array.isArray(evidence) || evidence.length === 0 || evidence.length > 50) {
    throw new CounsellorVerificationError(
      'CREDENTIAL_EVIDENCE_REQUIRED',
      'At least one reviewed credential-evidence record is required.',
      { status: 422 }
    );
  }

  return evidence.map((item) => {
    const reference = typeof item?.reference === 'string' ? item.reference.trim() : '';
    const category = typeof item?.category === 'string' ? item.category.trim() : '';
    const sha256 = typeof item?.sha256 === 'string' && item.sha256.trim()
      ? item.sha256.trim().toLowerCase()
      : null;
    const contentType = typeof item?.contentType === 'string' && item.contentType.trim()
      ? item.contentType.trim()
      : null;
    const sizeBytes = item?.sizeBytes === undefined || item?.sizeBytes === null
      ? null
      : Number(item.sizeBytes);

    if (
      !reference
      || reference.length > 512
      || !category
      || category.length > 100
      || (sha256 && !/^[a-f0-9]{64}$/.test(sha256))
      || (contentType && contentType.length > 100)
      || (sizeBytes !== null && (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0))
    ) {
      throw new CounsellorVerificationError(
        'CREDENTIAL_EVIDENCE_METADATA_INVALID',
        'Credential-evidence metadata is incomplete or malformed.',
        { status: 422 }
      );
    }

    return {
      _id: new mongooseInstance.Types.ObjectId(),
      reference,
      category,
      sha256,
      contentType,
      sizeBytes,
      submittedAt: now,
      source: 'admin_review',
      review: {
        decision: 'approved',
        policyVersion: config.credentialPolicyVersion,
        reviewedBy: adminId,
        reviewedAt: now,
        reason: null,
      },
    };
  });
};

const applicationProfileFields = (application) => ({
  licenseNumber: application.licenseNumber,
  specialization: application.specialization,
  specializations: application.specializations?.length
    ? application.specializations
    : [application.specialization],
  experience: application.experience,
  bio: application.bio,
  languages: application.languages || [],
  hourlyRate: application.hourlyRate,
  currency: application.currency || 'INR',
  education: application.education || [],
  certifications: application.certifications || [],
  availability: application.availability || {},
});

const createCounsellorVerificationService = ({
  mongooseInstance = mongoose,
  UserModel = User,
  CounsellorModel = Counsellor,
  PendingApplicationModel = PendingApplication,
  configReader = readCounsellorVerificationConfig,
  nowProvider = () => new Date(),
} = {}) => {
  const withTransaction = async (operation) => {
    const session = await mongooseInstance.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await operation(session);
      }, COUNSELLOR_VERIFICATION_TRANSACTION_OPTIONS);
      return result;
    } catch (error) {
      if (error?.code === 11000) {
        throw new CounsellorVerificationError(
          'COUNSELLOR_REVIEW_CONFLICT',
          'The application conflicts with an existing account or counsellor profile.'
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  };

  const startReview = async ({ applicationId, adminId }) => {
    const now = nowProvider();
    const config = configReader();
    assertConfigured(config);

    return withTransaction(async (session) => {
      const application = await PendingApplicationModel.findById(applicationId)
        .select(
          '+statusLookupTokenHash +reverificationAuthorization '
          + '+reverificationAuthorization.tokenHash'
        )
        .session(session);
      if (!application) {
        throw new CounsellorVerificationError(
          'APPLICATION_NOT_FOUND',
          'Application not found.',
          { status: 404 }
        );
      }
      if (!canTransitionProfessionalVerification(application.status, 'under_review')) {
        throw new CounsellorVerificationError(
          'INVALID_VERIFICATION_TRANSITION',
          'Only a submitted application can enter review.'
        );
      }

      const consent = assertApplicationConsent({ application, config, now });
      if (application.legacyReviewRequired !== false) {
        throw new CounsellorVerificationError(
          'CURRENT_COUNSELLOR_CONSENT_REQUIRED',
          'A new application with current counsellor verification consent is required.',
          { status: 422 }
        );
      }

      const hasLinkedUser = Boolean(application.linkedUser);
      const hasLinkedCounsellor = Boolean(application.linkedCounsellor);
      if (hasLinkedUser !== hasLinkedCounsellor) {
        throw new CounsellorVerificationError(
          'REVIEW_LINKAGE_INVALID',
          'The application contains an incomplete account linkage.'
        );
      }

      if (hasLinkedUser && hasLinkedCounsellor) {
        const user = await UserModel.findById(application.linkedUser).session(session);
        const counsellor = await CounsellorModel.findOne({
          _id: application.linkedCounsellor,
          licenseNumber: application.licenseNumber,
        })
          .collation(COUNSELLOR_LICENSE_IDENTITY_COLLATION)
          .session(session);
        const previousApplicationId = counsellor?.professionalVerification?.application;
        const isMigratedBootstrap = Boolean(
          !previousApplicationId
          && counsellor?.professionalVerification?.legacyReviewRequired === true
          && typeof counsellor?.professionalVerification?.migrationVersion === 'string'
          && counsellor.professionalVerification.migrationVersion
        );
        const predecessorLookupId = previousApplicationId
          || (isMigratedBootstrap ? application.supersedesApplication : null);
        const previousApplication = predecessorLookupId
          ? await PendingApplicationModel.findOne({
            _id: predecessorLookupId,
            licenseNumber: application.licenseNumber,
          })
            .collation(COUNSELLOR_LICENSE_IDENTITY_COLLATION)
            .session(session)
          : null;
        const isLegacyDraftReconciliation = Boolean(
          counsellor?.status === 'draft'
          && counsellor.professionalVerification?.legacyReviewRequired === true
        );
        const canEnterReview = Boolean(
          counsellor
          && (
            canTransitionProfessionalVerification(counsellor.status, 'under_review')
            || isLegacyDraftReconciliation
          )
        );
        const canonicalPredecessorMatches = Boolean(
          previousApplicationId
          && previousApplication
          && comparableId(application.supersedesApplication)
            === comparableId(previousApplication)
          && previousApplication.status === counsellor.status
          && comparableId(previousApplication.linkedUser) === comparableId(user)
          && comparableId(previousApplication.linkedCounsellor) === comparableId(counsellor)
        );
        const migratedPredecessorMatches = Boolean(
          isMigratedBootstrap
          && (
            !application.supersedesApplication
            || (
              previousApplication
              && previousApplication.legacyReviewRequired === true
              && previousApplication.legacyMigrationVersion
                === counsellor.professionalVerification.migrationVersion
              && String(previousApplication.email || '').toLowerCase()
                === String(application.email || '').toLowerCase()
              && String(previousApplication.phone || '') === String(application.phone || '')
            )
          )
        );

        if (
          !user
          || !counsellor
          || user.role !== 'counsellor'
          || user.isActive !== false
          || counsellor.isActive !== false
          || counsellor.isAvailable !== false
          || comparableId(counsellor.user) !== comparableId(user)
          || String(user.email || '').toLowerCase() !== String(application.email || '').toLowerCase()
          || String(user.phone || '') !== String(application.phone || '')
          || application.onboardingConsent?.source !== 'counsellor_web_reverification'
          || !isValidReverificationAuthorization({
            authorization: application.reverificationAuthorization,
            consent,
            config,
            now,
          })
          || !counsellor.professionalVerification
          || (!canonicalPredecessorMatches && !migratedPredecessorMatches)
          || !canEnterReview
        ) {
          throw new CounsellorVerificationError(
            'REVIEW_LINKAGE_INVALID',
            'The re-verification application is not linked to an eligible canonical account.'
          );
        }

        const previousCounsellorStatus = counsellor.status;
        const previousHistory = counsellor.professionalVerification?.statusHistory || [];
        Object.assign(counsellor, applicationProfileFields(application));
        counsellor.applicationStatusTokenHash = application.statusLookupTokenHash;
        counsellor.status = 'under_review';
        counsellor.isVerified = false;
        counsellor.isActive = false;
        counsellor.isAvailable = false;
        counsellor.professionalVerification.application = application._id;
        counsellor.professionalVerification.onboardingConsent = consent;
        counsellor.professionalVerification.credentialReview = {
          decision: 'pending',
          policyVersion: null,
          evidenceIds: [],
          reviewedBy: null,
          reviewedAt: null,
        };
        counsellor.professionalVerification.reviewStartedBy = adminId;
        counsellor.professionalVerification.reviewStartedAt = now;
        counsellor.professionalVerification.reverificationRequestedAt = now;
        counsellor.professionalVerification.legacyReviewRequired = false;
        counsellor.professionalVerification.schemaVersion = 1;
        counsellor.professionalVerification.statusHistory = [
          ...previousHistory,
          ...(isLegacyDraftReconciliation
            ? [statusHistoryEntry({
              from: 'draft',
              to: 'submitted',
              at: consent.acceptedAt,
              actor: null,
              actorType: 'applicant',
              reason: 'fresh_consent_reverification_submitted',
            })]
            : []),
          statusHistoryEntry({
            from: isLegacyDraftReconciliation ? 'submitted' : previousCounsellorStatus,
            to: 'under_review',
            at: now,
            actor: adminId,
            reason: 'fresh_consent_reverification_started',
          }),
        ];

        const previousApplicationStatus = application.status;
        application.status = 'under_review';
        application.reviewStartedBy = adminId;
        application.reviewStartedAt = now;
        application.legacyReviewRequired = false;
        application.statusHistory.push(statusHistoryEntry({
          from: previousApplicationStatus,
          to: 'under_review',
          at: now,
          actor: adminId,
          reason: 'fresh_consent_reverification_started',
        }));

        user.isActive = false;
        revokeAllSessions(user);
        application.reviewAccountSnapshot = reviewAccountSnapshot(user, now);
        await counsellor.save({ session });
        await application.save({ session });
        await user.save({ session });
        return {
          application,
          counsellor,
          user,
          createdDormantUser: false,
        };
      }

      const existingByEmail = await UserModel.findOne({ email: application.email }).session(session);
      const existingByPhone = await UserModel.findOne({ phone: application.phone }).session(session);
      if (existingByEmail || existingByPhone) {
        throw new CounsellorVerificationError(
          'EXISTING_ACCOUNT_REQUIRES_SEPARATE_INTAKE',
          'An existing account cannot be converted through an anonymous counsellor application.'
        );
      }

      const existingLicense = await CounsellorModel.findOne({
        licenseNumber: application.licenseNumber,
      })
        .collation(COUNSELLOR_LICENSE_IDENTITY_COLLATION)
        .session(session);
      if (existingLicense) {
        throw new CounsellorVerificationError(
          'LICENSE_CONFLICT',
          'A counsellor profile already uses this declared license number.'
        );
      }

      const createdDormantUser = true;
      const user = new UserModel({
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        phone: application.phone,
        password: createDormantPassword(),
        dateOfBirth: application.dateOfBirth,
        gender: application.gender,
        role: 'counsellor',
        isActive: false,
        isEmailVerified: false,
        isPhoneVerified: false,
      });
      await user.save({ session });

      const counsellor = new CounsellorModel({
        user: user._id,
        applicationStatusTokenHash: application.statusLookupTokenHash,
        ...applicationProfileFields(application),
        status: 'under_review',
        isVerified: false,
        isActive: false,
        isAvailable: false,
        professionalVerification: {
          application: application._id,
          onboardingConsent: consent,
          reviewStartedBy: adminId,
          reviewStartedAt: now,
          legacyReviewRequired: false,
          schemaVersion: 1,
          statusHistory: [statusHistoryEntry({
            from: application.status,
            to: 'under_review',
            at: now,
            actor: adminId,
          })],
        },
      });
      await counsellor.save({ session });

      const previousStatus = application.status;
      application.status = 'under_review';
      application.reviewStartedBy = adminId;
      application.reviewStartedAt = now;
      application.legacyReviewRequired = false;
      application.linkedUser = user._id;
      application.linkedCounsellor = counsellor._id;
      application.reviewAccountSnapshot = reviewAccountSnapshot(user, now);
      application.statusHistory.push(statusHistoryEntry({
        from: previousStatus,
        to: 'under_review',
        at: now,
        actor: adminId,
      }));
      await application.save({ session });

      return {
        application,
        counsellor,
        user,
        createdDormantUser,
      };
    });
  };

  const approve = async ({
    applicationId,
    adminId,
    credentialEvidence,
    credentialPolicyVersion,
    verificationExpiresAt,
  }) => {
    const now = nowProvider();
    const config = configReader();
    assertConfigured(config);
    if (credentialPolicyVersion !== config.credentialPolicyVersion) {
      throw new CounsellorVerificationError(
        'CREDENTIAL_POLICY_VERSION_MISMATCH',
        'The credential policy version is not current.',
        { status: 422 }
      );
    }

    const expiry = toDate(verificationExpiresAt);
    const evidence = normalizeCredentialEvidence({
      evidence: credentialEvidence,
      adminId,
      now,
      config,
      mongooseInstance,
    });

    return withTransaction(async (session) => {
      const application = await PendingApplicationModel.findById(applicationId)
        .select('+statusLookupTokenHash +credentialEvidence.reference +reviewAccountSnapshot')
        .session(session);
      if (!application) {
        throw new CounsellorVerificationError(
          'APPLICATION_NOT_FOUND',
          'Application not found.',
          { status: 404 }
        );
      }
      if (!application.linkedCounsellor || !application.linkedUser) {
        throw new CounsellorVerificationError(
          'REVIEW_PROFILE_NOT_LINKED',
          'Start review before approving this application.'
        );
      }

      const counsellor = await CounsellorModel.findById(application.linkedCounsellor).session(session);
      const user = await UserModel.findById(application.linkedUser).session(session);
      if (
        !counsellor
        || !user
        || user.role !== 'counsellor'
        || user.isActive !== false
        || String(user.email || '').toLowerCase() !== String(application.email || '').toLowerCase()
        || String(user.phone || '') !== String(application.phone || '')
        || !reviewAccountMatchesSnapshot(user, application.reviewAccountSnapshot)
        || comparableId(counsellor.user) !== comparableId(user)
        || comparableId(counsellor.professionalVerification?.application) !== comparableId(application)
      ) {
        throw new CounsellorVerificationError(
          'REVIEW_LINKAGE_INVALID',
          'The review account linkage is invalid.'
        );
      }
      if (
        application.status !== 'under_review'
        || counsellor.status !== 'under_review'
        || !canTransitionProfessionalVerification(application.status, 'approved')
      ) {
        throw new CounsellorVerificationError(
          'INVALID_VERIFICATION_TRANSITION',
          'Only an application under review can be approved.'
        );
      }

      const aggregateReview = {
        decision: 'approved',
        policyVersion: config.credentialPolicyVersion,
        evidenceIds: evidence.map((item) => item._id),
        reviewedBy: adminId,
        reviewedAt: now,
      };
      application.credentialEvidence = evidence;
      application.credentialReview = aggregateReview;
      application.verificationExpiresAt = expiry;

      const prerequisiteResult = validateProfessionalApprovalPrerequisites({
        application,
        verificationExpiresAt: expiry,
        now,
        config,
      });
      if (!prerequisiteResult.ok) {
        throw new CounsellorVerificationError(
          'APPROVAL_PREREQUISITES_INCOMPLETE',
          'Counsellor approval prerequisites are incomplete.',
          { status: 422, details: prerequisiteResult.failures }
        );
      }

      const previousApplicationStatus = application.status;
      application.status = 'approved';
      application.decisionBy = adminId;
      application.decisionAt = now;
      application.decisionReason = null;
      application.reviewedBy = adminId;
      application.reviewedAt = now;
      application.rejectionReason = null;
      application.statusHistory.push(statusHistoryEntry({
        from: previousApplicationStatus,
        to: 'approved',
        at: now,
        actor: adminId,
      }));

      const previousVerificationHistory = counsellor.professionalVerification?.statusHistory || [];
      counsellor.status = 'approved';
      counsellor.isVerified = true;
      counsellor.isActive = true;
      // Availability is an operational opt-in after activation, never an approval side effect.
      counsellor.isAvailable = false;
      counsellor.approvedBy = adminId;
      counsellor.approvedAt = now;
      counsellor.rejectionReason = null;
      counsellor.blockedAt = null;
      counsellor.blockedReason = null;
      const marketplaceAssignmentFence = Number.isSafeInteger(
        counsellor.professionalVerification?.marketplaceAssignmentFence
      )
        ? counsellor.professionalVerification.marketplaceAssignmentFence
        : 0;
      counsellor.professionalVerification = {
        application: application._id,
        onboardingConsent: consentSnapshot(application.onboardingConsent),
        credentialReview: aggregateReview,
        reviewStartedBy: application.reviewStartedBy,
        reviewStartedAt: application.reviewStartedAt,
        approvedBy: adminId,
        approvedAt: now,
        expiresAt: expiry,
        suspendedBy: null,
        suspendedAt: null,
        suspensionReason: null,
        expiredAt: null,
        reverificationRequestedAt: null,
        marketplaceAssignmentFence,
        legacyReviewRequired: false,
        schemaVersion: 1,
        migrationVersion: counsellor.professionalVerification?.migrationVersion || null,
        legacySnapshot: counsellor.professionalVerification?.legacySnapshot,
        statusHistory: [
          ...previousVerificationHistory,
          statusHistoryEntry({
            from: 'under_review',
            to: 'approved',
            at: now,
            actor: adminId,
          }),
        ],
      };

      user.isActive = true;
      const activationToken = prepareCounsellorActivation(user, now);
      revokeAllSessions(user, { passwordChanged: true });

      await application.save({ session });
      await counsellor.save({ session });
      await user.save({ session });

      return { application, counsellor, user, activationToken };
    });
  };

  const reject = async ({ applicationId, adminId, reason }) => {
    const now = nowProvider();
    return withTransaction(async (session) => {
      const application = await PendingApplicationModel.findById(applicationId).session(session);
      if (!application) {
        throw new CounsellorVerificationError(
          'APPLICATION_NOT_FOUND',
          'Application not found.',
          { status: 404 }
        );
      }
      if (!canTransitionProfessionalVerification(application.status, 'rejected')) {
        throw new CounsellorVerificationError(
          'INVALID_VERIFICATION_TRANSITION',
          'This application cannot be rejected from its current state.'
        );
      }

      const previousStatus = application.status;
      application.status = 'rejected';
      application.decisionBy = adminId;
      application.decisionAt = now;
      application.decisionReason = reason;
      application.rejectionReason = reason;
      application.reviewedBy = adminId;
      application.reviewedAt = now;
      application.credentialReview.decision = 'rejected';
      application.credentialReview.reviewedBy = adminId;
      application.credentialReview.reviewedAt = now;
      application.statusHistory.push(statusHistoryEntry({
        from: previousStatus,
        to: 'rejected',
        at: now,
        actor: adminId,
        reason,
      }));

      let counsellor = null;
      if (application.linkedCounsellor) {
        counsellor = await CounsellorModel.findById(application.linkedCounsellor).session(session);
        if (
          !counsellor
          || counsellor.status !== 'under_review'
          || comparableId(counsellor.user) !== comparableId(application.linkedUser)
          || comparableId(counsellor.professionalVerification?.application)
            !== comparableId(application)
        ) {
          throw new CounsellorVerificationError(
            'REVIEW_LINKAGE_INVALID',
            'The linked counsellor review state is invalid.'
          );
        }
        const previousHistory = counsellor.professionalVerification?.statusHistory || [];
        counsellor.status = 'rejected';
        counsellor.isVerified = false;
        counsellor.isActive = false;
        counsellor.isAvailable = false;
        counsellor.rejectionReason = reason;
        counsellor.professionalVerification.statusHistory = [
          ...previousHistory,
          statusHistoryEntry({
            from: 'under_review',
            to: 'rejected',
            at: now,
            actor: adminId,
            reason,
          }),
        ];
        await counsellor.save({ session });
      }

      await application.save({ session });
      return { application, counsellor };
    });
  };

  const suspend = async ({ counsellorId, adminId, reason }) => {
    const now = nowProvider();
    return withTransaction(async (session) => {
      const counsellor = await CounsellorModel.findById(counsellorId).session(session);
      if (!counsellor) {
        throw new CounsellorVerificationError(
          'COUNSELLOR_NOT_FOUND',
          'Counsellor not found.',
          { status: 404 }
        );
      }
      if (!canTransitionProfessionalVerification(counsellor.status, 'suspended')) {
        throw new CounsellorVerificationError(
          'INVALID_VERIFICATION_TRANSITION',
          'Only an approved counsellor can be suspended.'
        );
      }
      const user = await UserModel.findById(counsellor.user).session(session);
      if (!user) {
        throw new CounsellorVerificationError('REVIEW_LINKAGE_INVALID', 'Counsellor account not found.');
      }
      const applicationId = counsellor.professionalVerification?.application;
      const application = applicationId
        ? await PendingApplicationModel.findById(applicationId).session(session)
        : null;
      if (
        !application
        || application.status !== 'approved'
        || comparableId(application.linkedCounsellor) !== comparableId(counsellor)
        || comparableId(application.linkedUser) !== comparableId(user)
      ) {
        throw new CounsellorVerificationError(
          'REVIEW_LINKAGE_INVALID',
          'The approved counsellor application linkage is invalid.'
        );
      }

      counsellor.status = 'suspended';
      counsellor.isVerified = false;
      counsellor.isActive = false;
      counsellor.isAvailable = false;
      counsellor.blockedAt = now;
      counsellor.blockedReason = reason;
      counsellor.professionalVerification.suspendedBy = adminId;
      counsellor.professionalVerification.suspendedAt = now;
      counsellor.professionalVerification.suspensionReason = reason;
      counsellor.professionalVerification.statusHistory.push(statusHistoryEntry({
        from: 'approved',
        to: 'suspended',
        at: now,
        actor: adminId,
        reason,
      }));

      user.isActive = false;
      revokeAllSessions(user);
      await counsellor.save({ session });
      await user.save({ session });

      application.status = 'suspended';
      application.statusHistory.push(statusHistoryEntry({
        from: 'approved',
        to: 'suspended',
        at: now,
        actor: adminId,
        reason,
      }));
      await application.save({ session });

      return { counsellor, user, application };
    });
  };

  const issueReverificationInvitation = async ({ counsellorId, adminId }) => {
    const now = nowProvider();
    const config = configReader();
    assertConfigured(config);

    return withTransaction(async (session) => {
      const counsellor = await CounsellorModel.findById(counsellorId).session(session);
      if (!counsellor) {
        throw new CounsellorVerificationError(
          'COUNSELLOR_NOT_FOUND',
          'Counsellor not found.',
          { status: 404 }
        );
      }
      if (
        !['suspended', 'expired'].includes(counsellor.status)
        && !(
          counsellor.status === 'draft'
          && counsellor.professionalVerification?.legacyReviewRequired === true
        )
      ) {
        throw new CounsellorVerificationError(
          'INVALID_VERIFICATION_TRANSITION',
          'A re-verification invitation is not available in the current state.'
        );
      }

      const user = await UserModel.findById(counsellor.user).session(session);
      if (
        !user
        || user.role !== 'counsellor'
        || comparableId(counsellor.user) !== comparableId(user)
        || !user.email
      ) {
        throw new CounsellorVerificationError(
          'REVIEW_LINKAGE_INVALID',
          'The counsellor account linkage is invalid.'
        );
      }
      const activeApplication = await PendingApplicationModel.findOne({
        linkedCounsellor: counsellor._id,
        status: { $in: ['draft', 'submitted', 'under_review', 'approved'] },
        legacyReviewRequired: false,
      }).session(session);
      if (activeApplication) {
        throw new CounsellorVerificationError(
          'COUNSELLOR_REVIEW_CONFLICT',
          'A current re-verification application already exists for this counsellor.'
        );
      }

      const invitationToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(now.getTime() + REVERIFICATION_INVITE_TTL_MS);
      counsellor.professionalVerification.reverificationInviteTokenHash = crypto
        .createHash('sha256')
        .update(invitationToken)
        .digest('hex');
      counsellor.professionalVerification.reverificationInviteIssuedBy = adminId;
      counsellor.professionalVerification.reverificationInviteIssuedAt = now;
      counsellor.professionalVerification.reverificationInviteExpiresAt = expiresAt;
      counsellor.professionalVerification.reverificationInviteConsentVersion =
        config.onboardingConsentVersion;
      await counsellor.save({ session });

      return { counsellor, user, invitationToken, expiresAt };
    });
  };

  const expire = async ({
    counsellorId,
    adminId = null,
    now = nowProvider(),
  }) => withTransaction(async (session) => {
    const counsellor = await CounsellorModel.findById(counsellorId).session(session);
    if (!counsellor) {
      throw new CounsellorVerificationError(
        'COUNSELLOR_NOT_FOUND',
        'Counsellor not found.',
        { status: 404 }
      );
    }
    const expiresAt = toDate(counsellor.professionalVerification?.expiresAt);
    if (
      counsellor.status !== 'approved'
      || !expiresAt
      || expiresAt > now
      || !canTransitionProfessionalVerification(counsellor.status, 'expired')
    ) {
      throw new CounsellorVerificationError(
        'VERIFICATION_NOT_DUE_FOR_EXPIRY',
        'This counsellor verification is not due for expiry.'
      );
    }
    const user = await UserModel.findById(counsellor.user).session(session);
    if (!user) {
      throw new CounsellorVerificationError('REVIEW_LINKAGE_INVALID', 'Counsellor account not found.');
    }
    const applicationId = counsellor.professionalVerification?.application;
    const application = applicationId
      ? await PendingApplicationModel.findById(applicationId).session(session)
      : null;
    if (
      !application
      || application.status !== 'approved'
      || comparableId(application.linkedCounsellor) !== comparableId(counsellor)
      || comparableId(application.linkedUser) !== comparableId(user)
    ) {
      throw new CounsellorVerificationError(
        'REVIEW_LINKAGE_INVALID',
        'The approved counsellor application linkage is invalid.'
      );
    }

    const counsellorExpiryHistory = statusHistoryEntry({
      from: 'approved',
      to: 'expired',
      at: now,
      actor: adminId,
      reason: 'verification_expired',
    });
    const expiryClaim = await CounsellorModel.updateOne({
      _id: counsellor._id,
      user: user._id,
      status: 'approved',
      'professionalVerification.application': application._id,
      'professionalVerification.expiresAt': expiresAt,
    }, {
      $set: {
        status: 'expired',
        isVerified: false,
        isActive: false,
        isAvailable: false,
        'professionalVerification.expiredAt': now,
      },
      $push: {
        'professionalVerification.statusHistory': counsellorExpiryHistory,
      },
    }, {
      session,
      runValidators: true,
    });
    if (expiryClaim.matchedCount !== 1) {
      throw new CounsellorVerificationError(
        'VERIFICATION_NOT_DUE_FOR_EXPIRY',
        'This counsellor verification was already reconciled or changed concurrently.'
      );
    }

    // Keep the returned document synchronized with the compare-and-set write.
    // The CAS is the multi-instance claim and is rolled back with the linked
    // User/Application writes if either invariant fails.
    counsellor.status = 'expired';
    counsellor.isVerified = false;
    counsellor.isActive = false;
    counsellor.isAvailable = false;
    counsellor.professionalVerification.expiredAt = now;
    counsellor.professionalVerification.statusHistory.push(counsellorExpiryHistory);
    user.isActive = false;
    revokeAllSessions(user);
    await user.save({ session });

    application.status = 'expired';
    application.statusHistory.push(statusHistoryEntry({
      from: 'approved',
      to: 'expired',
      at: now,
      actor: adminId,
      reason: 'verification_expired',
    }));
    await application.save({ session });
    return { counsellor, user, application };
  });

  return {
    startReview,
    approve,
    reject,
    suspend,
    issueReverificationInvitation,
    expire,
  };
};

const defaultService = createCounsellorVerificationService();

module.exports = {
  COUNSELLOR_VERIFICATION_TRANSACTION_OPTIONS,
  REVERIFICATION_INVITE_TTL_MS,
  CounsellorVerificationError,
  createCounsellorVerificationService,
  prepareCounsellorActivation,
  ...defaultService,
  _private: {
    applicationProfileFields,
    assertApplicationConsent,
    comparableId,
    consentSnapshot,
    isValidReverificationAuthorization,
    normalizeCredentialEvidence,
    reviewAccountMatchesSnapshot,
    reviewAccountSnapshot,
    statusHistoryEntry,
    toDate,
  },
};
