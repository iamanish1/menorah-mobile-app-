import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readDeploymentScript = (name) => readFileSync(
  new URL(`../../deploy/server-staging/${name}`, import.meta.url),
  'utf8',
);

const migration = readDeploymentScript('run-recorded-migration.sh');
const deploy = readDeploymentScript('deploy-exact-sha.sh');
const manifest = readDeploymentScript('create-image-manifest.sh');

test('recorded migration participates in the shared deployment lock', () => {
  assert.match(
    migration,
    /readonly DEPLOY_LOCK='\/opt\/menorah-staging\/deploy-state\/\.deploy\.lock'/,
  );
  assert.match(
    migration,
    /acquire_shared_deploy_lock\(\) \{[\s\S]*flock -n 9[\s\S]*\}/,
  );

  const authorityCheck = migration.indexOf(
    "|| fail 'migration script is not from the exact recorded commit'",
  );
  const lockAcquisition = migration.indexOf(
    '\nacquire_shared_deploy_lock\n',
  );
  const stateInspection = migration.indexOf(
    '\nfor blocking_marker in \\\n',
  );
  assert.ok(authorityCheck >= 0);
  assert.ok(lockAcquisition > authorityCheck);
  assert.ok(stateInspection > lockAcquisition);
});

test('recorded migration only reuses descriptor 9 for the exact lock', () => {
  assert.match(
    migration,
    /if \[\[ -e '\/proc\/self\/fd\/9' \]\]; then/,
  );
  assert.match(
    migration,
    /lock_fd_target="\$\(realpath -e -- '\/proc\/self\/fd\/9'\)"/,
  );
  assert.match(
    migration,
    /\[\[ "\$\{lock_fd_target\}" == "\$\{DEPLOY_LOCK\}" \]\]/,
  );
  assert.match(
    migration,
    /fail 'inherited descriptor 9 is not the staging deployment lock'/,
  );
  assert.match(
    migration,
    /else\s+exec 9>>"\$\{DEPLOY_LOCK\}"\s+fi/,
  );
  assert.match(
    migration,
    /\[\[ -f "\$\{DEPLOY_LOCK\}" && ! -L "\$\{DEPLOY_LOCK\}" \]\]/,
  );
});

test('exact-SHA deploy retains the shared lock while invoking migration', () => {
  const lockAcquisition = deploy.indexOf('exec 9>>"${DEPLOY_LOCK}"');
  const migrationInvocation = deploy.indexOf(
    '"${SCRIPT_DIR}/run-recorded-migration.sh" "${RELEASE_SHA}"',
  );
  assert.ok(lockAcquisition >= 0);
  assert.ok(migrationInvocation > lockAcquisition);
  assert.doesNotMatch(
    deploy.slice(lockAcquisition, migrationInvocation),
    /exec 9>&-/,
  );
});

test('manifest capture reuses fd9 and keeps its own lock on fd8', () => {
  assert.match(
    manifest,
    /acquire_shared_deploy_lock\(\) \{[\s\S]*flock -n 9[\s\S]*\}/,
  );
  assert.match(
    manifest,
    /if \[\[ -e '\/proc\/self\/fd\/9' \]\]; then[\s\S]*inherited descriptor 9 is not the staging deployment lock/,
  );
  assert.match(manifest, /else\s+exec 9>>"\$\{DEPLOY_LOCK\}"\s+fi/);
  assert.match(manifest, /exec 8>>"\$\{MANIFEST_LOCK\}"/);
  assert.match(manifest, /flock -n 8/);
  assert.doesNotMatch(manifest, /exec 9>>"\$\{MANIFEST_LOCK\}"/);

  const deployLock = deploy.indexOf('exec 9>>"${DEPLOY_LOCK}"');
  const manifestInvocation = deploy.indexOf(
    '"${SCRIPT_DIR}/create-image-manifest.sh" "${RELEASE_SHA}"',
  );
  assert.ok(manifestInvocation > deployLock);
  assert.doesNotMatch(
    deploy.slice(deployLock, manifestInvocation),
    /exec 9>&-/,
  );
});
