#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..');
const read = async (path) =>
  (await readFile(resolve(REPO_ROOT, path), 'utf8')).replace(/\r\n?/g, '\n');

const EXPECTED_JOBS = [
  'candidate',
  'backend-default',
  'backend-integration',
  'user-web',
  'admin-web',
  'counsellor-web',
  'mobile',
  'release-infrastructure',
  'required-functional-release-gates',
];
const REQUIRED_FUNCTIONAL_JOBS = EXPECTED_JOBS.slice(0, -1);
const PINNED_ACTION = /^[^@\s]+@[0-9a-f]{40}$/;
const escapeRegExp = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function requireText(text, pattern, message) {
  assert.match(text, pattern, message);
}

function rejectText(text, pattern, message) {
  assert.doesNotMatch(text, pattern, message);
}

function validateCheckout(job, jobId) {
  const checkout = job.steps?.find((step) => step.name === 'Checkout candidate exactly');
  assert.ok(checkout, `${jobId} must check out the immutable candidate`);
  assert.match(checkout.uses ?? '', /^actions\/checkout@[0-9a-f]{40}$/);
  assert.equal(checkout.with?.ref, '${{ env.CANDIDATE_SHA }}');
  assert.equal(checkout.with?.['persist-credentials'], false);
  const verification = job.steps?.find((step) => step.name === 'Verify candidate identity')?.run ?? '';
  requireText(
    verification,
    /test "\$\(git rev-parse HEAD\)" = "\$\{CANDIDATE_SHA\}"/,
    `${jobId} must verify the checked-out SHA`,
  );
  requireText(
    verification,
    /git status --porcelain/,
    `${jobId} must reject generated or modified checkout state before validation`,
  );
}

export function validateFunctionalWorkflow(
  workflow,
  rawWorkflow,
  integrationCompose,
  securityWorkflow,
) {
  assert.equal(workflow.name, 'Exact-SHA functional release validation');
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.ok(workflow.on?.pull_request !== undefined);
  assert.deepEqual(workflow.on?.push?.branches, ['main', 'release/**']);
  assert.equal(workflow.on?.workflow_dispatch?.inputs?.candidate_sha?.required, true);
  assert.equal(workflow.on?.workflow_dispatch?.inputs?.candidate_sha?.type, 'string');
  assert.deepEqual(Object.keys(workflow.jobs ?? {}), EXPECTED_JOBS);

  const serialized = JSON.stringify(workflow);
  rejectText(serialized, /\$\{\{\s*(?:secrets|vars)\s*(?:\.|\[)/i, 'functional workflow must not consume secrets or variables');
  rejectText(serialized, /"environment"\s*:/i, 'functional workflow must not bind a GitHub environment');
  rejectText(rawWorkflow, /\b(?:ssh|scp|rsync)\b|appleboy\/ssh-action/i, 'functional workflow must not connect to a host');
  rejectText(rawWorkflow, /\bgcloud\s+run\b|\bwrangler\s+deploy\b|\bdocker\s+(?:login|push)\b/i, 'functional workflow must not publish or deploy');
  rejectText(rawWorkflow, /razorpay\.com|api\.resend\.com|api\.luxand\.cloud|api\.livekit\.io/i, 'functional workflow must not call a live provider');

  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    assert.equal(job['continue-on-error'], undefined, `${jobId} must not continue on error`);
    assert.equal(job['runs-on'], 'ubuntu-24.04');
    assert.ok(Number.isInteger(job['timeout-minutes']), `${jobId} must have an explicit timeout`);
    for (const step of job.steps ?? []) {
      assert.equal(step['continue-on-error'], undefined, `${jobId}/${step.name} must not continue on error`);
      if (step.uses) assert.match(step.uses, PINNED_ACTION, `${jobId}/${step.name} action must be commit-pinned`);
    }
  }

  const candidate = workflow.jobs.candidate;
  assert.deepEqual(candidate.outputs, { sha: '${{ steps.candidate.outputs.sha }}' });
  const candidateRun = candidate.steps?.[0]?.run ?? '';
  requireText(candidateRun, /\^\[0-9a-f\]\{40\}\$/, 'candidate guard must require a full SHA');
  requireText(candidateRun, /GITHUB_OUTPUT/, 'candidate guard must emit the validated SHA');

  for (const jobId of REQUIRED_FUNCTIONAL_JOBS.filter((id) => id !== 'candidate')) {
    const job = workflow.jobs[jobId];
    assert.equal(job.needs, 'candidate', `${jobId} must depend on the candidate guard`);
    assert.equal(job.env?.CANDIDATE_SHA, '${{ needs.candidate.outputs.sha }}');
    validateCheckout(job, jobId);
  }

  const releaseInfrastructure = workflow.jobs['release-infrastructure'];
  const backendDependenciesStepName =
    'Install deterministic backend production dependencies';
  const backendDependenciesStepIndex = releaseInfrastructure.steps?.findIndex(
    (step) => step.name === backendDependenciesStepName,
  );
  assert.notEqual(
    backendDependenciesStepIndex,
    -1,
    'release infrastructure must install deterministic backend production dependencies',
  );
  const backendDependenciesStep =
    releaseInfrastructure.steps[backendDependenciesStepIndex];
  assert.equal(backendDependenciesStep['working-directory'], 'menorah/backend');
  assert.equal(
    backendDependenciesStep.run,
    'npm ci --omit=dev --ignore-scripts',
    'release infrastructure backend production dependencies must come from the lock without lifecycle scripts',
  );
  const releaseSuiteStepIndex = releaseInfrastructure.steps?.findIndex(
    (step) => step.name === 'Run release and infrastructure suites',
  );
  assert.ok(
    backendDependenciesStepIndex < releaseSuiteStepIndex,
    'release infrastructure must install backend production dependencies before its release suite',
  );

  const commands = Object.fromEntries(
    Object.entries(workflow.jobs).map(([jobId, job]) => [
      jobId,
      (job.steps ?? []).map((step) => step.run ?? '').join('\n'),
    ]),
  );
  for (const expected of ['npm ci', 'npm run lint', 'npm test', '--require-no-skips', 'audit-production.mjs']) {
    requireText(commands['backend-default'], new RegExp(escapeRegExp(expected)), `backend default job must run ${expected}`);
  }
  for (const expected of ['docker-compose.integration.yml', 'rs.initiate', "testPathPattern='\\.integration\\.test\\.js$'", '--require-no-skips']) {
    requireText(commands['backend-integration'], new RegExp(escapeRegExp(expected)), `backend integration job must run ${expected}`);
  }
  const integrationEnv = workflow.jobs['backend-integration'].env ?? {};
  const disposableDatabasePrefixes = {
    KYC_MIGRATION_TEST_URI: 'menorah_kyc_migration_test',
    PRIVACY_MIGRATION_TEST_URI: 'menorah_privacy_migration_test',
    PRIVACY_STATE_MIGRATION_TEST_URI: 'menorah_privacy_state_migration_test',
    PRIVACY_DELETION_TEST_URI: 'menorah_privacy_deletion_test',
    PRIVACY_PERMISSION_AUTHORITY_TEST_URI: 'menorah_privacy_permission_authority_test',
    PRIVACY_CONSENT_TEST_URI: 'menorah_privacy_consent_test',
    PRIVACY_RETENTION_TEST_URI: 'menorah_privacy_retention_test',
    PRIVACY_RIGHTS_TEST_URI: 'menorah_privacy_rights_test',
  };
  for (const [variable, prefix] of Object.entries(disposableDatabasePrefixes)) {
    const uri = new URL(integrationEnv[variable]);
    assert.equal(uri.hostname, '127.0.0.1', `${variable} must remain loopback-only`);
    assert.match(
      uri.pathname.slice(1),
      new RegExp(`^${prefix}(?:_|$)`),
      `${variable} must pass the integration suite's disposable database guard`,
    );
  }
  assert.equal(
    integrationEnv.ADMIN_MFA_REDIS_TEST_URL,
    'redis://127.0.0.1:6379/15',
    'Redis integration tests must use the disposable loopback-only database',
  );
  for (const jobId of ['user-web', 'admin-web', 'counsellor-web']) {
    for (const expected of ['npm ci', 'npm run lint', 'tsc --noEmit', 'npm run build', 'audit-production.mjs']) {
      requireText(commands[jobId], new RegExp(escapeRegExp(expected)), `${jobId} must run ${expected}`);
    }
  }
  for (const expected of ['npm ci', 'npm run lint', 'npm run typecheck', 'test:payment-policy', 'test:release-config', 'expo-doctor', 'audit-production.mjs']) {
    requireText(commands.mobile, new RegExp(escapeRegExp(expected)), `mobile job must run ${expected}`);
  }
  for (const expected of ['actionlint', 'test:release-workflow', 'test:tunnel-config', 'test:mongo-identities', 'test:backup-lifecycle', 'test:monitoring', 'validate-compose.sh', 'caddy-config-validator', 'git archive', 'bash -n', 'shellcheck']) {
    requireText(commands['release-infrastructure'], new RegExp(escapeRegExp(expected), 'i'), `release infrastructure job must run ${expected}`);
  }
  for (const expected of [
    '--entrypoint /bin/shellcheck',
    'record-backup-result.sh',
    'backup-now.sh',
    'export-backup-metrics.sh',
    'test-backup-lifecycle.sh',
    'test-monitoring-native.sh',
  ]) {
    requireText(
      commands['release-infrastructure'],
      new RegExp(escapeRegExp(expected)),
      `release infrastructure ShellCheck must include ${expected}`,
    );
  }
  requireText(commands['release-infrastructure'], /test ! -e .*home\.env/, 'clean archive must prove ignored home.env is absent');

  const aggregate = workflow.jobs['required-functional-release-gates'];
  assert.deepEqual(aggregate.needs, REQUIRED_FUNCTIONAL_JOBS);
  assert.equal(aggregate.if, '${{ always() }}');
  const aggregateRun = aggregate.steps?.[0]?.run ?? '';
  requireText(aggregateRun, /\[\[ "\$\{result\}" != "success" \]\]/, 'aggregate gate must reject failure and skip results');
  requireText(aggregateRun, /At least one required functional release job did not pass/, 'aggregate gate must expose a stable failure');

  const compose = parse(integrationCompose);
  assert.deepEqual(Object.keys(compose.services ?? {}), ['mongo', 'redis']);
  for (const [name, service] of Object.entries(compose.services)) {
    assert.match(service.image ?? '', /@sha256:[0-9a-f]{64}$/, `${name} integration image must be immutable`);
    assert.equal(service.volumes, undefined, `${name} integration data must not use persistent volumes`);
    assert.ok(service.tmpfs, `${name} integration data must be disposable`);
    assert.ok((service.ports ?? []).every((port) => String(port).startsWith('127.0.0.1:')));
  }
  assert.notEqual(
    compose.networks?.integration?.external,
    true,
    'integration services must use a project-scoped network',
  );

  const security = parse(securityWorkflow);
  assert.ok(security.jobs?.['required-security-gates'], 'security workflow must retain its aggregate gate');
  for (const tool of ['gitleaks', 'semgrep', 'trivy', 'syft']) {
    requireText(securityWorkflow.toLowerCase(), new RegExp(tool), `security workflow must retain ${tool}`);
  }
}

async function main() {
  const [rawWorkflow, integrationCompose, securityWorkflow] = await Promise.all([
    read('.github/workflows/functional-release.yml'),
    read('menorah/scripts/qa/docker-compose.integration.yml'),
    read('.github/workflows/security.yml'),
  ]);
  validateFunctionalWorkflow(
    parse(rawWorkflow),
    rawWorkflow,
    integrationCompose,
    securityWorkflow,
  );
  console.log('Exact-SHA functional release workflow validates.');
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  main().catch((error) => {
    console.error(`Functional release workflow validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
