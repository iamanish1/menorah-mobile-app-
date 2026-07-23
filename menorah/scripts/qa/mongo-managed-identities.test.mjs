import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const QA_DIR = path.dirname(fileURLToPath(import.meta.url));
const MENORAH_ROOT = path.resolve(QA_DIR, '..', '..');
const CREATE_USERS_PATH = path.join(MENORAH_ROOT, 'deploy', 'mongo', 'create-users.js');
const RECONCILE_USERS_PATH = path.join(
  MENORAH_ROOT,
  'deploy',
  'mongo',
  'reconcile-managed-users.js'
);
const scripts = Object.freeze({
  create: fs.readFileSync(CREATE_USERS_PATH, 'utf8'),
  reconcile: fs.readFileSync(RECONCILE_USERS_PATH, 'utf8'),
});

const REQUIRED_KEYS = [
  'MONGO_ROOT_USER',
  'MONGO_ROOT_PASSWORD',
  'MONGO_APP_USER',
  'MONGO_APP_PASSWORD',
  'MONGO_BACKUP_USER',
  'MONGO_BACKUP_PASSWORD',
  'MONGO_RESTORE_USER',
  'MONGO_RESTORE_PASSWORD',
  'MONGO_MONITOR_USER',
  'MONGO_MONITOR_PASSWORD',
];

const buildEnv = () => ({
  MONGO_ROOT_USER: 'root-user',
  MONGO_ROOT_PASSWORD: `root-${'r'.repeat(40)}`,
  MONGO_APP_USER: 'app-user',
  MONGO_APP_PASSWORD: `app-${'a'.repeat(40)}`,
  MONGO_BACKUP_USER: 'backup-user',
  MONGO_BACKUP_PASSWORD: `backup-${'b'.repeat(40)}`,
  MONGO_RESTORE_USER: 'restore-user',
  MONGO_RESTORE_PASSWORD: `restore-${'s'.repeat(40)}`,
  MONGO_MONITOR_USER: 'monitor-user',
  MONGO_MONITOR_PASSWORD: `monitor-${'m'.repeat(40)}`,
  MONGO_INITDB_ROOT_USERNAME: 'root-user',
  MONGO_INITDB_ROOT_PASSWORD: `root-${'r'.repeat(40)}`,
});

const EXPECTED_IDENTITIES = Object.freeze({
  'root-user': [{ role: 'root', db: 'admin' }],
  'app-user': [{ role: 'readWrite', db: 'menorah' }],
  'backup-user': [{ role: 'backup', db: 'admin' }],
  'restore-user': [
    { role: 'readWrite', db: 'menorah' },
    { role: 'dbAdmin', db: 'menorah' },
  ],
  'monitor-user': [
    { role: 'clusterMonitor', db: 'admin' },
    { role: 'read', db: 'local' },
  ],
});
const PASSWORD_KEY_BY_USER = Object.freeze({
  'app-user': 'MONGO_APP_PASSWORD',
  'backup-user': 'MONGO_BACKUP_PASSWORD',
  'restore-user': 'MONGO_RESTORE_PASSWORD',
  'monitor-user': 'MONGO_MONITOR_PASSWORD',
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const buildHarness = ({
  env = buildEnv(),
  users = {},
  failCreateAt = null,
  failUpdateAt = null,
  applyUpdates = true,
} = {}) => {
  const storedUsers = new Map(
    Object.entries(users).map(([user, roles]) => [user, { user, roles: clone(roles) }])
  );
  const createCalls = [];
  const updateCalls = [];
  const getCalls = [];
  const output = [];
  const admin = {
    getUser(user) {
      getCalls.push(user);
      return storedUsers.has(user) ? clone(storedUsers.get(user)) : null;
    },
    createUser(spec) {
      createCalls.push(clone(spec));
      if (failCreateAt === createCalls.length) {
        throw new Error(`database failure included ${spec.pwd}`);
      }
      storedUsers.set(spec.user, { user: spec.user, roles: clone(spec.roles) });
    },
    updateUser(user, update) {
      updateCalls.push({ user, update: clone(update) });
      if (failUpdateAt === updateCalls.length) {
        throw new Error(`database failure included ${update.pwd}`);
      }
      if (applyUpdates) {
        storedUsers.set(user, { user, roles: clone(update.roles) });
      }
    },
  };
  const context = {
    db: {
      getSiblingDB(databaseName) {
        assert.equal(databaseName, 'admin');
        return admin;
      },
    },
    print(value) {
      output.push(String(value));
    },
    process: { env: { ...env } },
  };

  return {
    context,
    createCalls,
    env,
    getCalls,
    output,
    storedUsers,
    updateCalls,
  };
};

const execute = (scriptName, harness) => vm.runInNewContext(
  scripts[scriptName],
  harness.context,
  { filename: scriptName === 'create' ? CREATE_USERS_PATH : RECONCILE_USERS_PATH }
);

const captureError = (operation) => {
  let captured = null;
  try {
    operation();
  } catch (error) {
    captured = error;
  }
  assert.ok(captured, 'expected operation to throw');
  return captured;
};

const exactUsers = () => clone(EXPECTED_IDENTITIES);

const assertNoCredentialLeak = (harness, error = null) => {
  const observed = [
    ...harness.output,
    error?.message || '',
  ].join('\n');
  for (const key of REQUIRED_KEYS.filter((name) => name.endsWith('_PASSWORD'))) {
    assert.equal(observed.includes(harness.env[key]), false);
  }
};

test('both scripts require the same complete managed-identity environment before DB access', () => {
  for (const key of REQUIRED_KEYS) {
    for (const scriptName of Object.keys(scripts)) {
      const env = buildEnv();
      delete env[key];
      const harness = buildHarness({ env });
      const error = captureError(() => execute(scriptName, harness));
      assert.equal(error.message, `${key} is required`);
      assert.equal(harness.getCalls.length, 0);
      assert.equal(harness.createCalls.length, 0);
      assert.equal(harness.updateCalls.length, 0);
    }
  }
});

test('bootstrap has no update path and reconciliation has no create path', () => {
  assert.doesNotMatch(scripts.create, /\.updateUser\s*\(/);
  assert.doesNotMatch(scripts.reconcile, /\.createUser\s*\(/);
});

test('bootstrap creates missing identities with exact roles and never updates existing users', () => {
  const harness = buildHarness({
    users: { 'root-user': EXPECTED_IDENTITIES['root-user'] },
  });

  execute('create', harness);

  assert.equal(harness.createCalls.length, 4);
  assert.equal(harness.updateCalls.length, 0);
  for (const [user, roles] of Object.entries(EXPECTED_IDENTITIES)) {
    assert.deepEqual(harness.storedUsers.get(user).roles, roles);
  }
  assert.deepEqual(
    harness.createCalls.find(({ user }) => user === 'backup-user').roles,
    [{ role: 'backup', db: 'admin' }]
  );
  assertNoCredentialLeak(harness);
});

test('bootstrap leaves a complete exact identity set unchanged', () => {
  const harness = buildHarness({ users: exactUsers() });

  execute('create', harness);

  assert.equal(harness.createCalls.length, 0);
  assert.equal(harness.updateCalls.length, 0);
  assert.match(harness.output.join('\n'), /0 created, 4 unchanged/);
  assertNoCredentialLeak(harness);
});

test('bootstrap preflight reports missing identities without creating them', () => {
  const harness = buildHarness({
    env: { ...buildEnv(), MONGO_BOOTSTRAP_DRY_RUN: 'true' },
    users: { 'root-user': EXPECTED_IDENTITIES['root-user'] },
  });

  execute('create', harness);

  assert.equal(harness.createCalls.length, 0);
  assert.equal(harness.updateCalls.length, 0);
  assert.equal(harness.storedUsers.size, 1);
  assert.match(harness.output.join('\n'), /4 missing, 0 unchanged; no changes made/);
  assertNoCredentialLeak(harness);
});

test('bootstrap preflight validates a complete exact identity set without writes', () => {
  const harness = buildHarness({
    env: { ...buildEnv(), MONGO_BOOTSTRAP_DRY_RUN: 'true' },
    users: exactUsers(),
  });

  execute('create', harness);

  assert.equal(harness.createCalls.length, 0);
  assert.equal(harness.updateCalls.length, 0);
  assert.match(harness.output.join('\n'), /0 missing, 4 unchanged; no changes made/);
  assertNoCredentialLeak(harness);
});

test('bootstrap rejects an existing role mismatch before creating anything', () => {
  const users = exactUsers();
  delete users['monitor-user'];
  users['app-user'] = [
    { role: 'readWrite', db: 'menorah' },
    { role: 'dbAdmin', db: 'menorah' },
  ];
  const harness = buildHarness({ users });

  const error = captureError(() => execute('create', harness));

  assert.equal(harness.createCalls.length, 0);
  assert.equal(harness.updateCalls.length, 0);
  assert.match(error.message, /bootstrap made no changes/);
  assertNoCredentialLeak(harness, error);
});

test('bootstrap refuses to compensate for a missing root identity', () => {
  const harness = buildHarness();

  const error = captureError(() => execute('create', harness));

  assert.match(error.message, /root identity was not safely initialized.*made no changes/);
  assert.equal(harness.createCalls.length, 0);
  assert.equal(harness.updateCalls.length, 0);
  assertNoCredentialLeak(harness, error);
});

test('routine reconciliation replaces roles exactly and omits every password field', () => {
  const users = exactUsers();
  users['app-user'] = [{ role: 'root', db: 'admin' }];
  users['backup-user'] = [{ role: 'readAnyDatabase', db: 'admin' }];
  const harness = buildHarness({ users });

  execute('reconcile', harness);

  assert.equal(harness.createCalls.length, 0);
  assert.equal(harness.updateCalls.length, 4);
  assert.deepEqual(
    harness.updateCalls.map(({ user }) => user),
    ['backup-user', 'restore-user', 'monitor-user', 'app-user']
  );
  for (const { user, update } of harness.updateCalls) {
    assert.equal(Object.hasOwn(update, 'pwd'), false);
    assert.deepEqual(update.roles, EXPECTED_IDENTITIES[user]);
  }
  assert.deepEqual(
    harness.updateCalls.find(({ user }) => user === 'backup-user').update.roles,
    [{ role: 'backup', db: 'admin' }]
  );
  assert.match(harness.output.join('\n'), /passwords unchanged/);
  assertNoCredentialLeak(harness);
});

test('read-only reconciliation preflight verifies the complete identity set without writes', () => {
  const harness = buildHarness({
    env: { ...buildEnv(), MONGO_RECONCILE_DRY_RUN: 'true' },
    users: exactUsers(),
  });

  execute('reconcile', harness);

  assert.equal(harness.createCalls.length, 0);
  assert.equal(harness.updateCalls.length, 0);
  assert.match(harness.output.join('\n'), /without changes/);
  assertNoCredentialLeak(harness);
});

test('read-only reconciliation preflight permits role drift for maintenance correction', () => {
  const users = exactUsers();
  users['monitor-user'] = [{ role: 'root', db: 'admin' }];
  const harness = buildHarness({
    env: { ...buildEnv(), MONGO_RECONCILE_DRY_RUN: 'true' },
    users,
  });

  execute('reconcile', harness);

  assert.equal(harness.createCalls.length, 0);
  assert.equal(harness.updateCalls.length, 0);
  assert.match(harness.output.join('\n'), /without changes/);
  assertNoCredentialLeak(harness);
});

test('explicit maintenance confirmation includes each new password without logging it', () => {
  const env = {
    ...buildEnv(),
    MONGO_ROTATE_CREDENTIALS_CONFIRM: 'rotate-managed-credentials',
  };
  const harness = buildHarness({ env, users: exactUsers() });

  execute('reconcile', harness);

  assert.equal(harness.updateCalls.length, 4);
  for (const { user, update } of harness.updateCalls) {
    assert.equal(update.pwd, harness.env[PASSWORD_KEY_BY_USER[user]]);
    assert.deepEqual(update.roles, EXPECTED_IDENTITIES[user]);
  }
  assert.match(harness.output.join('\n'), /password rotation confirmed/);
  assertNoCredentialLeak(harness);
});

test('reconciliation rejects a missing identity before rotating any credential', () => {
  const users = exactUsers();
  delete users['restore-user'];
  const harness = buildHarness({ users });

  const error = captureError(() => execute('reconcile', harness));

  assert.equal(harness.createCalls.length, 0);
  assert.equal(harness.updateCalls.length, 0);
  assert.match(error.message, /identity set is incomplete.*made no changes/);
  assertNoCredentialLeak(harness, error);
});

test('unsafe placeholders, duplicate identities, and inconsistent root inputs fail before DB access', () => {
  const cases = [
    { MONGO_APP_PASSWORD: 'replace_with_real_password_value_123456789' },
    { MONGO_MONITOR_USER: 'app-user' },
    { MONGO_BACKUP_PASSWORD: `app-${'a'.repeat(40)}` },
    { MONGO_INITDB_ROOT_USERNAME: 'different-root' },
  ];

  for (const overrides of cases) {
    for (const scriptName of Object.keys(scripts)) {
      const harness = buildHarness({ env: { ...buildEnv(), ...overrides } });
      captureError(() => execute(scriptName, harness));
      assert.equal(harness.getCalls.length, 0);
      assert.equal(harness.createCalls.length, 0);
      assert.equal(harness.updateCalls.length, 0);
    }
  }
});

test('reconciliation rejects any non-exact credential-rotation confirmation', () => {
  const harness = buildHarness({
    env: {
      ...buildEnv(),
      MONGO_ROTATE_CREDENTIALS_CONFIRM: 'yes',
    },
    users: exactUsers(),
  });

  const error = captureError(() => execute('reconcile', harness));

  assert.match(error.message, /MONGO_ROTATE_CREDENTIALS_CONFIRM has an invalid value/);
  assert.equal(harness.updateCalls.length, 0);
  assertNoCredentialLeak(harness, error);
});

test('bootstrap rejects any non-exact dry-run value before DB access', () => {
  const harness = buildHarness({
    env: { ...buildEnv(), MONGO_BOOTSTRAP_DRY_RUN: 'yes' },
    users: exactUsers(),
  });

  const error = captureError(() => execute('create', harness));

  assert.match(error.message, /MONGO_BOOTSTRAP_DRY_RUN has an invalid value/);
  assert.equal(harness.getCalls.length, 0);
  assert.equal(harness.createCalls.length, 0);
  assert.equal(harness.updateCalls.length, 0);
  assertNoCredentialLeak(harness, error);
});

test('reconciliation converts database errors to a credential-safe partial-rotation failure', () => {
  const env = {
    ...buildEnv(),
    MONGO_ROTATE_CREDENTIALS_CONFIRM: 'rotate-managed-credentials',
  };
  const harness = buildHarness({
    env,
    users: exactUsers(),
    failUpdateAt: 2,
  });

  const error = captureError(() => execute('reconcile', harness));

  assert.match(error.message, /credentials may be partially rotated.*must not proceed/);
  assert.equal(harness.updateCalls.length, 2);
  assertNoCredentialLeak(harness, error);
});

test('reconciliation fails closed when post-update exact-role verification fails', () => {
  const harness = buildHarness({
    users: exactUsers(),
    applyUpdates: false,
  });
  harness.storedUsers.set('app-user', {
    user: 'app-user',
    roles: [{ role: 'root', db: 'admin' }],
  });

  const error = captureError(() => execute('reconcile', harness));

  assert.match(error.message, /role verification failed/);
  assert.equal(harness.updateCalls.length, 4);
  assertNoCredentialLeak(harness, error);
});
