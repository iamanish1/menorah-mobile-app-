#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { parse } from 'yaml';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..');

const paths = {
  workflow: resolve(REPO_ROOT, '.github/workflows/deploy.yml'),
  securityWorkflow: resolve(REPO_ROOT, '.github/workflows/security.yml'),
  dastWorkflow: resolve(REPO_ROOT, '.github/workflows/dast.yml'),
  androidBuildWorkflow: resolve(REPO_ROOT, '.github/workflows/build-android.yml'),
  branchProtection: resolve(REPO_ROOT, '.github/BRANCH_PROTECTION.md'),
  pullRequestTemplate: resolve(REPO_ROOT, '.github/pull_request_template.md'),
  releaseEvidenceTemplate: resolve(REPO_ROOT, '.github/RELEASE_EVIDENCE_TEMPLATE.md'),
  firstRunScript: resolve(REPO_ROOT, 'menorah/deploy/ubuntu/first-run.sh'),
  backupScheduleScript: resolve(REPO_ROOT, 'menorah/deploy/ubuntu/install-backup-schedule.sh'),
  updateScript: resolve(REPO_ROOT, 'menorah/deploy/ubuntu/update-from-git.sh'),
  healthScript: resolve(REPO_ROOT, 'menorah/deploy/ubuntu/health-check.sh'),
  backupScript: resolve(REPO_ROOT, 'menorah/deploy/ubuntu/backup-now.sh'),
  mongoToolCredentialWrapper: resolve(
    REPO_ROOT,
    'menorah/deploy/backup/run-mongo-tool-secure.sh',
  ),
  restoreScript: resolve(REPO_ROOT, 'menorah/deploy/ubuntu/restore-latest-backup.sh'),
  restoreAcknowledgeScript: resolve(
    REPO_ROOT,
    'menorah/deploy/ubuntu/acknowledge-production-restore.sh',
  ),
  rollbackScript: resolve(REPO_ROOT, 'menorah/deploy/ubuntu/rollback-last-deploy.sh'),
  resumePostMigrationScript: resolve(
    REPO_ROOT,
    'menorah/deploy/ubuntu/resume-post-migration-release.sh',
  ),
  recoverMongoIdentitiesScript: resolve(
    REPO_ROOT,
    'menorah/deploy/ubuntu/recover-managed-mongo-identities.sh',
  ),
  recordedMigrationScript: resolve(
    REPO_ROOT,
    'menorah/deploy/ubuntu/run-recorded-migration.sh',
  ),
  migrationCompose: resolve(REPO_ROOT, 'menorah/deploy/docker-compose.migration.yml'),
  runtimeDirectoryPrepScript: resolve(
    REPO_ROOT,
    'menorah/deploy/ubuntu/prepare-runtime-directories.sh',
  ),
  productionCompose: resolve(REPO_ROOT, 'menorah/deploy/docker-compose.production.yml'),
  tunnelCompose: resolve(REPO_ROOT, 'menorah/deploy/docker-compose.tunnel.yml'),
  legacyCloudBuild: resolve(REPO_ROOT, 'menorah/backend/cloudbuild.yaml'),
  legacyCloudRun: resolve(REPO_ROOT, 'gcp/cloudrun.yaml'),
  archivedCloudBuild: resolve(REPO_ROOT, 'menorah/backend/legacy/cloudbuild.cloudrun.yaml.disabled'),
  archivedCloudRun: resolve(REPO_ROOT, 'gcp/legacy/cloudrun.yaml.disabled'),
  operatorRunbook: resolve(REPO_ROOT, 'menorah/docs/production-update-runbook.md'),
};

const normalizeLineEndings = (value) =>
  String(value || '').replace(/\r\n?/g, '\n');
const read = async (path) =>
  normalizeLineEndings(await readFile(path, 'utf8'));

function requirePattern(text, pattern, message) {
  assert.match(text, pattern, message);
}

function rejectPattern(text, pattern, message) {
  assert.doesNotMatch(text, pattern, message);
}

const sha256 = (value) =>
  createHash('sha256').update(String(value || '')).digest('hex');

const secretReferenceInRun = /\$\{\{[^}]*\bsecrets\s*(?:\.|\[)/i;

function rejectSecretReferencesInRuns(steps, sourceName) {
  for (const step of steps ?? []) {
    assert.doesNotMatch(
      step.run ?? '',
      secretReferenceInRun,
      `${sourceName} step ${step.name ?? '<unnamed>'} must not interpolate a secret directly in run`,
    );
  }
}

function rejectContinueOnError(job, sourceName) {
  assert.equal(
    job?.['continue-on-error'],
    undefined,
    `${sourceName} job must not use continue-on-error`,
  );
  for (const step of job?.steps ?? []) {
    assert.equal(
      step['continue-on-error'],
      undefined,
      `${sourceName} step ${step.name ?? '<unnamed>'} must not use continue-on-error`,
    );
  }
}

function assertExactStepKeys(step, expectedKeys, sourceName) {
  assert.deepEqual(
    Object.keys(step).sort(),
    [...expectedKeys].sort(),
    `${sourceName} step ${step.name ?? '<unnamed>'} has unexpected fields`,
  );
}

function validatePinnedRuntimeImages(compose, sourceName) {
  assert.ok(compose?.services, `${sourceName} must define services`);

  for (const [serviceName, service] of Object.entries(compose.services)) {
    if (!service.image) continue;
    assert.match(
      service.image,
      /@sha256:[0-9a-f]{64}$/,
      `${sourceName} service ${serviceName} must use an immutable image digest`,
    );
  }
}

function validateBackupJobBoundary(compose) {
  const backupRunner = compose?.services?.['backup-runner'];
  const restoreRunner = compose?.services?.['production-restore-runner'];
  assert.ok(backupRunner, 'production Compose must retain the one-shot backup job image');
  assert.ok(restoreRunner, 'production Compose must define a separate one-shot restore image');
  assert.deepEqual(
    backupRunner.profiles,
    ['backup-job'],
    'backup-runner must not start with the long-running release services',
  );
  assert.equal(backupRunner.restart, 'no');
  assert.doesNotMatch(
    JSON.stringify(backupRunner.command || []),
    /while\s+true|sleep\s+21600/,
    'backup-runner must not bypass the host-owned guarded schedule',
  );
  assert.deepEqual(
    Object.keys(backupRunner.environment ?? {}).sort(),
    ['BACKUP_ROOT', 'MONGODB_BACKUP_URI'],
    'backup-runner must receive only backup-specific configuration',
  );
  assert.deepEqual(restoreRunner.profiles, ['production-restore']);
  assert.equal(restoreRunner.restart, 'no');
  assert.deepEqual(
    Object.keys(restoreRunner.environment ?? {}).sort(),
    ['MONGODB_PRODUCTION_RESTORE_URI'],
    'production restore credentials must be isolated from the backup runner',
  );
  assert.equal(
    restoreRunner.volumes,
    undefined,
    'production restore runner must consume the approved archive only through stdin',
  );
}

function validateWorkflow(workflow, rawWorkflow) {
  assert.equal(workflow.name, 'Production Release Readiness');
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.ok(workflow.on?.pull_request !== undefined, 'readiness must run for pull requests');
  assert.deepEqual(
    workflow.on?.push?.branches,
    ['main', 'release/**'],
    'readiness must run on main and release branch pushes without deploying',
  );

  const dispatchInput = workflow.on?.workflow_dispatch?.inputs?.candidate_sha;
  assert.ok(dispatchInput, 'manual readiness must require an immutable candidate input');
  assert.equal(dispatchInput.required, true);
  assert.equal(dispatchInput.type, 'string');
  requirePattern(
    dispatchInput.description ?? '',
    /reviewed full 40-character commit SHA/i,
    'manual readiness must describe the exact reviewed SHA requirement',
  );

  const jobs = Object.entries(workflow.jobs ?? {});
  assert.equal(jobs.length, 1, 'the legacy deployment workflow must contain only the readiness job');
  const [jobId, job] = jobs[0];
  assert.equal(jobId, 'release-readiness');
  assert.equal(job.name, 'Production release readiness');
  assert.equal(job['runs-on'], 'ubuntu-24.04', 'readiness runner version must not float');
  assert.equal(job.environment, undefined, 'readiness must not bind to the production environment');
  assert.equal(
    job.env?.CANDIDATE_SHA,
    "${{ github.event_name == 'workflow_dispatch' && inputs.candidate_sha || github.sha }}",
    'manual checks must use the entered SHA and event checks must use their immutable event SHA',
  );

  const serialized = JSON.stringify(workflow);
  rejectPattern(serialized, /\$\{\{\s*secrets\./i, 'readiness must not consume secrets');
  rejectPattern(serialized, /\$\{\{\s*vars\./i, 'readiness must not consume repository or environment variables');
  rejectPattern(serialized, /(?:packages|id-token|deployments|environments)\s*:\s*write/i, 'readiness permissions must remain read-only');

  rejectPattern(rawWorkflow, /appleboy\/ssh-action|docker\/login-action|docker\/build-push-action/i, 'readiness must not authenticate or publish');
  rejectPattern(rawWorkflow, /\bgcloud\s+run\b|\bwrangler\s+(?:deploy|secret)\b/i, 'readiness must not mutate cloud services');
  rejectPattern(rawWorkflow, /\bdocker\s+(?:push|login|run\s+-d)\b/i, 'readiness must not publish or launch production containers');
  rejectPattern(
    rawWorkflow,
    /\bdocker(?:\s+compose|-compose)\s+(?:up|start|restart|pull|build|push|run|exec|stop|down)\b/i,
    'readiness must never mutate a Compose runtime',
  );
  rejectPattern(rawWorkflow, /\bssh\b|\bscp\b|\brsync\b/i, 'readiness must not connect to a host');
  rejectPattern(rawWorkflow, /\bruns-on\s*:\s*self-hosted\b/i, 'readiness must not execute on a host runner');
  rejectPattern(rawWorkflow, /cloudbuild\.yaml|cloudrun\.yaml/i, 'readiness must not invoke a legacy cloud deployment definition');

  for (const step of job.steps ?? []) {
    if (!step.uses) continue;
    assert.match(
      step.uses,
      /^[^@\s]+@[0-9a-f]{40}$/,
      `third-party action must be pinned to an immutable commit: ${step.uses}`,
    );
  }

  const checkoutStep = job.steps?.find((step) => step.name === 'Checkout candidate exactly');
  assert.match(
    checkoutStep?.uses ?? '',
    /^actions\/checkout@[0-9a-f]{40}$/,
    'checkout must be pinned to an immutable action commit',
  );
  assert.equal(checkoutStep?.with?.ref, '${{ env.CANDIDATE_SHA }}');
  assert.equal(checkoutStep?.with?.['fetch-depth'], 2);
  assert.equal(checkoutStep?.with?.['persist-credentials'], false);

  const runs = (job.steps ?? []).map((step) => step.run ?? '').join('\n');
  requirePattern(runs, /\^\[0-9a-f\]\{40\}\$/, 'workflow must reject a moving ref or abbreviated SHA before checkout');
  requirePattern(runs, /test "\$\{checked_out_sha\}" = "\$\{CANDIDATE_SHA\}"/, 'workflow must verify the exact candidate SHA');
  requirePattern(runs, /git cat-file -e "\$\{CANDIDATE_SHA\}\^\{commit\}"/, 'workflow must verify that the candidate is a commit');
  requirePattern(runs, /npm run test:release-workflow/, 'workflow must test release safety invariants');
  requirePattern(runs, /npm run test:tunnel-config/, 'workflow must test tunnel routing safety');
  requirePattern(runs, /npm run test:media-recovery/, 'workflow must test durable media recovery configuration');
  requirePattern(runs, /test-media-transition\.sh/, 'workflow must test existing-host media consolidation');
  requirePattern(runs, /npm run test:mongo-identities/, 'workflow must test managed MongoDB identity controls');
  requirePattern(runs, /npm run test:backup-lifecycle/, 'workflow must test backup lifecycle controls');
  requirePattern(runs, /npm run test:monitoring/, 'workflow must validate monitoring configuration');
  requirePattern(runs, /bash test-release-scripts\.sh/, 'workflow must run deterministic release script tests');
  requirePattern(runs, /bash test-mongosh-file-mode\.sh/, 'workflow must prove mongosh file-mode exception propagation');
  requirePattern(runs, /validate-compose\.sh/, 'workflow must validate the production Compose render');
  requirePattern(runs, /bash -n/, 'workflow must validate release shell syntax');
}

function validateGovernance(
  securityWorkflow,
  branchProtection,
  pullRequestTemplate,
  releaseEvidenceTemplate,
) {
  assert.deepEqual(
    securityWorkflow.on?.push?.branches,
    ['main', 'release/**', 'security/account-auth-hardening'],
    'security gates must run for protected production branch pushes',
  );
  assert.deepEqual(
    securityWorkflow.permissions,
    { contents: 'read' },
    'security workflow must default to read-only repository permissions',
  );
  const securityWorkflowText = JSON.stringify(securityWorkflow);
  rejectPattern(
    securityWorkflowText,
    /secrets\./,
    'security validation must not consume repository or environment secrets',
  );
  for (const job of Object.values(securityWorkflow.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (step.uses) {
        assert.match(step.uses, /@[0-9a-f]{40}$/, `security action must be commit-pinned: ${step.uses}`);
      }
    }
  }
  const secretScanRun = securityWorkflow.jobs?.['secret-scan']?.steps?.find(
    (step) => step.name === 'Scan all reachable commits',
  )?.run;
  requirePattern(secretScanRun ?? '', /--network none/, 'secret scan must not receive network access');
  requirePattern(secretScanRun ?? '', /\/repo:ro/, 'secret scan must mount repository history read-only');
  requirePattern(
    secretScanRun ?? '',
    /gitleaks\/gitleaks:v[0-9.]+@sha256:[0-9a-f]{64}/,
    'secret scanner image must be immutable',
  );

  const stableGate = securityWorkflow.jobs?.['required-security-gates'];
  assert.ok(stableGate, 'security workflow must expose one stable required-check job');
  assert.equal(stableGate.name, 'Required security gates');
  assert.equal(stableGate['runs-on'], 'ubuntu-24.04');
  assert.deepEqual(stableGate.needs, [
    'secret-scan',
    'sast',
    'dependency-audit',
    'container-security',
    'mobile-diagnostics',
  ]);
  requirePattern(
    JSON.stringify(stableGate),
    /At least one required security job did not pass/,
    'stable security check must fail when any dependency fails or is skipped',
  );

  requirePattern(branchProtection, /`main` and `release\/\*\*`/, 'branch rules must cover production branches');
  requirePattern(branchProtection, /`Production release readiness`/, 'branch rules must require the release readiness check');
  requirePattern(branchProtection, /`Required security gates`/, 'branch rules must require the stable security check');
  requirePattern(branchProtection, /Block force pushes and branch deletion/, 'branch rules must prohibit history destruction');
  requirePattern(branchProtection, /> OWNER ACTION:/, 'external GitHub settings must remain an owner action');
  requirePattern(
    branchProtection,
    /Repository files cannot[\s\S]*?create, inspect, or attest to these settings/,
    'branch rules must not claim that repository work changed external settings',
  );

  requirePattern(pullRequestTemplate, /Exact head SHA after the final push/, 'PR template must record immutable review identity');
  requirePattern(pullRequestTemplate, /Pre-migration rollback/, 'PR template must capture rollback planning');
  requirePattern(pullRequestTemplate, /Post-migration recovery/, 'PR template must capture recovery planning');
  requirePattern(pullRequestTemplate, /no secret value, production credential, or\s+real SSH host/i, 'PR template must prohibit sensitive deployment material');
  requirePattern(pullRequestTemplate, /No workflow.*deploys merely because code was pushed/is, 'PR template must prohibit push deployment');

  requirePattern(releaseEvidenceTemplate, /Full 40-character commit SHA/, 'release evidence must record an exact commit');
  requirePattern(releaseEvidenceTemplate, /Immutable image IDs\/digests/, 'release evidence must record immutable artifacts');
  requirePattern(releaseEvidenceTemplate, /Restore-test evidence/, 'release evidence must record backup recovery proof');
  requirePattern(releaseEvidenceTemplate, /does not\s+deploy, authorize a deployment/i, 'release evidence must not become implicit authorization');
  requirePattern(releaseEvidenceTemplate, /> OWNER ACTION:/, 'release authorization must remain an owner action');
}

export function validateDastWorkflow(workflow, rawWorkflow) {
  assert.equal(workflow.name, 'Authenticated staging DAST');
  assert.deepEqual(
    Object.keys(workflow).sort(),
    ['name', 'on', 'permissions', 'concurrency', 'jobs'].sort(),
    'DAST workflow fields must remain exact',
  );
  assert.deepEqual(workflow.on, {
    schedule: [{ cron: '41 3 * * 3' }],
    workflow_dispatch: null,
  }, 'DAST must remain scheduled/manual only');
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(
    Object.keys(workflow.jobs || {}),
    ['zap'],
    'DAST must not gain an unreviewed job',
  );

  const job = workflow.jobs?.zap;
  assert.ok(job, 'DAST workflow must retain the authenticated ZAP job');
  rejectContinueOnError(job, 'DAST');
  assert.deepEqual(
    Object.keys(job).sort(),
    ['name', 'runs-on', 'environment', 'env', 'steps'].sort(),
    'DAST job fields must remain exact',
  );
  assert.equal(job.name, 'OWASP ZAP authenticated scan');
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.equal(job.environment, 'staging-security');
  assert.deepEqual(job.env, {
    DAST_TARGET_URL: '${{ vars.DAST_TARGET_URL }}',
    DAST_TRUSTED_ORIGIN: '${{ vars.DAST_TRUSTED_ORIGIN }}',
    DAST_ALLOWED_HOSTS: '${{ vars.DAST_ALLOWED_HOSTS }}',
    DAST_EMAIL: '${{ secrets.DAST_EMAIL }}',
    DAST_PASSWORD: '${{ secrets.DAST_PASSWORD }}',
  });
  const expectedStepNames = [
    'Checkout',
    'Validate dedicated staging target',
    'Attest staging deployment identity',
    'Create short-lived browser session',
    'Run authenticated active scan',
    'Revoke DAST session',
  ];
  assert.deepEqual(
    (job.steps || []).map((step) => step.name),
    expectedStepNames,
    'DAST step order and credential boundary must remain exact',
  );
  rejectSecretReferencesInRuns(job.steps, 'DAST');
  assert.deepEqual(workflow.concurrency, {
    group: 'menorah-staging-dast',
    'cancel-in-progress': false,
  }, 'DAST concurrency must remain exact');

  const expectedUses = new Map([
    ['Checkout', 'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0'],
  ]);
  for (const step of job.steps ?? []) {
    const expectedAction = expectedUses.get(step.name);
    const expectedIf = step.name === 'Revoke DAST session' ? 'always()' : undefined;
    const expectedShell = step.name === 'Checkout' ? undefined : 'bash';
    const expectedWith = step.name === 'Checkout'
      ? { 'persist-credentials': false }
      : undefined;
    const expectedKeys = ['name', expectedAction ? 'uses' : 'run'];
    if (expectedShell !== undefined) expectedKeys.push('shell');
    if (expectedIf !== undefined) expectedKeys.push('if');
    if (expectedWith !== undefined) expectedKeys.push('with');

    assert.equal(
      step.uses,
      expectedAction,
      `DAST step ${step.name} must use the exact reviewed action`,
    );
    assert.equal(
      step.if,
      expectedIf,
      `DAST step ${step.name} must retain its exact condition`,
    );
    assert.equal(
      step.shell,
      expectedShell,
      `DAST step ${step.name} must retain its exact shell`,
    );
    assert.equal(
      step.env,
      undefined,
      `DAST step ${step.name} must not gain step-level environment values`,
    );
    assert.deepEqual(
      step.with,
      expectedWith,
      `DAST step ${step.name} must retain its exact action inputs`,
    );
    if (expectedAction) {
      assert.equal(step.run, undefined, `DAST action step ${step.name} must not contain run`);
    } else {
      assert.equal(typeof step.run, 'string', `DAST command step ${step.name} must retain run`);
    }
    assertExactStepKeys(step, expectedKeys, 'DAST');
  }
  const expectedRunDigests = new Map([
    ['Validate dedicated staging target', '270b2ec6fc152dfaa47620c09ae86381bdcb4b70647f760985f470aa7ea2900f'],
    ['Attest staging deployment identity', '2794803321bdeccdcfa923625a2f986a968db47cfb0d120d89b33936bbf39616'],
    ['Create short-lived browser session', '0123ca07270521d6907e75e368e0b7f45f2266f2c7f1371606e68e1c6c55f51a'],
    ['Run authenticated active scan', '8f50bb5a43a76646c6913c85483d9f7b7af5a09ce7dd8b21fb5f74d15151e644'],
    ['Revoke DAST session', '50407b5cbd59abe36f6c591634c8fd58dc299a4db9f8c53294112527b8daa0b7'],
  ]);
  for (const [stepName, expectedDigest] of expectedRunDigests) {
    const step = job.steps.find((candidate) => candidate.name === stepName);
    assert.equal(
      sha256(step?.run),
      expectedDigest,
      `${stepName} changed; review and re-pin its credential-bound command digest`,
    );
  }

  const guard = job.steps?.find((step) => step.name === 'Validate dedicated staging target')?.run;
  assert.ok(guard, 'DAST workflow must validate its environment-owned target origins');
  rejectPattern(
    guard,
    /case\s+"\$DAST_TARGET_URL"/,
    'DAST target validation must not rely on a substring shell glob',
  );
  requirePattern(guard, /new URL\(value\)/, 'DAST target validation must parse URLs structurally');
  requirePattern(
    guard,
    /value !== parsed\.origin/,
    'DAST target validation must require an exact canonical origin',
  );
  requirePattern(
    guard,
    /parsed\.username \|\| parsed\.password/,
    'DAST target validation must reject embedded credentials',
  );
  requirePattern(
    guard,
    /parsed\.search \|\| parsed\.hash/,
    'DAST target validation must reject query strings and fragments',
  );
  requirePattern(guard, /parsed\.port/, 'DAST target validation must reject explicit ports');
  requirePattern(
    guard,
    /productionHosts\.has\(hostname\)/,
    'DAST target validation must reject known Menorah production hosts',
  );
  requirePattern(
    guard,
    /allowedHosts\.has\(hostname\)/,
    'DAST target validation must bind both origins to a reviewed exact-host allowlist',
  );
  for (const productionHost of [
    'menorah.me',
    'www.menorah.me',
    'app.menorah.me',
    'admin.menorah.me',
    'counsellor.menorah.me',
    'api.menorah.me',
    'api-ios.menorah.me',
    'api-android.menorah.me',
    'api-web.menorah.me',
    'api-admin.menorah.me',
    'calls.menorah.me',
    'vps.menorah.me',
  ]) {
    assert.ok(
      guard.includes(`'${productionHost}'`),
      `DAST target validation must reject production host ${productionHost}`,
    );
  }
  requirePattern(
    guard,
    /parseExactStagingOrigin\('DAST_TARGET_URL'\)/,
    'DAST target URL must use the exact-origin guard',
  );
  requirePattern(
    guard,
    /parseExactStagingOrigin\('DAST_TRUSTED_ORIGIN'\)/,
    'DAST trusted origin must use the same exact-origin guard',
  );

  const attestation = job.steps?.find(
    (step) => step.name === 'Attest staging deployment identity'
  )?.run ?? '';
  requirePattern(
    attestation,
    /\$DAST_TARGET_URL\/health\/ready/,
    'DAST must attest the selected target before login',
  );
  requirePattern(
    attestation,
    /x-menorah-deployment-environment/,
    'DAST must read the backend deployment-environment attestation',
  );
  requirePattern(
    attestation,
    /\[\[ "\$ATTESTED_ENVIRONMENT" != "staging" \]\]/,
    'DAST must reject any target that does not attest staging',
  );
  assert.ok(
    job.steps.findIndex((step) => step.name === 'Attest staging deployment identity')
      < job.steps.findIndex((step) => step.name === 'Create short-lived browser session'),
    'DAST target attestation must complete before credentials are sent',
  );

  const guardProgram = guard.match(/node <<'NODE'\n([\s\S]*?)\nNODE(?:\n|$)/)?.[1];
  assert.ok(guardProgram, 'DAST exact-origin guard must be an executable Node program');
  new Script(guardProgram, { filename: 'dast-origin-guard.js' });

  const activeScan = job.steps?.find((step) => step.name === 'Run authenticated active scan')?.run ?? '';
  requirePattern(activeScan, /docker run --rm/, 'DAST must retain its isolated active scan');
  requirePattern(
    activeScan,
    /ghcr\.io\/zaproxy\/zaproxy:[^@\s]+@sha256:[0-9a-f]{64}/,
    'DAST scanner image must remain immutable',
  );
  requirePattern(
    activeScan,
    /zap\.sh -cmd -autorun \/zap\/wrk\/zap\.yml/,
    'DAST must retain the authenticated ZAP active scan plan',
  );
  requirePattern(
    rawWorkflow,
    /cp \.github\/security\/zap-authenticated-plan\.yml/,
    'DAST must retain the reviewed authenticated scan plan',
  );

  return guardProgram;
}

export function validateAndroidBuildWorkflow(workflow, rawWorkflow) {
  assert.equal(workflow.name, 'Build Android AAB');
  assert.deepEqual(
    Object.keys(workflow).sort(),
    ['name', 'on', 'permissions', 'jobs'].sort(),
    'Android signing workflow fields must remain exact',
  );
  assert.deepEqual(workflow.on, {
    workflow_dispatch: {
      inputs: {
        release_sha: {
          description: 'Exact approved 40-character release commit SHA',
          required: true,
          type: 'string',
        },
      },
    },
  }, 'Android signing must remain manual with one exact-SHA input');
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(
    Object.keys(workflow.jobs || {}),
    ['build'],
    'Android signing must not gain an unreviewed job',
  );

  const job = workflow.jobs?.build;
  assert.ok(job, 'Android signing must retain its build job');
  rejectContinueOnError(job, 'Android signing');
  assert.deepEqual(
    Object.keys(job).sort(),
    ['runs-on', 'environment', 'env', 'steps'].sort(),
    'Android signing job fields must remain exact',
  );
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.equal(job.environment, 'android-release-signing');
  assert.deepEqual(job.env, {
    NODE_ENV: 'production',
    MENORAH_MOBILE_ENVIRONMENT: 'production',
    GITHUB_TRIGGER_REF: '${{ github.ref }}',
    GITHUB_TRIGGER_SHA: '${{ github.sha }}',
    ANDROID_RELEASE_SIGNING_READY: '${{ vars.ANDROID_RELEASE_SIGNING_READY }}',
    EXPO_PUBLIC_IOS_API_BASE_URL: '${{ vars.EXPO_PUBLIC_IOS_API_BASE_URL }}',
    EXPO_PUBLIC_ANDROID_API_BASE_URL: '${{ vars.EXPO_PUBLIC_ANDROID_API_BASE_URL }}',
    EXPO_PUBLIC_WEB_BASE_URL: '${{ vars.EXPO_PUBLIC_WEB_BASE_URL }}',
    EXPO_PUBLIC_CHECKOUT_RETURN_URL: '${{ vars.EXPO_PUBLIC_CHECKOUT_RETURN_URL }}',
    EXPO_PUBLIC_JITSI_BASE_URL: '${{ vars.EXPO_PUBLIC_JITSI_BASE_URL }}',
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: '${{ vars.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID }}',
    EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: '${{ vars.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID }}',
  });

  const expectedStepNames = [
    'Validate approved release SHA',
    'Checkout',
    'Verify checked-out release SHA',
    'Setup Node.js',
    'Setup Java',
    'Install dependencies',
    'Validate release environment',
    'Decode keystore',
    'Make gradlew executable',
    'Build Android AAB',
    'Remove signing material',
    'Upload AAB artifact',
  ];
  assert.deepEqual(
    (job.steps || []).map((step) => step.name),
    expectedStepNames,
    'Android signing step order and secret boundary must remain exact',
  );
  rejectSecretReferencesInRuns(job.steps, 'Android signing');
  const expectedUses = new Map([
    ['Checkout', 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683'],
    ['Setup Node.js', 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'],
    ['Setup Java', 'actions/setup-java@c1e323688fd81a25caa38c78aa6df2d33d3e20d9'],
    ['Upload AAB artifact', 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'],
  ]);
  const expectedEnvs = new Map([
    ['Validate approved release SHA', {
      RELEASE_SHA: '${{ inputs.release_sha }}',
    }],
    ['Verify checked-out release SHA', {
      RELEASE_SHA: '${{ inputs.release_sha }}',
    }],
    ['Decode keystore', {
      ANDROID_KEYSTORE_BASE64: '${{ secrets.ANDROID_KEYSTORE_BASE64 }}',
    }],
    ['Build Android AAB', {
      ANDROID_KEYSTORE_FILE: '${{ runner.temp }}/menorah-release.keystore',
      ANDROID_KEYSTORE_PASSWORD: '${{ secrets.ANDROID_KEYSTORE_PASSWORD }}',
      ANDROID_KEY_ALIAS: '${{ secrets.ANDROID_KEY_ALIAS }}',
      ANDROID_KEY_PASSWORD: '${{ secrets.ANDROID_KEY_PASSWORD }}',
    }],
  ]);
  const expectedWith = new Map([
    ['Checkout', {
      ref: '${{ inputs.release_sha }}',
      'fetch-depth': 1,
      'persist-credentials': false,
    }],
    ['Setup Node.js', {
      'node-version': 20,
      cache: 'npm',
      'cache-dependency-path': 'menorah/mobile-app/package-lock.json',
    }],
    ['Setup Java', {
      distribution: 'temurin',
      'java-version': 17,
    }],
    ['Upload AAB artifact', {
      name: 'android-release',
      path: 'menorah/mobile-app/android/app/build/outputs/bundle/release/*.aab',
    }],
  ]);
  const expectedWorkingDirectories = new Map([
    ['Install dependencies', 'menorah/mobile-app'],
    ['Validate release environment', 'menorah/mobile-app'],
    ['Build Android AAB', 'menorah/mobile-app/android'],
  ]);
  const expectedRuns = new Map([
    ['Validate approved release SHA', [
      'if [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then',
      '  echo "::error::release_sha must be an exact lowercase 40-character commit SHA."',
      '  exit 1',
      'fi',
      'if [[ "$GITHUB_TRIGGER_REF" != "refs/heads/main" || "$RELEASE_SHA" != "$GITHUB_TRIGGER_SHA" ]]; then',
      '  echo "::error::Android release signing is restricted to the exact workflow-dispatch main HEAD."',
      '  exit 1',
      'fi',
      'if [[ "$ANDROID_RELEASE_SIGNING_READY" != "protected-main-only" ]]; then',
      '  echo "::error::Configure ANDROID_RELEASE_SIGNING_READY=protected-main-only only in the protected android-release-signing environment."',
      '  exit 1',
      'fi',
      '',
    ].join('\n')],
    ['Verify checked-out release SHA', [
      'test "$(git rev-parse HEAD)" = "$RELEASE_SHA"',
      'test -z "$(git status --porcelain)"',
      '',
    ].join('\n')],
    ['Install dependencies', 'npm ci'],
    ['Validate release environment', [
      'node -e "require(\'./scripts/release-environment.cjs\').readAndroidReleaseEnvironment(process.env)"',
      'npm run validate:release-config',
      '',
    ].join('\n')],
    ['Decode keystore', [
      'umask 077',
      'test -n "${ANDROID_KEYSTORE_BASE64}"',
      'printf \'%s\' "${ANDROID_KEYSTORE_BASE64}" | base64 --decode > "${RUNNER_TEMP}/menorah-release.keystore"',
      'test -s "${RUNNER_TEMP}/menorah-release.keystore"',
      '',
    ].join('\n')],
    ['Make gradlew executable', 'chmod +x menorah/mobile-app/android/gradlew'],
    ['Build Android AAB', './gradlew bundleRelease --stacktrace --no-daemon'],
    ['Remove signing material', 'rm -f "${RUNNER_TEMP}/menorah-release.keystore"'],
  ]);

  for (const step of job.steps || []) {
    const expectedAction = expectedUses.get(step.name);
    const expectedEnv = expectedEnvs.get(step.name);
    const expectedInput = expectedWith.get(step.name);
    const expectedWorkingDirectory = expectedWorkingDirectories.get(step.name);
    const expectedRun = expectedRuns.get(step.name);
    const expectedIf = step.name === 'Remove signing material' ? 'always()' : undefined;
    const expectedKeys = ['name', expectedAction ? 'uses' : 'run'];
    if (expectedEnv !== undefined) expectedKeys.push('env');
    if (expectedInput !== undefined) expectedKeys.push('with');
    if (expectedWorkingDirectory !== undefined) expectedKeys.push('working-directory');
    if (expectedIf !== undefined) expectedKeys.push('if');

    assert.equal(
      step.uses,
      expectedAction,
      `Android signing step ${step.name} must use the exact reviewed action`,
    );
    assert.deepEqual(
      step.env,
      expectedEnv,
      `Android signing step ${step.name} must retain its exact environment boundary`,
    );
    assert.deepEqual(
      step.with,
      expectedInput,
      `Android signing step ${step.name} must retain its exact action inputs`,
    );
    assert.equal(
      step['working-directory'],
      expectedWorkingDirectory,
      `Android signing step ${step.name} must retain its exact working directory`,
    );
    assert.equal(
      step.if,
      expectedIf,
      `Android signing step ${step.name} must retain its exact condition`,
    );
    assert.equal(
      step.shell,
      undefined,
      `Android signing step ${step.name} must not override its reviewed shell`,
    );
    const commandMessage = step.name === 'Validate approved release SHA'
      ? 'Android signing input must equal the workflow-dispatch main HEAD; approved release guard command changed'
      : `Android signing step ${step.name} command changed from the reviewed implementation`;
    assert.equal(step.run, expectedRun, commandMessage);
    assertExactStepKeys(step, expectedKeys, 'Android signing');
  }

  const secretReferences = [
    ...rawWorkflow.matchAll(
      /\$\{\{\s*secrets\s*(?:\.\s*([A-Z0-9_]+)|\[\s*['"]([A-Z0-9_]+)['"]\s*\])\s*\}\}/gi,
    ),
  ].map((match) => match[1] ?? match[2]);
  assert.deepEqual(secretReferences.sort(), [
    'ANDROID_KEYSTORE_BASE64',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ].sort(), 'Android workflow may consume only the four reviewed signing secrets');
}

export function validateUpdateScript(script) {
  script = normalizeLineEndings(script);
  const requiredPatterns = [
    [/\bDEPLOY_RELEASE_SHA\b/, 'exact reviewed SHA input'],
    [/\bDEPLOY_MIGRATION_APPROVED_SHA\b/, 'explicit migration approval'],
    [/MENORAH_RELEASE_REPO_ROOT/, 'reviewed-tooling adoption root'],
    [/ensure_reviewed_updater_execution/, 'candidate updater blob handoff'],
    [/cat-file blob "\$\{REVIEWED_SHA\}:\$\{updater_path\}"/, 'reviewed updater extraction'],
    [/MENORAH_REVIEWED_UPDATER_LOCK_FD/, 'locked candidate-updater handoff'],
    [/refs\/remotes\/origin\/\$\{BRANCH\}/, 'remote branch tip comparison'],
    [/merge-base --is-ancestor "\$\{PREVIOUS_SHA\}" "\$\{REVIEWED_SHA\}"/, 'fast-forward ancestry enforcement'],
    [/checkout --detach "\$\{REVIEWED_SHA\}"/, 'detached exact-SHA checkout'],
    [/SOURCE_CHECKOUT_CHANGED/, 'pre-maintenance source restoration state'],
    [/MAINTENANCE_STARTED/, 'explicit maintenance-start boundary'],
    [/flock -n 9/, 'exclusive deployment lock'],
    [/backup-now\.sh" manual/, 'fresh manual backup'],
    [/validate_backup_schedule/, 'host-owned backup timer preflight'],
    [/systemctl show --property=ExecStart/, 'installed backup unit command verification'],
    [/systemctl show --property=WorkingDirectory/, 'installed backup unit checkout verification'],
    [/--profile backup-job stop[\s\S]*backup-runner/, 'retired continuous backup-runner shutdown'],
    [/pull --policy always backup-runner/, 'digest-pinned one-shot backup image resolution'],
    [/restore-latest-backup\.sh" restore-test/, 'fresh backup restore test'],
    [/compose_cmd config --quiet/, 'Compose validation'],
    [/caddy validate/, 'Caddy validation'],
    [/caddy-config-validator/, 'networkless Caddy validation service'],
    [/validate_existing_app_network/, 'existing app network compatibility preflight'],
    [/validate_loopback_port_values/, 'loopback-only host port validation'],
    [/validate_candidate_runtime_directories/, 'candidate bind-directory ownership preflight'],
    [/ensure_predecessor_artifact_baseline/, 'first-adoption predecessor artifacts'],
    [/compose_cmd pull --policy always "\$\{PINNED_RELEASE_SERVICES\[@\]\}"/, 'digest-pinned support image resolution'],
    [/capture_release_image_ids/, 'content-addressed artifact manifest'],
    [/verify_running_release_image_ids/, 'running artifact identity verification'],
    [/sha256sum -c "\$\(basename "\$\{IMAGE_MANIFEST\}\.sha256"\)"/, 'artifact manifest checksum verification'],
    [/sourceTreeSha/, 'immutable source-tree identity'],
    [/WRITER_SERVICES/, 'writer maintenance boundary'],
    [/migration-in-progress-sha/, 'partial migration recovery marker'],
    [/SKIP_ALREADY_APPLIED/, 'duplicate migration prevention'],
    [/wait_for_health false && wait_for_health true/, 'local and public health gates'],
    [/RELEASE_METADATA/, 'recovery metadata'],
    [/validate_backend_startup_config/, 'reviewed-image startup preflight'],
    [/validate_monitoring_release_config/, 'monitoring identity and delivery preflight'],
    [/validate_mongodb_monitoring_identity/, 'read-only monitoring identity permission preflight'],
    [/run_managed_mongo_bootstrap preflight/, 'read-only existing-host managed-identity preflight'],
    [/MONGO_MANAGED_ENV_KEYS/, 'explicit managed MongoDB environment forwarding'],
    [/process\.env\.MONGO_ROOT_PASSWORD/, 'environment-backed MongoDB root authentication'],
    [/Routine releases must leave MONGO_ROTATE_CREDENTIALS_CONFIRM unset/, 'routine-release credential-rotation refusal'],
    [/Routine releases must leave MONGO_RECONCILE_DRY_RUN unset/, 'externally supplied reconciliation-mode refusal'],
    [/Routine releases must leave MONGO_BOOTSTRAP_DRY_RUN unset/, 'externally supplied bootstrap-mode refusal'],
    [/mongo-identity-reconciliation-in-progress-sha/, 'partial identity reconciliation recovery marker'],
    [/post-migration-recovery-sha/, 'post-migration recovery marker'],
    [/run-recorded-migration\.sh/, 'recorded-image migration launcher'],
    [/consolidate-legacy-media\.sh/, 'idempotent legacy media consolidation'],
    [/retire_legacy_compose_services/, 'label-verified predecessor-only service retirement'],
    [/RETIRED_COMPOSE_SERVICES=\(cadvisor promtail\)/, 'explicit cAdvisor and Promtail retirement'],
    [/validate_native_monitoring_config/, 'native monitoring semantic preflight'],
    [/promtool[\s\S]*check config \/etc\/prometheus\/prometheus\.yml/, 'Prometheus config semantic validation'],
    [/promtool[\s\S]*test rules alert-rules\.test\.yml/, 'Prometheus alert rule tests'],
    [/blackbox-exporter[\s\S]*--config\.check/, 'blackbox exporter config validation'],
    [/log-collector[\s\S]*validate \/etc\/alloy\/config\.alloy/, 'Grafana Alloy config validation'],
    [/loki[\s\S]*-verify-config/, 'Loki config validation'],
    [/check-config \/etc\/alertmanager\/alertmanager\.yml/, 'Alertmanager config validation'],
    [/ALERTMANAGER_CONFIG_SHA256/, 'tested Alertmanager config identity'],
    [/validate-alertmanager-delivery\.mjs/, 'recent Alertmanager delivery evidence validator'],
    [/test -w \/textfile[\s\S]*export-backup-metrics\.sh/, 'backup metrics write preflight'],
    [/up -d --force-recreate --no-build --pull never/, 'bind-mounted config activation'],
    [/bootstrap-in-progress-sha/, 'partial bootstrap refusal'],
    [/bootstrap-complete-sha/, 'data-only bootstrap completion state'],
    [/Same-SHA release replay is refused/, 'healthy same-SHA replay refusal'],
  ];

  for (const [pattern, capability] of requiredPatterns) {
    requirePattern(script, pattern, `update script must retain ${capability}`);
  }

  assert.equal(
    (script.match(/node src\/database\/migrate\.js/g) ?? []).length,
    0,
    'the updater must delegate migration to the recorded-image launcher',
  );
  const maintenanceIndex = script.indexOf('MAINTENANCE_STARTED=true');
  const checkoutIndex = script.indexOf(
    'git -C "${REPO_ROOT}" checkout --detach "${REVIEWED_SHA}"',
  );
  const updaterHandoffIndex = script.indexOf('\nensure_reviewed_updater_execution\n');
  const predecessorBaselineIndex = script.indexOf('\n  ensure_predecessor_artifact_baseline\n');
  const monitoringReleaseValidationIndex = script.indexOf(
    '\nvalidate_monitoring_release_config\n',
    checkoutIndex,
  );
  const networkCompatibilityIndex = script.indexOf('\nvalidate_existing_app_network\n', checkoutIndex);
  const managedIdentityPreflightIndex = script.indexOf(
    '\nrun_managed_mongo_bootstrap preflight all\n',
    checkoutIndex,
  );
  const backupIdentityApplyIndex = script.indexOf(
    '\nrun_managed_mongo_bootstrap apply backup-only\n',
    managedIdentityPreflightIndex,
  );
  const backupIdentityVerifyIndex = script.indexOf(
    '\nrun_managed_mongo_bootstrap preflight backup-only\n',
    backupIdentityApplyIndex,
  );
  const mandatoryBackupIndex = script.indexOf(
    '"${SCRIPT_DIR}/backup-now.sh" manual',
    backupIdentityVerifyIndex,
  );
  const writersStoppedIndex = script.indexOf('DEPLOY_PHASE="writers-stopped"');
  const mediaTransitionIndex = script.indexOf(
    'Consolidating legacy per-service media into the shared namespace',
  );
  const reconciliationIndex = script.indexOf(
    'Provisioning missing managed MongoDB identities and reconciling exact least-privilege roles',
  );
  const monitoringIdentityIndex = script.indexOf(
    'validate_mongodb_monitoring_identity',
    reconciliationIndex,
  );
  const migrationIndex = script.indexOf('if ! run_backend_migrations; then');
  assert.ok(
    updaterHandoffIndex >= 0
      && updaterHandoffIndex < predecessorBaselineIndex
      && predecessorBaselineIndex < checkoutIndex,
    'candidate updater handoff and predecessor baseline must precede candidate checkout',
  );
  assert.ok(
    checkoutIndex >= 0
      && checkoutIndex < monitoringReleaseValidationIndex
      && monitoringReleaseValidationIndex < maintenanceIndex,
    'candidate-only monitoring validators must run after the exact checkout and before maintenance',
  );
  assert.ok(
    checkoutIndex >= 0
      && checkoutIndex < networkCompatibilityIndex
      && networkCompatibilityIndex < managedIdentityPreflightIndex
      && managedIdentityPreflightIndex < backupIdentityApplyIndex
      && backupIdentityApplyIndex < backupIdentityVerifyIndex
      && backupIdentityVerifyIndex < mandatoryBackupIndex
      && mandatoryBackupIndex < maintenanceIndex,
    'candidate identity preflight and atomic backup-identity provisioning must run after checkout and before the mandatory backup and maintenance',
  );
  assert.ok(
    maintenanceIndex >= 0
      && maintenanceIndex < writersStoppedIndex
      && writersStoppedIndex < mediaTransitionIndex
      && mediaTransitionIndex < reconciliationIndex
      && reconciliationIndex < monitoringIdentityIndex
      && monitoringIdentityIndex < migrationIndex,
    'media transition, managed-user reconciliation, and monitoring verification must run after writers stop and before migration',
  );
  requirePattern(
    script,
    /compose_cmd stop[^\n]+"\$\{WRITER_SERVICES\[@\]\}"\s+verify_writers_stopped\s+DEPLOY_PHASE="writers-stopped"[\s\S]*?consolidate-legacy-media\.sh[\s\S]*?write_marker_atomically "\$\{MONGO_IDENTITY_RECONCILIATION_MARKER\}"[\s\S]*?run_managed_mongo_bootstrap apply[\s\S]*?run_managed_mongo_reconciliation apply/,
    'writers must be verified stopped before media evidence and marked identity provisioning/reconciliation',
  );
  requirePattern(
    script,
    /Routine releases must leave MONGO_BOOTSTRAP_SCOPE unset/,
    'operator-supplied MongoDB bootstrap scope must be rejected',
  );
  rejectPattern(script, /-p "\$MONGO_ROOT_PASSWORD"/, 'MongoDB root passwords must not enter process arguments');
  rejectPattern(script, /mongosh[^\n]*"\$MONGODB_/, 'credential-bearing MongoDB URIs must not enter process arguments');
  requirePattern(
    script,
    /mktemp \/tmp\/menorah-managed-mongo\.[\s\S]*?trap cleanup EXIT[\s\S]*?chmod 0600 "\$\{script_file\}"[\s\S]*?mongosh --nodb --quiet --file "\$\{script_file\}"/,
    'candidate MongoDB programs must use a cleaned mode-0600 file so exceptions propagate',
  );
  rejectPattern(
    script,
    /\|\s*compose_cmd exec[^\n]*mongo-primary mongosh --nodb --quiet/,
    'candidate MongoDB programs must not run through mongosh stdin REPL mode',
  );
  rejectPattern(script, /\bgit\s+-C\s+"\$\{REPO_ROOT\}"\s+pull\b/, 'release must not deploy an unreviewed moving branch tip');
  rejectPattern(script, /--network\s+host|docker\s+run\s+-d/, 'guarded Compose must remain the only runtime path');
  rejectPattern(
    script,
    /compose_cmd run --rm --no-deps reverse-proxy[\s\S]*?caddy validate/,
    'Caddy validation must not inherit the running proxy static addresses',
  );
  const retirementIndex = script.indexOf(
    'Retiring label-verified predecessor-only Promtail and cAdvisor containers',
  );
  const currentMarkerIndex = script.indexOf(
    'write_marker_atomically "${CURRENT_SHA_FILE}" "${NEW_SHA}"',
  );
  requirePattern(
    script,
    /Post-migration failure: stopping every application writer[\s\S]{0,500}?compose_cmd stop -t "\$\{DEPLOY_STOP_TIMEOUT_SECONDS:-60\}" "\$\{WRITER_SERVICES\[@\]\}"[\s\S]{0,500}?verify_writers_stopped/,
    'post-migration failure handling must stop writers after preserving recovery state',
  );
  assert.ok(
    retirementIndex > migrationIndex && retirementIndex < currentMarkerIndex,
    'predecessor-only socket/log agents must retire after migration health and before release completion',
  );

  const metadataProgram = script.match(
    /node - <<'NODE' > "\$\{temporary\}"\r?\n([\s\S]*?)\r?\nNODE/,
  )?.[1];
  assert.ok(metadataProgram, 'release metadata JavaScript must be discoverable');
  new Script(metadataProgram, { filename: 'embedded-release-metadata.js' });

  const captureFunction = script.slice(
    script.indexOf('capture_release_image_ids()'),
    script.indexOf('verify_running_release_image_ids()'),
  );
  const imageReferenceProgram = captureFunction.match(
    /compose_cmd config --format json \| node -e '\r?\n([\s\S]*?)\r?\n  ' "\$\{RELEASE_SERVICES\[@\]\}"/,
  )?.[1];
  assert.ok(imageReferenceProgram, 'image reference JavaScript must be discoverable');
  new Script(imageReferenceProgram, { filename: 'embedded-image-references.js' });
}

function validateRecordedMigration(script, compose) {
  assert.equal(
    (script.match(/node src\/database\/migrate\.js/g) ?? []).length,
    1,
    'the recorded-image launcher must expose exactly one migration command',
  );
  requirePattern(
    script,
    /recorded_manifest_sha256[\s\S]*?actual_manifest_sha256[\s\S]*?== "\$\{recorded_manifest_sha256\}"/,
    'recorded migration must verify the release manifest digest',
  );
  requirePattern(
    script,
    /BASH_REMATCH\[2\][\s\S]*?manifest_basename/,
    'recorded migration checksum must name the exact manifest basename',
  );
  requirePattern(
    script,
    /! -L "\$\{IMAGE_MANIFEST\}"[\s\S]*?! -L "\$\{IMAGE_CHECKSUM\}"/,
    'recorded migration must reject symlinked artifact evidence',
  );
  requirePattern(
    script,
    /count != 1[\s\S]*?api-web/,
    'recorded migration must require exactly one api-web manifest record',
  );
  requirePattern(
    script,
    /resolved_reference_id[\s\S]*?== "\$\{image_id\}"/,
    'recorded migration must reject mutable api-web tag drift',
  );
  requirePattern(
    script,
    /MENORAH_MIGRATION_IMAGE_ID="\$\{image_id\}" docker compose/,
    'recorded migration must bind Compose to the captured content ID',
  );
  requirePattern(
    script,
    /docker-compose\.migration\.yml[\s\S]*?run --rm --no-deps --pull never api-web node src\/database\/migrate\.js/,
    'recorded migration must run once without build, dependency start, or pull',
  );
  assert.equal(
    compose?.services?.['api-web']?.image,
    '${MENORAH_MIGRATION_IMAGE_ID:?MENORAH_MIGRATION_IMAGE_ID is required}',
    'migration override must select only the recorded api-web content ID',
  );
  assert.equal(compose?.services?.['api-web']?.pull_policy, 'never');
}

function validateProductionComposeReleaseSafety(compose) {
  const validator = compose?.services?.['caddy-config-validator'];
  assert.ok(validator, 'production Compose must define a dedicated Caddy validator');
  assert.deepEqual(validator.profiles, ['validation']);
  assert.equal(validator.network_mode, 'none');
  assert.equal(validator.networks, undefined);
  assert.equal(validator.restart, 'no');
  assert.equal(validator.read_only, true);

  const expectedBindings = {
    'reverse-proxy': '${CADDY_HTTP_PORT:-127.0.0.1:8080}:80',
    'landing-page': '${LANDING_LOCAL_PORT:-127.0.0.1:18085}:3002',
    'user-web-app': '${USER_WEB_APP_LOCAL_PORT:-127.0.0.1:18087}:3002',
    'web-app': '${WEB_APP_LOCAL_PORT:-127.0.0.1:18086}:3001',
    'admin-panel': '${ADMIN_PANEL_LOCAL_PORT:-127.0.0.1:18088}:3003',
    'api-ios': '${API_IOS_LOCAL_PORT:-127.0.0.1:18080}:8080',
    'api-android': '${API_ANDROID_LOCAL_PORT:-127.0.0.1:18084}:8080',
    'api-web': '${API_WEB_LOCAL_PORT:-127.0.0.1:18082}:8080',
    'api-admin': '${API_ADMIN_LOCAL_PORT:-127.0.0.1:18083}:8080',
    worker: '${WORKER_LOCAL_PORT:-127.0.0.1:18090}:8080',
    alertmanager: '${ALERTMANAGER_LOCAL_PORT:-127.0.0.1:18102}:9093',
    grafana: '${GRAFANA_LOCAL_PORT:-127.0.0.1:18100}:3000',
    'uptime-kuma': '${UPTIME_KUMA_LOCAL_PORT:-127.0.0.1:18101}:3001',
  };
  for (const [serviceName, binding] of Object.entries(expectedBindings)) {
    assert.deepEqual(
      compose?.services?.[serviceName]?.ports,
      [binding],
      `${serviceName} must retain a loopback-safe default compatible with predecessor rollback`,
    );
  }
  for (const serviceName of ['api-ios', 'api-android', 'api-web', 'api-admin', 'worker']) {
    assert.deepEqual(
      compose?.services?.[serviceName]?.group_add,
      ['${MENORAH_MEDIA_GROUP_ID:?MENORAH_MEDIA_GROUP_ID is required}'],
      `${serviceName} must retain read access to media-group transition copies`,
    );
  }
  const replicaInitCommand = JSON.stringify(compose?.services?.['mongo-replica-init']?.command || []);
  assert.match(replicaInitCommand, /process\.env\.MONGO_ROOT_PASSWORD/);
  assert.doesNotMatch(replicaInitCommand, /(?:^|\s)-p(?:\s|=)/);
}

function validatePostMigrationResume(script) {
  requirePattern(script, /RESUME_RECORDED_RELEASE/, 'post-migration resume must require literal approval');
  requirePattern(script, /post-migration-recovery-sha/, 'post-migration resume must require recovery state');
  requirePattern(script, /migration-applied-sha/, 'post-migration resume must bind to applied migration state');
  requirePattern(script, /hash-object "\$\{BASH_SOURCE\[0\]\}"/, 'post-migration resume must verify its candidate blob');
  requirePattern(script, /--no-build --pull never/, 'post-migration resume must reuse recorded artifacts');
  requirePattern(script, /metadata\.healthStatus === "failed"/, 'post-migration resume must require failed release evidence');
  requirePattern(script, /status --porcelain/, 'post-migration resume must reject a dirty checkout');
  requirePattern(script, /HEAD\^\{tree\}/, 'post-migration resume must bind to the recorded source tree');
  requirePattern(script, /EXPECTED_RELEASE_SERVICES/, 'post-migration resume must enforce the exact service set');
  requirePattern(script, /CHECK_PUBLIC=false[\s\S]*CHECK_PUBLIC=true/, 'post-migration resume must pass local and public health');
  requirePattern(script, /stop_writers/, 'failed post-migration resume must stop writers');
  requirePattern(script, /retire_legacy_compose_services/, 'successful resume must retire predecessor-only socket/log agents');
  rejectPattern(script, /src\/database\/migrate/, 'post-migration resume must never rerun a migration');
  const trapIndex = script.indexOf("trap 'status=$?; trap - EXIT; on_exit");
  const stateValidationIndex = script.indexOf('Recorded failed-release metadata is not eligible');
  const firstTagIndex = script.indexOf('docker image tag');
  assert.ok(
    stateValidationIndex >= 0 && trapIndex > stateValidationIndex && trapIndex < firstTagIndex,
    'post-migration failure trap must arm after authority/state checks and before artifact mutation',
  );
}

function validateMongoIdentityRecovery(script) {
  requirePattern(
    script,
    /RECOVER_RECORDED_MONGO_IDENTITIES/,
    'managed-identity recovery must require literal approval',
  );
  requirePattern(
    script,
    /mongo-identity-reconciliation-in-progress-sha/,
    'managed-identity recovery must require durable recovery state',
  );
  requirePattern(
    script,
    /merge-base --is-ancestor "\$\{RECORDED_CURRENT_SHA\}" "\$\{RECOVERY_SHA\}"/,
    'managed-identity recovery must bind the candidate to the current release lineage',
  );
  requirePattern(
    script,
    /marked candidate already has an applied migration/,
    'managed-identity recovery must reject a post-migration candidate',
  );
  requirePattern(
    script,
    /rollback-in-progress-sha/,
    'managed-identity recovery must reject an interrupted rollback',
  );
  requirePattern(
    script,
    /hash-object "\$\{BASH_SOURCE\[0\]\}"/,
    'managed-identity recovery must verify its candidate script blob',
  );
  requirePattern(
    script,
    /cat-file blob "\$\{RECOVERY_SHA\}:\$\{repository_path\}"/,
    'managed-identity recovery must execute exact candidate programs',
  );
  requirePattern(
    script,
    /create-users\.js[\s\S]*?reconcile-managed-users\.js/,
    'managed-identity recovery must include candidate bootstrap and reconciliation programs',
  );
  requirePattern(
    script,
    /MONGO_MANAGED_ENV_KEYS=\([\s\S]*?MONGO_MONITOR_PASSWORD[\s\S]*?\)/,
    'managed-identity recovery must forward the complete identity set',
  );
  requirePattern(
    script,
    /MONGO_BOOTSTRAP_SCOPE all/,
    'managed-identity recovery must force the full bootstrap scope',
  );
  requirePattern(
    script,
    /-z "\$\{MONGO_BOOTSTRAP_SCOPE:-\}"/,
    'managed-identity recovery must reject an operator-supplied bootstrap scope',
  );
  requirePattern(
    script,
    /stop_and_verify_writers[\s\S]*?run_bootstrap apply[\s\S]*?run_reconciliation apply[\s\S]*?run_reconciliation preflight[\s\S]*?rm -f -- "\$\{IDENTITY_MARKER\}"/,
    'managed-identity recovery must stop writers, finish idempotent provisioning, and verify exact roles before clearing state',
  );
  requirePattern(script, /process\.env\.MONGO_ROOT_PASSWORD/, 'identity recovery must authenticate from environment inside mongosh');
  rejectPattern(script, /-p "\$MONGO_ROOT_PASSWORD"/, 'identity recovery must not expose the root password in argv');
  requirePattern(
    script,
    /mktemp \/tmp\/menorah-managed-mongo\.[\s\S]*?trap cleanup EXIT[\s\S]*?chmod 0600 "\$\{script_file\}"[\s\S]*?mongosh --nodb --quiet --file "\$\{script_file\}"/,
    'identity recovery must execute candidate programs as a checked file with nonzero exception propagation',
  );
  rejectPattern(
    script,
    /\|\s*compose_cmd exec[^\n]*mongo-primary mongosh --nodb --quiet/,
    'identity recovery must not run candidate programs through mongosh stdin REPL mode',
  );
  rejectPattern(
    script,
    /src\/database\/migrate|compose_cmd (?:up|start)\b/,
    'managed-identity recovery must neither migrate nor restart writers',
  );
  const stateValidationIndex = script.indexOf(
    'The identity, current-release, and exact candidate checkout state does not agree',
  );
  const trapIndex = script.indexOf("trap 'status=$?; trap - EXIT; on_exit");
  const writerStopIndex = script.lastIndexOf('\nstop_and_verify_writers\n');
  assert.ok(
    stateValidationIndex >= 0 && trapIndex > stateValidationIndex && trapIndex < writerStopIndex,
    'managed-identity recovery trap must arm after authority/state checks and before writer mutation',
  );
}

function validateHealthScript(script) {
  rejectPattern(script, /curl\s+-k\b|curl\s+--insecure\b/, 'health checks must verify TLS certificates');
  requirePattern(script, /--connect-timeout/, 'health checks must bound connection latency');
  requirePattern(script, /--max-time/, 'health checks must bound total request latency');
  requirePattern(script, /query\?query=probe_success/, 'health gate must evaluate blackbox probe outcomes');
  requirePattern(script, /menorah_backup_metrics_last_run_timestamp_seconds/, 'health gate must require fresh backup telemetry');
}

function validateBackupAndRestoreScripts(backup, restore, acknowledge) {
  requirePattern(backup, /flock -n 8/, 'backup must use the shared backup lock');
  requirePattern(backup, /mongodump[\s\S]*--oplog/, 'MongoDB backup must capture an oplog-consistent snapshot');
  requirePattern(backup, /run-mongo-tool-secure\.sh MONGODB_BACKUP_URI mongodump/, 'backup must keep its credential-bearing URI out of argv');
  rejectPattern(backup, /mongodump[^\n]*--uri/, 'backup must not expose its credential-bearing URI in argv');
  requirePattern(backup, /MEDIA_VERIFY_MONGODB_URI="\$\{MONGODB_BACKUP_URI\}"[\s\S]*?-e MEDIA_VERIFY_MONGODB_URI/, 'backup media verification must inherit its URI without an argv value');
  rejectPattern(backup, /-e\s+["']?MEDIA_VERIFY_MONGODB_URI=/, 'backup media verification must not expose its URI in Compose argv');
  requirePattern(restore, /flock -n "\$\{fd\}"/, 'restore must acquire shared deployment and backup locks');
  requirePattern(restore, /Production restore requires an explicit RESTORE_ARCHIVE/, 'production restore must require an exact archive');
  requirePattern(restore, /ACTUAL_ARCHIVE_SHA256/, 'restore must verify archive content identity');
  requirePattern(restore, /restore-test before production recovery/, 'production restore must require exact restore-test evidence');
  requirePattern(restore, /WRITER_SERVICES=\(api-ios api-android api-web api-admin worker\)/, 'production restore must enumerate every writer');
  requirePattern(restore, /stop_and_verify_writers/, 'production restore must stop and verify writers');
  requirePattern(restore, /backup-now\.sh" manual/, 'production restore must take a quiesced pre-restore backup');
  requirePattern(restore, /--oplogReplay/, 'restore must replay the point-in-time oplog');
  requirePattern(restore, /verify_restored_domain_invariants/, 'restore must verify domain-level data invariants');
  requirePattern(restore, /MONGODB_PRODUCTION_RESTORE_URI[\s\S]*?mongorestore[\s\S]*?--config="\$config_file"/, 'production restore must keep its credential-bearing URI in an ephemeral config');
  rejectPattern(restore, /mongorestore[^\n]*--uri/, 'restore must not expose a credential-bearing URI in argv');
  requirePattern(restore, /MEDIA_VERIFY_MONGODB_URI="\$\{uri\}"[\s\S]*?-e MEDIA_VERIFY_MONGODB_URI/, 'restore media verification must inherit its URI without an argv value');
  rejectPattern(restore, /-e\s+["']?MEDIA_VERIFY_MONGODB_URI=/, 'restore media verification must not expose its URI in Compose argv');
  requirePattern(restore, /rm -f -- "\$\{MIGRATION_MARKER\}"/, 'restore must invalidate stale migration state');
  requirePattern(restore, /production-restore-requires-schema-review/, 'restore must leave a blocking schema-review state');
  rejectPattern(restore, /RESTORE_CONFIRM_PRODUCTION:-false/, 'production restore must not use a boolean confirmation');
  requirePattern(acknowledge, /ACKNOWLEDGE_SCHEMA_AND_MIGRATION_REVIEW/, 'restore review acknowledgement must be explicit');
  requirePattern(acknowledge, /Writer service must remain stopped/, 'restore acknowledgement must keep writers stopped');
  requirePattern(acknowledge, /no migration marker was created/i, 'restore acknowledgement must not skip the guarded migration');
}

function validateMongoToolCredentialWrapper(script) {
  requirePattern(script, /MONGODB_BACKUP_URI\|MONGODB_RESTORE_TEST_URI\|MONGODB_PRODUCTION_RESTORE_URI/, 'MongoDB tool wrapper must allow only reviewed URI environment names');
  requirePattern(script, /mongodump\|mongorestore/, 'MongoDB tool wrapper must allow only backup and restore tools');
  requirePattern(script, /mktemp \/tmp\/menorah-mongo-tool/, 'MongoDB tool wrapper must create an ephemeral config');
  requirePattern(script, /chmod 0600/, 'MongoDB tool wrapper must restrict its ephemeral config');
  requirePattern(script, /trap cleanup EXIT/, 'MongoDB tool wrapper must remove its ephemeral config');
  requirePattern(script, /"\$\{tool\}" --config="\$\{config_file\}"/, 'MongoDB tool wrapper must authenticate via --config');
  rejectPattern(script, /"\$\{tool\}"[^\n]*"\$\{uri\}"/, 'MongoDB tool wrapper must never pass the URI to the tool argv');
}

function validateBootstrapScript(script) {
  const requiredPatterns = [
    [/MENORAH_FIRST_RUN_CONFIRM/, 'literal empty-host confirmation'],
    [/BOOTSTRAP_EMPTY_HOST/, 'bootstrap-only confirmation value'],
    [/DEPLOY_RELEASE_SHA/, 'reviewed exact bootstrap SHA'],
    [/refs\/remotes\/origin\/\$\{BRANCH\}/, 'remote-tip bootstrap identity'],
    [/migration-in-progress-sha/, 'existing migration state refusal'],
    [/compose_cmd ps -a -q/, 'existing Compose container refusal'],
    [/"\$\{STATE_DIR\}\/current-sha"/, 'successful bootstrap state marker'],
    [/bootstrap-in-progress-sha/, 'partial bootstrap marker'],
    [/compose_cmd up -d --no-build --pull never mongo-primary redis/, 'data-service-only startup'],
    [/compose_cmd run --rm --no-deps mongo-replica-init/, 'replica-set bootstrap'],
    [/TUNNEL_INGRESS_SUBNET/, 'required isolated tunnel ingress topology'],
    [/CADDY_APP_IP/, 'required exact application proxy address'],
    [/flock -n 9/, 'shared deployment lock'],
    [/prepare-runtime-directories\.sh/, 'exact empty-host runtime-directory preparation'],
    [/busybox:1\.37\.0-glibc@sha256:[0-9a-f]{64}/, 'digest-pinned runtime preparation image'],
    [/--network none/, 'networkless runtime preparation'],
    [/MENORAH_MEDIA_GROUP_ID.*OPERATOR_GID/s, 'operator media-group binding'],
  ];

  for (const [pattern, capability] of requiredPatterns) {
    requirePattern(script, pattern, `bootstrap must retain ${capability}`);
  }

  rejectPattern(
    script,
    /compose_cmd up -d --build(?:\s|$)/,
    'bootstrap must never launch the full production stack',
  );
  rejectPattern(
    script,
    /health-check\.sh/,
    'data-only bootstrap must not claim application health',
  );
}

function validateRuntimeDirectoryPreparation(script) {
  requirePattern(
    script,
    /PREPARE_EMPTY_HOST_RUNTIME_DIRECTORIES/,
    'runtime directory preparation must require literal empty-host approval',
  );
  requirePattern(script, /id -u.*= "0"/s, 'runtime directory preparation must require container root');
  requirePattern(
    script,
    /find "\$\{target\}" -mindepth 1 -print -quit[\s\S]*?already contains data/,
    'runtime directory preparation must refuse non-empty targets',
  );
  for (const exactEntry of [
    '100|2770|uploads',
    '65534|770|prometheus',
    '65534|770|alertmanager',
    '65534|770|monitoring-textfile',
    '472|770|grafana',
    '0|770|alloy',
    '10001|770|loki',
  ]) {
    assert.ok(script.includes(exactEntry), `runtime directory preparation must retain ${exactEntry}`);
  }
  rejectPattern(
    script,
    /rm\s+(?:-[^\s]*r[^\s]*\s+|--recursive)/,
    'runtime directory preparation must never recursively delete host data',
  );
}

function validateBackupSchedule(script) {
  requirePattern(
    script,
    /menorah-backup-six-hourly\.timer/,
    'the host schedule must install a six-hourly guarded backup timer',
  );
  requirePattern(
    script,
    /Unit=menorah-backup@six-hourly\.service/,
    'the six-hourly timer must invoke backup-now.sh through the one-shot unit',
  );
  rejectPattern(
    script,
    /User=root/,
    'scheduled backup services must not run as root',
  );
}

function validateRollbackScript(script) {
  requirePattern(script, /flock -n 9/, 'rollback must share the deployment lock');
  requirePattern(script, /MIGRATION_IN_PROGRESS_MARKER/, 'rollback must block a partial migration');
  requirePattern(script, /Code-only rollback is blocked because database migrations were applied/, 'rollback must block incompatible post-migration code rollback');
  requirePattern(script, /IMAGE_MANIFEST_CHECKSUM/, 'rollback must require the recorded artifact manifest checksum');
  requirePattern(script, /CURRENT_STATE_SHA_FILE/, 'rollback must recover the recorded current release after an interrupted attempt');
  requirePattern(script, /CURRENT_SHA.*RECORDED_CURRENT_SHA/s, 'rollback must distinguish interrupted attempts from completed releases');
  requirePattern(script, /image_reference.*@sha256/s, 'rollback must identify digest-pinned image references');
  requirePattern(script, /resolved_image_id.*image_id/s, 'rollback must verify digest-pinned reference identity');
  requirePattern(
    script,
    /if \[\[ "\$\{image_reference\}" != \*@sha256:\* \]\]; then\s+docker image tag/,
    'rollback must retag only mutable local build references',
  );
  requirePattern(script, /rollback-in-progress-sha/, 'rollback must preserve a durable retry target');
  requirePattern(
    script,
    /write_marker_atomically "\$\{ROLLBACK_IN_PROGRESS_MARKER\}" "\$\{TARGET_SHA\}"[\s\S]*?trap .*handle_exit[\s\S]*?docker image tag/,
    'rollback must persist its exact target and arm failure handling before artifact mutation',
  );
  requirePattern(
    script,
    /write_marker_atomically "\$\{CURRENT_STATE_SHA_FILE\}" "\$\{TARGET_SHA\}"[\s\S]*?rm -f -- "\$\{ROLLBACK_IN_PROGRESS_MARKER\}"/,
    'rollback must commit current state before clearing its retry marker',
  );
  requirePattern(script, /verify[\s\S]*recorded image|recorded image/i, 'rollback must verify running recorded artifacts');
  requirePattern(script, /CHECK_PUBLIC=false[\s\S]*CHECK_PUBLIC=true/, 'rollback must pass local and public health');
  rejectPattern(script, /compose_cmd up[^\n]*--build/, 'rollback must never rebuild artifacts');
}

function validateRunbook(runbook) {
  requirePattern(runbook, /sole production deployment method/i, 'runbook must identify one authoritative method');
  requirePattern(runbook, /DEPLOY_RELEASE_SHA/, 'runbook must require the reviewed release SHA');
  requirePattern(runbook, /DEPLOY_MIGRATION_APPROVED_SHA/, 'runbook must document migration approval');
  requirePattern(runbook, /manual[\s\S]*candidate_sha[\s\S]*full 40-character reviewed commit SHA/i, 'runbook must document immutable manual CI input');
  requirePattern(runbook, /`Required security gates`/, 'runbook must identify the stable security check');
  requirePattern(runbook, /One-time guarded-tooling adoption/, 'runbook must document first guarded-tooling adoption');
  requirePattern(runbook, /git hash-object/, 'reviewed updater blob identity must be verified');
  requirePattern(runbook, /menorah\/backend\/cloudbuild\.yaml/, 'runbook must classify the legacy Cloud Build definition');
  requirePattern(runbook, /gcp\/cloudrun\.yaml/, 'runbook must classify the legacy Cloud Run template');
  requirePattern(runbook, /must not be invoked, attached to a trigger/i, 'runbook must prohibit legacy Cloud Run deployment');
  requirePattern(runbook, /OWNER ACTION:/, 'runbook must identify owner actions');
  requirePattern(runbook, /INFRASTRUCTURE ACTION:/, 'runbook must identify infrastructure actions');
}

function validateDisabledCloudRunPaths(
  cloudBuild,
  cloudRun,
  archivedCloudBuild,
  archivedCloudRun,
  runbook,
) {
  const nonCommentTombstones = `${cloudBuild}\n${cloudRun}`.replace(/^\s*#.*$/gm, '');
  rejectPattern(nonCommentTombstones, /\bsteps\s*:|\bapiVersion\s*:|\bkind\s*:\s*Service\b/, 'legacy active paths must remain invalid deployment inputs');
  rejectPattern(nonCommentTombstones, /\bgcloud\s+run\b|\bdocker\s+push\b/, 'legacy active paths must contain no deployment mutation');

  const cloudBuildTombstone = parse(cloudBuild);
  const cloudRunTombstone = parse(cloudRun);
  assert.deepEqual(cloudBuildTombstone, {
    disabledProductionDeployment: {
      platform: 'cloud-build',
      disabled: true,
      authoritativeMethod: 'menorah/deploy/ubuntu/update-from-git.sh',
    },
  });
  assert.deepEqual(cloudRunTombstone, {
    disabledProductionDeployment: {
      platform: 'cloud-run',
      disabled: true,
      authoritativeMethod: 'menorah/deploy/ubuntu/update-from-git.sh',
    },
  });

  for (const [archiveName, archive] of [
    ['Cloud Build archive', archivedCloudBuild],
    ['Cloud Run archive', archivedCloudRun],
  ]) {
    requirePattern(archive, /^# ARCHIVED \/ DISABLED/m, `${archiveName} must be visibly disabled`);
    requirePattern(archive, /BOOKING_PAYMENTS_ENABLED(?: and |.*\n.*)PAYOUTS_ENABLED[\s\S]*false/i, `${archiveName} must preserve the retired false payment gates`);
    requirePattern(archive, /RAZORPAY_X_KEY_ID/, `${archiveName} must preserve the dedicated payout declaration`);
    requirePattern(archive, /RAZORPAY_X_WEBHOOK_SECRET/, `${archiveName} must preserve the dedicated payout webhook declaration`);
  }

  requirePattern(
    runbook,
    /disable any Cloud Build trigger that references[\s\S]*cloudbuild\.yaml/i,
    'retired Cloud Run deployment requires an explicit trigger-disable infrastructure action',
  );
  requirePattern(
    runbook,
    /remove Cloud Run deployment authority/i,
    'retired Cloud Run deployment requires an explicit deploy-authority removal action',
  );
}

async function main() {
  const [
    rawWorkflow,
    rawSecurityWorkflow,
    rawDastWorkflow,
    rawAndroidBuildWorkflow,
    branchProtection,
    pullRequestTemplate,
    releaseEvidenceTemplate,
    firstRunScript,
    backupScheduleScript,
    updateScript,
    healthScript,
    backupScript,
    mongoToolCredentialWrapper,
    restoreScript,
    restoreAcknowledgeScript,
    rollbackScript,
    resumePostMigrationScript,
    recoverMongoIdentitiesScript,
    recordedMigrationScript,
    rawMigrationCompose,
    runtimeDirectoryPrepScript,
    rawProductionCompose,
    rawTunnelCompose,
    legacyCloudBuild,
    legacyCloudRun,
    archivedCloudBuild,
    archivedCloudRun,
    operatorRunbook,
  ] = await Promise.all([
    read(paths.workflow),
    read(paths.securityWorkflow),
    read(paths.dastWorkflow),
    read(paths.androidBuildWorkflow),
    read(paths.branchProtection),
    read(paths.pullRequestTemplate),
    read(paths.releaseEvidenceTemplate),
    read(paths.firstRunScript),
    read(paths.backupScheduleScript),
    read(paths.updateScript),
    read(paths.healthScript),
    read(paths.backupScript),
    read(paths.mongoToolCredentialWrapper),
    read(paths.restoreScript),
    read(paths.restoreAcknowledgeScript),
    read(paths.rollbackScript),
    read(paths.resumePostMigrationScript),
    read(paths.recoverMongoIdentitiesScript),
    read(paths.recordedMigrationScript),
    read(paths.migrationCompose),
    read(paths.runtimeDirectoryPrepScript),
    read(paths.productionCompose),
    read(paths.tunnelCompose),
    read(paths.legacyCloudBuild),
    read(paths.legacyCloudRun),
    read(paths.archivedCloudBuild),
    read(paths.archivedCloudRun),
    read(paths.operatorRunbook),
  ]);

  validateWorkflow(parse(rawWorkflow), rawWorkflow);
  validateGovernance(
    parse(rawSecurityWorkflow),
    branchProtection,
    pullRequestTemplate,
    releaseEvidenceTemplate,
  );
  validateDastWorkflow(parse(rawDastWorkflow), rawDastWorkflow);
  validateAndroidBuildWorkflow(
    parse(rawAndroidBuildWorkflow),
    rawAndroidBuildWorkflow,
  );
  validateBootstrapScript(firstRunScript);
  validateBackupSchedule(backupScheduleScript);
  validateUpdateScript(updateScript);
  validateHealthScript(healthScript);
  validateBackupAndRestoreScripts(backupScript, restoreScript, restoreAcknowledgeScript);
  validateMongoToolCredentialWrapper(mongoToolCredentialWrapper);
  validateRollbackScript(rollbackScript);
  validatePostMigrationResume(resumePostMigrationScript);
  validateMongoIdentityRecovery(recoverMongoIdentitiesScript);
  validateRecordedMigration(recordedMigrationScript, parse(rawMigrationCompose));
  validateRuntimeDirectoryPreparation(runtimeDirectoryPrepScript);
  const productionCompose = parse(rawProductionCompose, { merge: true });
  validatePinnedRuntimeImages(productionCompose, 'docker-compose.production.yml');
  validateBackupJobBoundary(productionCompose);
  validateProductionComposeReleaseSafety(productionCompose);
  validatePinnedRuntimeImages(parse(rawTunnelCompose), 'docker-compose.tunnel.yml');
  validateRunbook(operatorRunbook);
  validateDisabledCloudRunPaths(
    legacyCloudBuild,
    legacyCloudRun,
    archivedCloudBuild,
    archivedCloudRun,
    operatorRunbook,
  );

  console.log('Production release workflow and safety invariants validate.');
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(`Release readiness validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  validateDisabledCloudRunPaths,
  validateGovernance,
  validateMongoIdentityRecovery,
  validateMongoToolCredentialWrapper,
  validatePostMigrationResume,
  validateProductionComposeReleaseSafety,
  validateRecordedMigration,
  validateRuntimeDirectoryPreparation,
  validateWorkflow,
};
