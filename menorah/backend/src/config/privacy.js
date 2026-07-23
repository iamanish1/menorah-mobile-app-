const {
  isApprovedVerificationVersion,
} = require('./counsellorVerification');

const PRIVACY_RETENTION_EXECUTION_ENV = 'PRIVACY_RETENTION_EXECUTION_ENABLED';
const PRIVACY_RETENTION_POLICY_ENV = 'PRIVACY_RETENTION_POLICY_JSON';
const PRIVACY_NOTICE_VERSION_ENV = 'PRIVACY_NOTICE_VERSION';

const RETENTION_CATEGORIES = Object.freeze([
  'account_profile',
  'booking_clinical',
  'chat_content',
  'call_metadata',
  'payment_finance',
  'security_audit',
  'privacy_consent_evidence',
  'privacy_rights_request_payload',
  'face_check_metadata',
  'backups',
  'operational_logs',
  'vendor_copies',
]);

const AUTOMATED_RETENTION_CATEGORIES = Object.freeze([
  'privacy_rights_request_payload',
]);

const MAX_POLICY_JSON_BYTES = 32 * 1024;
const MAX_RETENTION_DAYS = 36500;

const isPlainObject = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const isApprovedReference = (value) => (
  isApprovedVerificationVersion(value)
  && String(value).trim().length <= 256
);

const parseExecutionFlag = (env, invalidFields) => {
  const raw = env[PRIVACY_RETENTION_EXECUTION_ENV];
  if (raw === undefined || raw === '') return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  invalidFields.push(PRIVACY_RETENTION_EXECUTION_ENV);
  return false;
};

const parseRetentionPolicy = (raw, invalidFields) => {
  if (typeof raw !== 'string' || !raw.trim() || Buffer.byteLength(raw, 'utf8') > MAX_POLICY_JSON_BYTES) {
    invalidFields.push(PRIVACY_RETENTION_POLICY_ENV);
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalidFields.push(PRIVACY_RETENTION_POLICY_ENV);
    return null;
  }

  if (
    !isPlainObject(parsed)
    || !isApprovedVerificationVersion(parsed.version)
    || !isPlainObject(parsed.categories)
  ) {
    invalidFields.push(PRIVACY_RETENTION_POLICY_ENV);
    return null;
  }

  const configuredCategoryNames = Object.keys(parsed.categories);
  const unknownCategories = configuredCategoryNames.filter(
    (category) => !RETENTION_CATEGORIES.includes(category)
  );
  const missingCategories = RETENTION_CATEGORIES.filter(
    (category) => !Object.prototype.hasOwnProperty.call(parsed.categories, category)
  );
  if (unknownCategories.length || missingCategories.length) {
    invalidFields.push(PRIVACY_RETENTION_POLICY_ENV);
    return null;
  }

  const categories = {};
  for (const category of RETENTION_CATEGORIES) {
    const value = parsed.categories[category];
    if (
      !isPlainObject(value)
      || !['manual', 'automated'].includes(value.mode)
      || !isApprovedReference(value.policyReference)
    ) {
      invalidFields.push(PRIVACY_RETENTION_POLICY_ENV);
      return null;
    }

    const retentionDays = value.retentionDays;
    if (
      retentionDays !== undefined
      && (!Number.isSafeInteger(retentionDays)
        || retentionDays < 1
        || retentionDays > MAX_RETENTION_DAYS)
    ) {
      invalidFields.push(PRIVACY_RETENTION_POLICY_ENV);
      return null;
    }
    if (
      value.mode === 'automated'
      && (
        retentionDays === undefined
        || !AUTOMATED_RETENTION_CATEGORIES.includes(category)
      )
    ) {
      invalidFields.push(PRIVACY_RETENTION_POLICY_ENV);
      return null;
    }

    categories[category] = Object.freeze({
      mode: value.mode,
      policyReference: String(value.policyReference).trim(),
      ...(retentionDays === undefined ? {} : { retentionDays }),
    });
  }

  return Object.freeze({
    version: String(parsed.version).trim(),
    categories: Object.freeze(categories),
  });
};

const readPrivacyConfiguration = (env = process.env) => {
  const source = env && typeof env === 'object' ? env : {};
  const invalidFields = [];
  const noticeVersion = String(source[PRIVACY_NOTICE_VERSION_ENV] || '').trim();
  if (!isApprovedVerificationVersion(noticeVersion)) {
    invalidFields.push(PRIVACY_NOTICE_VERSION_ENV);
  }

  const retentionExecutionEnabled = parseExecutionFlag(source, invalidFields);
  const retentionPolicy = parseRetentionPolicy(
    source[PRIVACY_RETENTION_POLICY_ENV],
    invalidFields
  );

  if (
    retentionExecutionEnabled
    && retentionPolicy
    && !Object.values(retentionPolicy.categories).some(({ mode }) => mode === 'automated')
  ) {
    invalidFields.push(PRIVACY_RETENTION_EXECUTION_ENV);
  }

  return Object.freeze({
    configured: invalidFields.length === 0,
    noticeVersion: invalidFields.includes(PRIVACY_NOTICE_VERSION_ENV)
      ? null
      : noticeVersion,
    retentionExecutionEnabled,
    retentionPolicy,
    invalidFields: Object.freeze([...new Set(invalidFields)]),
  });
};

module.exports = {
  AUTOMATED_RETENTION_CATEGORIES,
  MAX_RETENTION_DAYS,
  PRIVACY_NOTICE_VERSION_ENV,
  PRIVACY_RETENTION_EXECUTION_ENV,
  PRIVACY_RETENTION_POLICY_ENV,
  RETENTION_CATEGORIES,
  readPrivacyConfiguration,
};
