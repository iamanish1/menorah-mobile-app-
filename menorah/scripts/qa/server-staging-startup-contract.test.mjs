import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildValidationEnvironment,
  parseContractKeys,
} from '../../deploy/server-staging/generate-validation-environment.mjs';
import {
  validateEnvironmentRecord,
} from '../../deploy/server-staging/validate-environment.mjs';

const require = createRequire(import.meta.url);
const {
  FACE_CHECK_CONSENT_VERSION,
} = require('../../backend/src/config/kyc.js');
const {
  RETENTION_CATEGORIES,
  readPrivacyConfiguration,
} = require('../../backend/src/config/privacy.js');
const {
  PRIVACY_PERMISSIONS,
  readPrivacyAdminPermissionConfiguration,
} = require('../../backend/src/config/privacyAdminPermissions.js');
const {
  readAdminRoleConfiguration,
} = require('../../backend/src/config/adminPermissions.js');
const {
  ADMIN_ROLE_GRANTS: SEEDED_ADMIN_ROLE_GRANTS,
} = require('../../backend/src/database/seed-server-staging.js');
const {
  validateStartupEnv,
} = require('../../backend/src/shared/app/startupValidation.js');

const contractSource = readFileSync(
  new URL('../../deploy/env/server-staging.env.example', import.meta.url),
  'utf8',
);
const candidateSha = 'a'.repeat(40);

const validEnvironment = () => ({
  ...buildValidationEnvironment({
    candidateSha,
    contractKeys: parseContractKeys(contractSource),
  }).values,
});

const withIsolatedProcessEnvironment = (environment, callback) => {
  const originalEnvironment = { ...process.env };
  try {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, environment);
    return callback();
  } finally {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
  }
};

test('generated privacy and KYC values satisfy backend contracts', () => {
  const environment = validEnvironment();
  const privacy = readPrivacyConfiguration(environment);
  const permissions =
    readPrivacyAdminPermissionConfiguration(environment);

  assert.equal(
    environment.KYC_CONSENT_VERSION,
    FACE_CHECK_CONSENT_VERSION,
  );
  assert.equal(privacy.configured, true);
  assert.deepEqual(
    Object.keys(privacy.retentionPolicy.categories),
    RETENTION_CATEGORIES,
  );
  assert.equal(
    Object.values(privacy.retentionPolicy.categories)
      .every(({ mode }) => mode === 'manual'),
    true,
  );
  assert.equal(permissions.configured, true);
  assert.deepEqual(
    new Set(permissions.grants[0].permissions),
    new Set(PRIVACY_PERMISSIONS),
  );
});

test('generated admin roles exactly match the seeded synthetic roster', () => {
  const environment = validEnvironment();
  const expectedGrants = SEEDED_ADMIN_ROLE_GRANTS.map(
    ({ adminId, role }) => ({ adminId, role }),
  );
  const generatedGrants = JSON.parse(environment.ADMIN_ROLE_GRANTS_JSON);
  const configuration = readAdminRoleConfiguration(environment);

  assert.deepEqual(generatedGrants, expectedGrants);
  assert.equal(configuration.configured, true);
  assert.deepEqual(
    configuration.grants.map(({ adminId, role }) => ({ adminId, role })),
    expectedGrants,
  );
});

test('generated environment has zero api-web startup errors', () => {
  const environment = validEnvironment();

  assert.doesNotThrow(
    () => withIsolatedProcessEnvironment(
      environment,
      () => validateStartupEnv({ serviceName: 'api-web' }),
    ),
    'generated server-staging environment must pass api-web startup',
  );
});

test('generated environment has zero api-admin startup errors', () => {
  const environment = validEnvironment();

  assert.doesNotThrow(
    () => withIsolatedProcessEnvironment(
      environment,
      () => validateStartupEnv({ serviceName: 'api-admin' }),
    ),
    'generated server-staging environment must pass api-admin startup',
  );
});

test('server-staging validator rejects noncanonical KYC consent', () => {
  const environment = validEnvironment();
  environment.KYC_CONSENT_VERSION = 'synthetic-legacy-consent-v1';

  assert.equal(
    validateEnvironmentRecord(environment).some(
      (error) => error.startsWith('KYC_CONSENT_VERSION must be '),
    ),
    true,
  );
});

test('server-staging validator rejects incomplete retention policy', () => {
  const environment = validEnvironment();
  environment.PRIVACY_RETENTION_POLICY_JSON = JSON.stringify({
    version: 'synthetic-server-staging-retention-v1',
    categories: {},
  });

  assert.equal(
    validateEnvironmentRecord(environment).some(
      (error) => error.startsWith('PRIVACY_RETENTION_POLICY_JSON '),
    ),
    true,
  );
});

test('server-staging validator rejects empty privacy grants', () => {
  const environment = validEnvironment();
  environment.PRIVACY_ADMIN_PERMISSION_GRANTS_JSON = '[]';

  assert.equal(
    validateEnvironmentRecord(environment).some(
      (error) => error.startsWith(
        'PRIVACY_ADMIN_PERMISSION_GRANTS_JSON ',
      ),
    ),
    true,
  );
});

test('server-staging validator rejects empty admin-role grants', () => {
  const environment = validEnvironment();
  environment.ADMIN_ROLE_GRANTS_JSON = '[]';

  assert.equal(
    validateEnvironmentRecord(environment).some(
      (error) => error.startsWith('ADMIN_ROLE_GRANTS_JSON '),
    ),
    true,
  );
});

test('server-staging validator rejects admin-role roster drift', () => {
  const environment = validEnvironment();
  const grants = JSON.parse(environment.ADMIN_ROLE_GRANTS_JSON);
  grants[0].role = 'admin';
  environment.ADMIN_ROLE_GRANTS_JSON = JSON.stringify(grants);

  assert.equal(readAdminRoleConfiguration(environment).configured, true);
  assert.equal(
    validateEnvironmentRecord(environment).some(
      (error) => error.startsWith('ADMIN_ROLE_GRANTS_JSON '),
    ),
    true,
  );
});
