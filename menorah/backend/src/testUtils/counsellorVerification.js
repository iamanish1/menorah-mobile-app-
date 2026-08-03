const TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION = 'test-counsellor-onboarding-v1';
const TEST_COUNSELLOR_CREDENTIAL_POLICY_VERSION = 'test-counsellor-credential-policy-v1';
const TEST_COUNSELLOR_NOTICE_URL = 'https://consent.unit-test.org/counsellor-notice';
const TEST_APPLICATION_ID = '64f000000000000000000041';
const TEST_EVIDENCE_ID = '64f000000000000000000042';
const TEST_REVIEWER_ID = '64f000000000000000000043';

const installCounsellorVerificationTestConfig = () => {
  process.env.COUNSELLOR_ONBOARDING_CONSENT_VERSION =
    TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION;
  process.env.COUNSELLOR_CREDENTIAL_POLICY_VERSION =
    TEST_COUNSELLOR_CREDENTIAL_POLICY_VERSION;
  process.env.COUNSELLOR_ONBOARDING_NOTICE_URL = TEST_COUNSELLOR_NOTICE_URL;
};

const withCurrentProfessionalApproval = (counsellor, {
  userId = counsellor?.user?._id || counsellor?.user,
  populateUser = false,
} = {}) => {
  const professionalVerification = {
    application: TEST_APPLICATION_ID,
    schemaVersion: 1,
    legacyReviewRequired: false,
    onboardingConsent: {
      accepted: true,
      version: TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
      acceptedAt: new Date('2026-01-01T08:00:00.000Z'),
      source: 'counsellor_web_registration',
    },
    credentialReview: {
      decision: 'approved',
      policyVersion: TEST_COUNSELLOR_CREDENTIAL_POLICY_VERSION,
      evidenceIds: [TEST_EVIDENCE_ID],
      reviewedBy: TEST_REVIEWER_ID,
      reviewedAt: new Date('2026-01-01T09:00:00.000Z'),
    },
    approvedBy: TEST_REVIEWER_ID,
    approvedAt: new Date('2026-01-01T09:30:00.000Z'),
    expiresAt: new Date('2100-01-01T00:00:00.000Z'),
  };

  return {
  status: 'approved',
  isActive: true,
  isAvailable: true,
  professionalVerification,
  ...counsellor,
  user: populateUser
    ? {
      ...(counsellor?.user && typeof counsellor.user === 'object'
        ? counsellor.user
        : {}),
      _id: userId,
      role: 'counsellor',
      isActive: true,
    }
    : userId,
  professionalVerification: counsellor.professionalVerification === undefined
    ? professionalVerification
    : counsellor.professionalVerification,
  };
};

module.exports = {
  TEST_APPLICATION_ID,
  TEST_COUNSELLOR_CREDENTIAL_POLICY_VERSION,
  TEST_COUNSELLOR_NOTICE_URL,
  TEST_COUNSELLOR_ONBOARDING_CONSENT_VERSION,
  TEST_EVIDENCE_ID,
  TEST_REVIEWER_ID,
  installCounsellorVerificationTestConfig,
  withCurrentProfessionalApproval,
};
