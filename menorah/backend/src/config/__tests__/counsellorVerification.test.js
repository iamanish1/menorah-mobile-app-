const {
  getPublicCounsellorVerificationRequirements,
  isApprovedConfigurationValue,
  parseHttpsUrl,
  readCounsellorVerificationConfig,
} = require('../counsellorVerification');

const VALID_ENV = Object.freeze({
  COUNSELLOR_ONBOARDING_CONSENT_VERSION: 'counsellor-onboarding-v1-2026-07-23',
  COUNSELLOR_CREDENTIAL_POLICY_VERSION: 'credential-review-v1-2026-07-23',
  COUNSELLOR_ONBOARDING_NOTICE_URL:
    'https://legal.mentle.app/counsellor-verification',
});

describe('counsellor verification configuration', () => {
  test.each([
    undefined,
    null,
    123,
    {},
    '',
    '   ',
    'change-me',
    'REPLACE_WITH_APPROVED_VERSION',
    'credential-placeholder-v1',
    'pending-legal-approval',
    'not-approved',
    'set-after-owner-review',
    'your-consent-version',
  ])('rejects missing or placeholder configuration values (%p)', (value) => {
    expect(isApprovedConfigurationValue(value)).toBe(false);
  });

  test.each([
    'counsellor-onboarding-v1-2026-07-23',
    'credential-review.v2',
    'policy_2026_07',
  ])('accepts an explicit non-placeholder version (%s)', (value) => {
    expect(isApprovedConfigurationValue(value)).toBe(true);
  });

  test('rejects verification versions that cannot fit the persisted schema', () => {
    const config = readCounsellorVerificationConfig({
      ...VALID_ENV,
      COUNSELLOR_ONBOARDING_CONSENT_VERSION: 'v'.repeat(129),
    });

    expect(config.verificationConfigured).toBe(false);
    expect(config.onboardingConsentVersion).toBeNull();
    expect(config.invalidFields).toContain(
      'COUNSELLOR_ONBOARDING_CONSENT_VERSION'
    );
  });

  test('accepts and canonicalizes an absolute HTTPS notice URL', () => {
    expect(parseHttpsUrl(' https://legal.mentle.app/counsellor-verification '))
      .toBe('https://legal.mentle.app/counsellor-verification');
  });

  test.each([
    undefined,
    '',
    '/counsellor-verification',
    'http://legal.mentle.app/counsellor-verification',
    'https://user:password@legal.mentle.app/counsellor-verification',
    'https://example.com/counsellor-verification',
    'https://legal.example.org/counsellor-verification',
    'https://legal.example/counsellor-verification',
    'https://legal.invalid/counsellor-verification',
    'https://localhost/counsellor-verification',
    'https://localhost./counsellor-verification',
    'https://127.0.0.1/counsellor-verification',
    'https://legal.local/counsellor-verification',
    'https://legal.local./counsellor-verification',
    'https://example.com./counsellor-verification',
    'https://legal.example.org./counsellor-verification',
    'https://replace-me.example.org/counsellor-verification',
    'not a URL',
  ])('rejects an unsafe or placeholder notice URL (%p)', (value) => {
    expect(parseHttpsUrl(value)).toBeNull();
  });

  test('returns a complete immutable configuration for approved values', () => {
    const config = readCounsellorVerificationConfig(VALID_ENV);

    expect(config).toEqual({
      configured: true,
      verificationConfigured: true,
      registrationConfigured: true,
      onboardingConsentVersion: VALID_ENV.COUNSELLOR_ONBOARDING_CONSENT_VERSION,
      credentialPolicyVersion: VALID_ENV.COUNSELLOR_CREDENTIAL_POLICY_VERSION,
      onboardingNoticeUrl: VALID_ENV.COUNSELLOR_ONBOARDING_NOTICE_URL,
      invalidFields: [],
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.invalidFields)).toBe(true);
  });

  test('fails closed and identifies every missing or unsafe field', () => {
    const config = readCounsellorVerificationConfig({
      COUNSELLOR_ONBOARDING_CONSENT_VERSION: 'replace-me',
      COUNSELLOR_CREDENTIAL_POLICY_VERSION: '',
      COUNSELLOR_ONBOARDING_NOTICE_URL: 'http://legal.mentle.app/notice',
    });

    expect(config).toEqual({
      configured: false,
      verificationConfigured: false,
      registrationConfigured: false,
      onboardingConsentVersion: null,
      credentialPolicyVersion: null,
      onboardingNoticeUrl: null,
      invalidFields: [
        'COUNSELLOR_ONBOARDING_CONSENT_VERSION',
        'COUNSELLOR_CREDENTIAL_POLICY_VERSION',
        'COUNSELLOR_ONBOARDING_NOTICE_URL',
      ],
    });
  });

  test('returns only safe public requirement fields', () => {
    const requirements = getPublicCounsellorVerificationRequirements(VALID_ENV);

    expect(requirements).toEqual({
      configured: true,
      verificationConfigured: true,
      registrationConfigured: true,
      onboardingConsentVersion: VALID_ENV.COUNSELLOR_ONBOARDING_CONSENT_VERSION,
      onboardingNoticeUrl: VALID_ENV.COUNSELLOR_ONBOARDING_NOTICE_URL,
      credentialPolicyVersion: VALID_ENV.COUNSELLOR_CREDENTIAL_POLICY_VERSION,
    });
    expect(requirements).not.toHaveProperty('invalidFields');
    expect(Object.keys(requirements)).toEqual([
      'configured',
      'verificationConfigured',
      'registrationConfigured',
      'onboardingConsentVersion',
      'onboardingNoticeUrl',
      'credentialPolicyVersion',
    ]);
    expect(Object.isFrozen(requirements)).toBe(true);
  });

  test('the public reader remains safe when configuration is unavailable', () => {
    expect(getPublicCounsellorVerificationRequirements({})).toEqual({
      configured: false,
      verificationConfigured: false,
      registrationConfigured: false,
      onboardingConsentVersion: null,
      onboardingNoticeUrl: null,
      credentialPolicyVersion: null,
    });
    expect(() => getPublicCounsellorVerificationRequirements(null))
      .not.toThrow();
  });

  test('separates approval policy configuration from registration notice readiness', () => {
    const config = readCounsellorVerificationConfig({
      COUNSELLOR_ONBOARDING_CONSENT_VERSION:
        VALID_ENV.COUNSELLOR_ONBOARDING_CONSENT_VERSION,
      COUNSELLOR_CREDENTIAL_POLICY_VERSION:
        VALID_ENV.COUNSELLOR_CREDENTIAL_POLICY_VERSION,
    });

    expect(config).toMatchObject({
      configured: false,
      verificationConfigured: true,
      registrationConfigured: false,
      onboardingNoticeUrl: null,
      invalidFields: ['COUNSELLOR_ONBOARDING_NOTICE_URL'],
    });
  });
});
