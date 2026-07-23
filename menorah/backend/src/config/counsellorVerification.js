const net = require('net');

const PROFESSIONAL_VERIFICATION_STATES = Object.freeze([
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'suspended',
  'expired',
]);

const LEGACY_PROFESSIONAL_VERIFICATION_STATES = Object.freeze(['pending']);

const COUNSELLOR_CONSENT_SOURCES = Object.freeze([
  'counsellor_web_registration',
  'counsellor_web_reverification',
]);

const CURRENT_APPLICATION_IDENTITY_STATES = Object.freeze([
  'submitted',
  'under_review',
  'approved',
]);

// License strings remain applicant-issued display values. This collation is
// only the identity boundary that prevents case-only variants from becoming
// separate counsellor identities.
const COUNSELLOR_LICENSE_IDENTITY_COLLATION = Object.freeze({
  locale: 'en',
  strength: 2,
  normalization: true,
});

const MAX_VERIFICATION_VERSION_LENGTH = 128;
const MAX_NOTICE_URL_LENGTH = 2048;
const PLACEHOLDER_PATTERN = /(?:^|[/_.\s-])(?:change(?:me)?|replace(?:me)?|placeholder|example|todo|tbd|pending|unapproved|not[_\s-]*approved|set[_\s-]*after|your)(?:$|[/_.\s-])/i;

const normalizeValue = (value) => (
  typeof value === 'string' ? value.trim() : ''
);

const isApprovedConfigurationValue = (value) => {
  const normalized = normalizeValue(value);
  return normalized.length > 0 && !PLACEHOLDER_PATTERN.test(normalized);
};

const isApprovedVerificationVersion = (value) => {
  const normalized = normalizeValue(value);
  return (
    normalized.length <= MAX_VERIFICATION_VERSION_LENGTH
    && isApprovedConfigurationValue(normalized)
  );
};

const parseHttpsUrl = (value) => {
  const normalized = normalizeValue(value);
  if (
    normalized.length > MAX_NOTICE_URL_LENGTH
    || !isApprovedConfigurationValue(normalized)
  ) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    const hostname = parsed.hostname
      .replace(/^\[|\]$/g, '')
      .replace(/\.+$/g, '')
      .toLowerCase();
    if (
      parsed.protocol !== 'https:'
      || !hostname
      || parsed.username
      || parsed.password
      || hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || hostname.endsWith('.test')
      || net.isIP(hostname) !== 0
    ) {
      return null;
    }
    const isReservedExampleHostname = ['example.com', 'example.net', 'example.org']
      .some((reservedHostname) => (
        hostname === reservedHostname || hostname.endsWith(`.${reservedHostname}`)
      ));
    if (
      isReservedExampleHostname
      || hostname.endsWith('.example')
      || hostname.endsWith('.invalid')
    ) {
      return null;
    }
    parsed.hostname = hostname;
    return parsed.toString();
  } catch {
    return null;
  }
};

const readCounsellorVerificationConfig = (env = process.env) => {
  const source = env && typeof env === 'object' ? env : {};
  const onboardingConsentVersion = normalizeValue(
    source.COUNSELLOR_ONBOARDING_CONSENT_VERSION
  );
  const credentialPolicyVersion = normalizeValue(
    source.COUNSELLOR_CREDENTIAL_POLICY_VERSION
  );
  const onboardingNoticeUrl = parseHttpsUrl(
    source.COUNSELLOR_ONBOARDING_NOTICE_URL
  );
  const invalidFields = [];

  if (!isApprovedVerificationVersion(onboardingConsentVersion)) {
    invalidFields.push('COUNSELLOR_ONBOARDING_CONSENT_VERSION');
  }
  if (!isApprovedVerificationVersion(credentialPolicyVersion)) {
    invalidFields.push('COUNSELLOR_CREDENTIAL_POLICY_VERSION');
  }
  if (!onboardingNoticeUrl) {
    invalidFields.push('COUNSELLOR_ONBOARDING_NOTICE_URL');
  }

  return Object.freeze({
    configured: invalidFields.length === 0,
    verificationConfigured: !invalidFields.includes('COUNSELLOR_ONBOARDING_CONSENT_VERSION')
      && !invalidFields.includes('COUNSELLOR_CREDENTIAL_POLICY_VERSION'),
    registrationConfigured: invalidFields.length === 0,
    onboardingConsentVersion: invalidFields.includes('COUNSELLOR_ONBOARDING_CONSENT_VERSION')
      ? null
      : onboardingConsentVersion,
    credentialPolicyVersion: invalidFields.includes('COUNSELLOR_CREDENTIAL_POLICY_VERSION')
      ? null
      : credentialPolicyVersion,
    onboardingNoticeUrl,
    invalidFields: Object.freeze(invalidFields),
  });
};

const getPublicCounsellorVerificationRequirements = (env = process.env) => {
  const config = readCounsellorVerificationConfig(env);
  return Object.freeze({
    configured: config.configured,
    verificationConfigured: config.verificationConfigured,
    registrationConfigured: config.registrationConfigured,
    onboardingConsentVersion: config.onboardingConsentVersion,
    onboardingNoticeUrl: config.onboardingNoticeUrl,
    credentialPolicyVersion: config.credentialPolicyVersion,
  });
};

module.exports = {
  PROFESSIONAL_VERIFICATION_STATES,
  LEGACY_PROFESSIONAL_VERIFICATION_STATES,
  COUNSELLOR_CONSENT_SOURCES,
  CURRENT_APPLICATION_IDENTITY_STATES,
  COUNSELLOR_LICENSE_IDENTITY_COLLATION,
  isApprovedConfigurationValue,
  isApprovedVerificationVersion,
  parseHttpsUrl,
  readCounsellorVerificationConfig,
  getPublicCounsellorVerificationRequirements,
};
