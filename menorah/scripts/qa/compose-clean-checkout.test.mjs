import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..');
const readRepoFile = async (path) =>
  (await readFile(resolve(REPO_ROOT, path), 'utf8')).replace(/\r\n?/g, '\n');

const [homeCompose, composeValidator, homeRuntime] = await Promise.all([
  readRepoFile('menorah/deploy/docker-compose.home.yml'),
  readRepoFile('menorah/deploy/ubuntu/validate-compose.sh'),
  readRepoFile('menorah/deploy/scripts/home-compose-up.sh'),
]);

test('home Compose defaults runtime services to the protected ignored environment', () => {
  const bindings = homeCompose.match(
    /-\s+\$\{MENORAH_HOME_SERVICE_ENV_FILE:-\.\/env\/home\.env\}/g,
  ) ?? [];

  assert.equal(bindings.length, 9);
  assert.doesNotMatch(homeCompose, /^\s*-\s+\.\/env\/home\.env\s*$/m);
  assert.match(
    homeRuntime,
    /export MENORAH_HOME_SERVICE_ENV_FILE="\.\/env\/home\.env"/,
  );
});

test('read-only validation explicitly selects only tracked synthetic fixtures', () => {
  assert.match(
    composeValidator,
    /MENORAH_HOME_SERVICE_ENV_FILE=\.\/env\/home\.env\.example[\s\S]*?--env-file "\$\{DEPLOY_DIR\}\/env\/home\.env\.example"[\s\S]*?--env-file "\$\{DEPLOY_DIR\}\/env\/home\.compose\.env\.example"/,
  );
  assert.match(
    composeValidator,
    /Home Compose validation did not bind the tracked synthetic service environment/,
  );

  for (const fixture of [
    'menorah/deploy/env/home.env.example',
    'menorah/deploy/env/home.compose.env.example',
  ]) {
    assert.doesNotThrow(() =>
      execFileSync(
        'git',
        ['ls-files', '--error-unmatch', '--', fixture],
        { cwd: REPO_ROOT, stdio: 'ignore' },
      ),
    );
  }
});

test('production validation retains missing, empty, and placeholder guards', () => {
  assert.match(composeValidator, /Staging Compose unexpectedly rendered without authoritative endpoints/);
  assert.match(composeValidator, /Compose unexpectedly rendered without \$\{required_routing_variable\}/);

  const startupValidation = execFileSync(
    'git',
    ['show', `HEAD:menorah/backend/src/shared/app/startupValidation.js`],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  assert.match(startupValidation, /must contain at least \$\{minimum\} non-placeholder characters/);
  assert.match(startupValidation, /must contain an approved non-placeholder value/);
});
