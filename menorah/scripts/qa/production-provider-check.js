#!/usr/bin/env node

/*
 * Redacted production provider/env validation.
 *
 * This script reports whether required variables are present and whether the
 * Resend API key is accepted by Resend. It never prints env values or secrets.
 */

const REQUIRED = [
  'MONGODB_URI',
  'MONGODB_BACKUP_URI',
  'MONGODB_PRODUCTION_RESTORE_URI',
  'MONGODB_RESTORE_TEST_URI',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'PASSWORD_RESET_BASE_URL',
  'MEDIA_STORAGE_BACKEND',
  'MEDIA_PUBLIC_BASE_URL',
  'UPLOAD_PATH',
  'ALLOWED_ORIGINS',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'BACKUP_ENCRYPTION_PASSWORD',
  'BACKUP_INTEGRITY_HMAC_KEY',
  'APPLE_SIGN_IN_ENABLED',
  'APPLE_IOS_BUNDLE_ID',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
];

const OPTIONAL_PROVIDER_GROUPS = [
  ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'],
  ['LUXAND_API_TOKEN'],
  ['GOOGLE_WEB_CLIENT_ID'],
  ['GOOGLE_ANDROID_CLIENT_ID'],
  ['GOOGLE_IOS_CLIENT_ID'],
  ['APPLE_WEB_SERVICE_ID'],
];

const isPlaceholder = (value = '') =>
  /^REPLACE/i.test(value) || value.includes('replace_with');

const envValue = (key) => {
  const value = process.env[key] || '';
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

const hasUsableValue = (key) => {
  const value = envValue(key);
  return Boolean(value && !isPlaceholder(value));
};

const isMongoUri = (key) =>
  /^mongodb(\+srv)?:\/\//.test(envValue(key));

const checkRequiredEnv = () => {
  let failures = 0;
  for (const key of REQUIRED) {
    if (hasUsableValue(key)) {
      console.log(`PASS env ${key} is set`);
    } else {
      console.log(`FAIL env ${key} is missing or placeholder`);
      failures += 1;
    }
  }

  for (const key of [
    'MONGODB_URI',
    'MONGODB_BACKUP_URI',
    'MONGODB_PRODUCTION_RESTORE_URI',
    'MONGODB_RESTORE_TEST_URI',
  ]) {
    if (hasUsableValue(key) && !isMongoUri(key)) {
      console.log(`FAIL env ${key} must start with mongodb:// or mongodb+srv://`);
      failures += 1;
    }
  }

  if (envValue('PASSWORD_RESET_BASE_URL') !== 'https://app.menorah.me') {
    console.log('FAIL env PASSWORD_RESET_BASE_URL must equal the canonical mobile app origin');
    failures += 1;
  }
  if (envValue('APPLE_SIGN_IN_ENABLED') !== 'true'
    || envValue('APPLE_IOS_BUNDLE_ID') !== 'com.menorah.health.app') {
    console.log('FAIL env Sign in with Apple must be enabled for the canonical iOS bundle');
    failures += 1;
  }
  if (!/^[A-Z0-9]{10}$/.test(envValue('APPLE_TEAM_ID'))
    || !/^[A-Z0-9]{10}$/.test(envValue('APPLE_KEY_ID'))
    || !envValue('APPLE_PRIVATE_KEY').includes('BEGIN PRIVATE KEY')) {
    console.log('FAIL env Apple server signing credentials are incomplete');
    failures += 1;
  }
  if (
    envValue('MEDIA_STORAGE_BACKEND') !== 'local'
    || envValue('MEDIA_PUBLIC_BASE_URL') !== `https://${envValue('API_WEB_DOMAIN') || 'api-web.menorah.me'}`
    || envValue('UPLOAD_PATH') !== '/app/uploads'
    || envValue('SOCIAL_STUDIO_STORAGE')
    || envValue('COUNSELLOR_MEDIA_STORAGE')
  ) {
    console.log('FAIL production media must use the canonical shared immutable local store');
    failures += 1;
  }

  for (const group of OPTIONAL_PROVIDER_GROUPS) {
    const configured = group.every(hasUsableValue);
    const partial = group.some((key) => process.env[key]);
    const label = group.join('+');
    if (configured) {
      console.log(`PASS optional provider ${label} is fully configured`);
    } else if (partial) {
      console.log(`WARN optional provider ${label} is partially configured`);
    } else {
      console.log(`SKIP optional provider ${label} is not configured`);
    }
  }

  return failures;
};

const checkResend = async () => {
  if (!hasUsableValue('RESEND_API_KEY')) {
    console.log('FAIL Resend API key validation skipped because RESEND_API_KEY is not usable');
    return 1;
  }

  const response = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${envValue('RESEND_API_KEY')}` },
  });

  if (response.ok) {
    console.log(`PASS Resend API key accepted by provider, HTTP ${response.status}`);
    return 0;
  }

  console.log(`FAIL Resend API key rejected by provider, HTTP ${response.status}`);
  return 1;
};

const main = async () => {
  let failures = checkRequiredEnv();
  failures += await checkResend();
  process.exit(failures > 0 ? 1 : 0);
};

main().catch((error) => {
  console.error(`FAIL provider validation error: ${error.message}`);
  process.exit(1);
});
