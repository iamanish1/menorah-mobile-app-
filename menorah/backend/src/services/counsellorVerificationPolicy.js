const {
  COUNSELLOR_CONSENT_SOURCES,
  PROFESSIONAL_VERIFICATION_STATES,
  isApprovedVerificationVersion,
  readCounsellorVerificationConfig,
} = require('../config/counsellorVerification');

const PROFESSIONAL_VERIFICATION_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['submitted']),
  submitted: Object.freeze(['under_review']),
  under_review: Object.freeze(['approved', 'rejected']),
  approved: Object.freeze(['suspended', 'expired']),
  rejected: Object.freeze([]),
  suspended: Object.freeze(['under_review']),
  expired: Object.freeze(['under_review']),
});

const APPROVAL_FAILURES = Object.freeze({
  CONFIG_UNAVAILABLE: 'CONFIG_UNAVAILABLE',
  INVALID_SOURCE_STATE: 'INVALID_SOURCE_STATE',
  LEGACY_REVIEW_REQUIRED: 'LEGACY_REVIEW_REQUIRED',
  REVIEW_NOT_STARTED: 'REVIEW_NOT_STARTED',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  CONSENT_VERSION_MISMATCH: 'CONSENT_VERSION_MISMATCH',
  CONSENT_TIMESTAMP_INVALID: 'CONSENT_TIMESTAMP_INVALID',
  CONSENT_SOURCE_INVALID: 'CONSENT_SOURCE_INVALID',
  CREDENTIAL_EVIDENCE_REQUIRED: 'CREDENTIAL_EVIDENCE_REQUIRED',
  CREDENTIAL_EVIDENCE_METADATA_INVALID: 'CREDENTIAL_EVIDENCE_METADATA_INVALID',
  CREDENTIAL_EVIDENCE_REVIEW_INCOMPLETE: 'CREDENTIAL_EVIDENCE_REVIEW_INCOMPLETE',
  CREDENTIAL_REVIEW_NOT_APPROVED: 'CREDENTIAL_REVIEW_NOT_APPROVED',
  CREDENTIAL_POLICY_VERSION_MISMATCH: 'CREDENTIAL_POLICY_VERSION_MISMATCH',
  CREDENTIAL_REVIEWER_REQUIRED: 'CREDENTIAL_REVIEWER_REQUIRED',
  CREDENTIAL_REVIEW_TIMESTAMP_INVALID: 'CREDENTIAL_REVIEW_TIMESTAMP_INVALID',
  VERIFICATION_EXPIRY_REQUIRED: 'VERIFICATION_EXPIRY_REQUIRED',
});

const buildImpossibleEligibilityQuery = () => ({
  $and: [{ _id: { $exists: false } }],
});

const isValidDate = (value) => (
  value instanceof Date && Number.isFinite(value.getTime())
);

const isDateAtOrBefore = (value, now) => (
  isValidDate(value) && isValidDate(now) && value.getTime() <= now.getTime()
);

const identifierString = (value) => {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value.toHexString === 'function') return value.toHexString();
  if (value?._id && value._id !== value) return identifierString(value._id);
  return '';
};

const isObjectIdLike = (value) => /^[a-f0-9]{24}$/i.test(identifierString(value));

const exactStoredType = (path, type) => ({
  $eq: [{ $type: `$${path}` }, type],
});

const exactStoredValue = (path, value) => ({
  $eq: [`$${path}`, value],
});

const isUsableVerificationConfig = (config) => Boolean(
  config
  && (
    config.verificationConfigured === true
    || (
      config.verificationConfigured == null
      && config.configured === true
    )
  )
  && isApprovedVerificationVersion(config.onboardingConsentVersion)
  && isApprovedVerificationVersion(config.credentialPolicyVersion)
);

const resolveConfig = (config) => config || readCounsellorVerificationConfig();

const canTransitionProfessionalVerification = (from, to) => (
  PROFESSIONAL_VERIFICATION_STATES.includes(from)
  && PROFESSIONAL_VERIFICATION_STATES.includes(to)
  && PROFESSIONAL_VERIFICATION_TRANSITIONS[from].includes(to)
);

const isCurrentConsent = (consent, config, now) => Boolean(
  consent
  && consent.accepted === true
  && consent.version === config.onboardingConsentVersion
  && isDateAtOrBefore(consent.acceptedAt, now)
  && COUNSELLOR_CONSENT_SOURCES.includes(consent.source)
);

const isCurrentAggregateCredentialReview = (review, config, now) => Boolean(
  review
  && review.decision === 'approved'
  && review.policyVersion === config.credentialPolicyVersion
  && Array.isArray(review.evidenceIds)
  && review.evidenceIds.length > 0
  && review.evidenceIds.every(isObjectIdLike)
  && new Set(review.evidenceIds.map(identifierString)).size === review.evidenceIds.length
  && isObjectIdLike(review.reviewedBy)
  && isDateAtOrBefore(review.reviewedAt, now)
);

const isOptionalSha256Valid = (value) => (
  value == null || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
);

const isOptionalContentTypeValid = (value) => (
  value == null
  || (
    typeof value === 'string'
    && value.trim().length > 0
    && value.trim().length <= 100
  )
);

const isOptionalSizeValid = (value) => (
  value == null || (Number.isSafeInteger(value) && value > 0)
);

const isEvidenceMetadataComplete = (evidence, now) => Boolean(
  evidence
  && isObjectIdLike(evidence._id)
  && typeof evidence.reference === 'string'
  && evidence.reference.trim().length > 0
  && evidence.reference.trim().length <= 512
  && typeof evidence.category === 'string'
  && evidence.category.trim().length > 0
  && evidence.category.trim().length <= 100
  && typeof evidence.source === 'string'
  && evidence.source.trim().length > 0
  && evidence.source.trim().length <= 64
  && isDateAtOrBefore(evidence.submittedAt, now)
  && isOptionalSha256Valid(evidence.sha256)
  && isOptionalContentTypeValid(evidence.contentType)
  && isOptionalSizeValid(evidence.sizeBytes)
);

const isEvidenceReviewComplete = (evidence, config, now) => Boolean(
  evidence?.review
  && evidence.review.decision === 'approved'
  && evidence.review.policyVersion === config.credentialPolicyVersion
  && isObjectIdLike(evidence.review.reviewedBy)
  && isDateAtOrBefore(evidence.review.reviewedAt, now)
);

const validateProfessionalApprovalPrerequisites = ({
  application,
  verificationExpiresAt = application?.verificationExpiresAt,
  now = new Date(),
  config = readCounsellorVerificationConfig(),
} = {}) => {
  const resolvedConfig = resolveConfig(config);
  const failures = [];

  if (!isValidDate(now) || !isUsableVerificationConfig(resolvedConfig)) {
    failures.push(APPROVAL_FAILURES.CONFIG_UNAVAILABLE);
  }

  if (!application || application.status !== 'under_review') {
    failures.push(APPROVAL_FAILURES.INVALID_SOURCE_STATE);
  }
  if (application?.legacyReviewRequired !== false) {
    failures.push(APPROVAL_FAILURES.LEGACY_REVIEW_REQUIRED);
  }

  if (
    !isObjectIdLike(application?.reviewStartedBy)
    || !isDateAtOrBefore(application?.reviewStartedAt, now)
  ) {
    failures.push(APPROVAL_FAILURES.REVIEW_NOT_STARTED);
  }

  const consent = application?.onboardingConsent;
  if (consent?.accepted !== true) {
    failures.push(APPROVAL_FAILURES.CONSENT_REQUIRED);
  }
  if (consent?.version !== resolvedConfig.onboardingConsentVersion) {
    failures.push(APPROVAL_FAILURES.CONSENT_VERSION_MISMATCH);
  }
  if (!isDateAtOrBefore(consent?.acceptedAt, now)) {
    failures.push(APPROVAL_FAILURES.CONSENT_TIMESTAMP_INVALID);
  }
  if (!COUNSELLOR_CONSENT_SOURCES.includes(consent?.source)) {
    failures.push(APPROVAL_FAILURES.CONSENT_SOURCE_INVALID);
  }

  const evidence = Array.isArray(application?.credentialEvidence)
    ? application.credentialEvidence
    : [];
  const aggregateReview = application?.credentialReview;
  const reviewedEvidenceIds = Array.isArray(aggregateReview?.evidenceIds)
    ? aggregateReview.evidenceIds.map(identifierString)
    : [];
  const evidenceIds = evidence.map((item) => identifierString(item?._id));
  const hasDuplicateEvidenceIds = (
    new Set(evidenceIds).size !== evidenceIds.length
    || new Set(reviewedEvidenceIds).size !== reviewedEvidenceIds.length
  );

  if (evidence.length === 0 || reviewedEvidenceIds.length === 0) {
    failures.push(APPROVAL_FAILURES.CREDENTIAL_EVIDENCE_REQUIRED);
  }

  const evidenceById = new Map(evidence.map((item) => [identifierString(item?._id), item]));
  const selectedEvidence = reviewedEvidenceIds.map((id) => evidenceById.get(id));
  if (
    hasDuplicateEvidenceIds
    || evidenceIds.some((id) => !isObjectIdLike(id))
    || reviewedEvidenceIds.some((id) => !isObjectIdLike(id))
    || selectedEvidence.some((item) => !isEvidenceMetadataComplete(item, now))
  ) {
    failures.push(APPROVAL_FAILURES.CREDENTIAL_EVIDENCE_METADATA_INVALID);
  }
  if (
    selectedEvidence.length === 0
    || selectedEvidence.some((item) => !isEvidenceReviewComplete(item, resolvedConfig, now))
  ) {
    failures.push(APPROVAL_FAILURES.CREDENTIAL_EVIDENCE_REVIEW_INCOMPLETE);
  }

  if (aggregateReview?.decision !== 'approved') {
    failures.push(APPROVAL_FAILURES.CREDENTIAL_REVIEW_NOT_APPROVED);
  }
  if (aggregateReview?.policyVersion !== resolvedConfig.credentialPolicyVersion) {
    failures.push(APPROVAL_FAILURES.CREDENTIAL_POLICY_VERSION_MISMATCH);
  }
  if (!isObjectIdLike(aggregateReview?.reviewedBy)) {
    failures.push(APPROVAL_FAILURES.CREDENTIAL_REVIEWER_REQUIRED);
  }
  if (!isDateAtOrBefore(aggregateReview?.reviewedAt, now)) {
    failures.push(APPROVAL_FAILURES.CREDENTIAL_REVIEW_TIMESTAMP_INVALID);
  }

  if (
    !isValidDate(verificationExpiresAt)
    || !isValidDate(now)
    || verificationExpiresAt.getTime() <= now.getTime()
  ) {
    failures.push(APPROVAL_FAILURES.VERIFICATION_EXPIRY_REQUIRED);
  }

  return Object.freeze({
    ok: failures.length === 0,
    failures: Object.freeze([...new Set(failures)]),
  });
};

const isProfessionalVerificationExpired = (
  expiresAt,
  { now = new Date() } = {}
) => (
  !isValidDate(now)
  || !isValidDate(expiresAt)
  || expiresAt.getTime() <= now.getTime()
);

const isCounsellorProfessionallyApproved = (
  counsellor,
  {
    now = new Date(),
    config = readCounsellorVerificationConfig(),
    requireAvailability = false,
    account = (
      counsellor?.user
      && typeof counsellor.user === 'object'
      && 'isActive' in counsellor.user
        ? counsellor.user
        : null
    ),
  } = {}
) => {
  const resolvedConfig = resolveConfig(config);
  const verification = counsellor?.professionalVerification;

  if (!isValidDate(now) || !isUsableVerificationConfig(resolvedConfig)) return false;
  if (!counsellor || counsellor.status !== 'approved' || counsellor.isActive !== true) {
    return false;
  }
  if (
    !account
    || account.isActive !== true
    || account.role !== 'counsellor'
    || !isObjectIdLike(account._id)
    || !isObjectIdLike(counsellor.user)
    || identifierString(account._id) !== identifierString(counsellor.user)
  ) {
    return false;
  }
  if (requireAvailability && counsellor.isAvailable !== true) return false;
  if (
    !verification
    || verification.schemaVersion !== 1
    || verification.legacyReviewRequired !== false
    || !isObjectIdLike(verification.application)
    || !isCurrentConsent(verification.onboardingConsent, resolvedConfig, now)
    || !isCurrentAggregateCredentialReview(verification.credentialReview, resolvedConfig, now)
    || !isObjectIdLike(verification.approvedBy)
    || !isDateAtOrBefore(verification.approvedAt, now)
    || isProfessionalVerificationExpired(verification.expiresAt, { now })
  ) {
    return false;
  }

  return true;
};

const buildProfessionallyApprovedCounsellorQuery = ({
  now = new Date(),
  config = readCounsellorVerificationConfig(),
  requireAvailability = false,
} = {}) => {
  const resolvedConfig = resolveConfig(config);
  if (!isValidDate(now) || !isUsableVerificationConfig(resolvedConfig)) {
    return buildImpossibleEligibilityQuery();
  }

  const exactStoredApprovalGates = [
    exactStoredType('status', 'string'),
    exactStoredValue('status', 'approved'),
    exactStoredType('isActive', 'bool'),
    exactStoredValue('isActive', true),
    exactStoredType('user', 'objectId'),
    { $isNumber: '$professionalVerification.schemaVersion' },
    exactStoredValue('professionalVerification.schemaVersion', 1),
    exactStoredType('professionalVerification.legacyReviewRequired', 'bool'),
    exactStoredValue('professionalVerification.legacyReviewRequired', false),
    exactStoredType('professionalVerification.application', 'objectId'),
    exactStoredType('professionalVerification.onboardingConsent.accepted', 'bool'),
    exactStoredValue('professionalVerification.onboardingConsent.accepted', true),
    exactStoredType('professionalVerification.onboardingConsent.version', 'string'),
    exactStoredValue(
      'professionalVerification.onboardingConsent.version',
      resolvedConfig.onboardingConsentVersion
    ),
    exactStoredType('professionalVerification.onboardingConsent.acceptedAt', 'date'),
    {
      $lte: [
        '$professionalVerification.onboardingConsent.acceptedAt',
        now,
      ],
    },
    exactStoredType('professionalVerification.onboardingConsent.source', 'string'),
    {
      $in: [
        '$professionalVerification.onboardingConsent.source',
        [...COUNSELLOR_CONSENT_SOURCES],
      ],
    },
    exactStoredType('professionalVerification.credentialReview.decision', 'string'),
    exactStoredValue('professionalVerification.credentialReview.decision', 'approved'),
    exactStoredType('professionalVerification.credentialReview.policyVersion', 'string'),
    exactStoredValue(
      'professionalVerification.credentialReview.policyVersion',
      resolvedConfig.credentialPolicyVersion
    ),
    exactStoredType('professionalVerification.credentialReview.reviewedBy', 'objectId'),
    exactStoredType('professionalVerification.credentialReview.reviewedAt', 'date'),
    {
      $lte: [
        '$professionalVerification.credentialReview.reviewedAt',
        now,
      ],
    },
    exactStoredType('professionalVerification.approvedBy', 'objectId'),
    exactStoredType('professionalVerification.approvedAt', 'date'),
    { $lte: ['$professionalVerification.approvedAt', now] },
    exactStoredType('professionalVerification.expiresAt', 'date'),
    { $gt: ['$professionalVerification.expiresAt', now] },
    ...(requireAvailability
      ? [
        exactStoredType('isAvailable', 'bool'),
        exactStoredValue('isAvailable', true),
      ]
      : []),
  ];

  return {
    status: 'approved',
    isActive: true,
    ...(requireAvailability ? { isAvailable: true } : {}),
    user: { $type: 'objectId' },
    'professionalVerification.schemaVersion': 1,
    'professionalVerification.legacyReviewRequired': false,
    'professionalVerification.application': { $type: 'objectId' },
    'professionalVerification.onboardingConsent.accepted': true,
    'professionalVerification.onboardingConsent.version':
      resolvedConfig.onboardingConsentVersion,
    'professionalVerification.onboardingConsent.acceptedAt': {
      $type: 'date',
      $lte: now,
    },
    'professionalVerification.onboardingConsent.source': {
      $in: [...COUNSELLOR_CONSENT_SOURCES],
    },
    'professionalVerification.credentialReview.decision': 'approved',
    'professionalVerification.credentialReview.policyVersion':
      resolvedConfig.credentialPolicyVersion,
    'professionalVerification.credentialReview.evidenceIds.0': { $exists: true },
    'professionalVerification.credentialReview.reviewedBy': { $type: 'objectId' },
    'professionalVerification.credentialReview.reviewedAt': {
      $type: 'date',
      $lte: now,
    },
    'professionalVerification.approvedBy': { $type: 'objectId' },
    'professionalVerification.approvedAt': { $type: 'date', $lte: now },
    'professionalVerification.expiresAt': { $type: 'date', $gt: now },
    $expr: {
      $and: [
        ...exactStoredApprovalGates,
        {
          $let: {
            vars: {
              evidenceIds: '$professionalVerification.credentialReview.evidenceIds',
            },
            in: {
              $cond: [
                { $isArray: '$$evidenceIds' },
                {
                  $and: [
                    { $gt: [{ $size: '$$evidenceIds' }, 0] },
                    {
                      $eq: [
                        { $size: '$$evidenceIds' },
                        { $size: { $setUnion: ['$$evidenceIds', []] } },
                      ],
                    },
                    {
                      $allElementsTrue: {
                        $map: {
                          input: '$$evidenceIds',
                          as: 'evidenceId',
                          in: { $eq: [{ $type: '$$evidenceId' }, 'objectId'] },
                        },
                      },
                    },
                  ],
                },
                false,
              ],
            },
          },
        },
      ],
    },
  };
};

module.exports = {
  APPROVAL_FAILURES,
  PROFESSIONAL_VERIFICATION_TRANSITIONS,
  buildImpossibleEligibilityQuery,
  canTransitionProfessionalVerification,
  validateProfessionalApprovalPrerequisites,
  isProfessionalVerificationExpired,
  isCounsellorProfessionallyApproved,
  buildProfessionallyApprovedCounsellorQuery,
};
