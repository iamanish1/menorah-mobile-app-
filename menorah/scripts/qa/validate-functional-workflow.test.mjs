import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import { validateFunctionalWorkflow } from './validate-functional-workflow.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..');
const read = async (path) =>
  (await readFile(resolve(REPO_ROOT, path), 'utf8')).replace(/\r\n?/g, '\n');
const [
  rawWorkflow,
  integrationCompose,
  securityWorkflow,
  userWebPackage,
  userWebLock,
  adminWebPackage,
  adminWebLock,
  counsellorWebPackage,
  counsellorWebLock,
] = await Promise.all([
  read('.github/workflows/functional-release.yml'),
  read('menorah/scripts/qa/docker-compose.integration.yml'),
  read('.github/workflows/security.yml'),
  read('menorah/user-web-app/package.json').then(JSON.parse),
  read('menorah/user-web-app/package-lock.json').then(JSON.parse),
  read('menorah/admin-panel/package.json').then(JSON.parse),
  read('menorah/admin-panel/package-lock.json').then(JSON.parse),
  read('menorah/web-app/package.json').then(JSON.parse),
  read('menorah/web-app/package-lock.json').then(JSON.parse),
]);

const validate = (workflow, raw = rawWorkflow, security = securityWorkflow) =>
  validateFunctionalWorkflow(workflow, raw, integrationCompose, security);

test('accepts the exact-SHA cross-stack functional workflow', () => {
  assert.doesNotThrow(() => validate(parse(rawWorkflow)));
});

test('rejects a missing or late backend production dependency prerequisite', () => {
  const missing = parse(rawWorkflow);
  missing.jobs['release-infrastructure'].steps =
    missing.jobs['release-infrastructure'].steps.filter(
      (step) =>
        step.name !== 'Install deterministic backend production dependencies',
    );
  assert.throws(
    () => validate(missing),
    /install deterministic backend production dependencies/,
  );

  const late = parse(rawWorkflow);
  const steps = late.jobs['release-infrastructure'].steps;
  const dependencyStepIndex = steps.findIndex(
    (step) =>
      step.name === 'Install deterministic backend production dependencies',
  );
  const [dependencyStep] = steps.splice(dependencyStepIndex, 1);
  const suiteStepIndex = steps.findIndex(
    (step) => step.name === 'Run release and infrastructure suites',
  );
  steps.splice(suiteStepIndex + 1, 0, dependencyStep);
  assert.throws(
    () => validate(late),
    /before its release suite/,
  );
});

test('rejects a workspace removed from the aggregate gate', () => {
  const workflow = parse(rawWorkflow);
  workflow.jobs['required-functional-release-gates'].needs =
    workflow.jobs['required-functional-release-gates'].needs.filter(
      (job) => job !== 'backend-default',
    );
  assert.throws(() => validate(workflow));
});

test('rejects integration tests that can silently skip', () => {
  const weakened = rawWorkflow.replaceAll('--require-no-skips', '');
  assert.notEqual(weakened, rawWorkflow);
  assert.throws(() => validate(parse(weakened), weakened), /require-no-skips/);
});

test('rejects integration databases outside the suites disposable namespaces', () => {
  const workflow = parse(rawWorkflow);
  workflow.jobs['backend-integration'].env.KYC_MIGRATION_TEST_URI =
    'mongodb://127.0.0.1:27017/kyc_ci?replicaSet=menorah-ci&directConnection=true';
  assert.throws(
    () => validate(workflow),
    /disposable database guard/,
  );
});

test('rejects a ShellCheck image invoked as a Bash script runner', () => {
  const weakened = rawWorkflow.replace(
    '--network none --entrypoint /bin/shellcheck',
    '--network none',
  );
  assert.notEqual(weakened, rawWorkflow);
  assert.throws(
    () => validate(parse(weakened), weakened),
    /--entrypoint \/bin\/shellcheck/,
  );
});

test('rejects removal of the tracked-fixture clean-archive assertion', () => {
  const weakened = rawWorkflow.replace(
    'test ! -e "${archive_root}/menorah/deploy/env/home.env"',
    'true',
  );
  assert.notEqual(weakened, rawWorkflow);
  assert.throws(() => validate(parse(weakened), weakened), /ignored home\.env/);
});

test('rejects a secret-consuming or deploying mutation', () => {
  const secretWorkflow = parse(rawWorkflow);
  secretWorkflow.jobs.mobile.env.PRODUCTION_TOKEN = '${{ secrets.PRODUCTION_TOKEN }}';
  assert.throws(() => validate(secretWorkflow), /must not consume secrets/);

  const deploying = `${rawWorkflow}\n# gcloud run deploy unsafe\n`;
  assert.throws(() => validate(parse(rawWorkflow), deploying), /must not publish or deploy/);
});

test('rejects removal of the aggregate security gate', () => {
  const security = parse(securityWorkflow);
  delete security.jobs['required-security-gates'];
  assert.throws(
    () => validate(parse(rawWorkflow), rawWorkflow, JSON.stringify(security)),
    /aggregate gate/,
  );
});

test('pins the user-web Next PostCSS override to the first path-traversal-safe release', () => {
  assert.equal(userWebPackage.overrides?.next?.postcss, '8.5.18');
  assert.equal(
    userWebLock.packages?.['node_modules/postcss']?.version,
    '8.5.18',
  );
});

test('pins admin PostCSS to the first path-traversal-safe release', () => {
  assert.equal(adminWebPackage.devDependencies?.postcss, '8.5.18');
  assert.equal(adminWebPackage.overrides?.next?.postcss, '8.5.18');
  const lockedPostcssVersions = Object.entries(adminWebLock.packages || {})
    .filter(([name]) => name.endsWith('node_modules/postcss'))
    .map(([, metadata]) => metadata.version);
  assert.ok(lockedPostcssVersions.length > 0);
  assert.deepEqual(
    [...new Set(lockedPostcssVersions)],
    ['8.5.18'],
  );
});

test('pins counsellor PostCSS to the first path-traversal-safe release', () => {
  assert.equal(counsellorWebPackage.overrides?.next?.postcss, '8.5.18');
  const lockedPostcssVersions = Object.entries(
    counsellorWebLock.packages || {},
  )
    .filter(([name]) => name.endsWith('node_modules/postcss'))
    .map(([, metadata]) => metadata.version);
  assert.ok(lockedPostcssVersions.length > 0);
  assert.deepEqual(
    [...new Set(lockedPostcssVersions)],
    ['8.5.18'],
  );
});
