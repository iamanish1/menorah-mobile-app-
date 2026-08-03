const REQUIRED_KEYS = Object.freeze([
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
]);
const USERNAME_KEYS = Object.freeze(REQUIRED_KEYS.filter((key) => key.endsWith('_USER')));
const PASSWORD_KEYS = Object.freeze(REQUIRED_KEYS.filter((key) => key.endsWith('_PASSWORD')));
const PLACEHOLDER_PATTERN = /replace|placeholder|change[_-]?me|example/i;

const requireSafeEnvironment = () => {
  for (const key of REQUIRED_KEYS) {
    const value = process.env[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${key} is required`);
    }
    if (
      value !== value.trim()
      || /[\u0000-\u001f\u007f]/.test(value)
      || PLACEHOLDER_PATTERN.test(value)
    ) {
      throw new Error(`${key} contains an unsafe or placeholder value`);
    }
  }

  for (const key of USERNAME_KEYS) {
    if (!/^[A-Za-z0-9_.-]{3,64}$/.test(process.env[key])) {
      throw new Error(`${key} must contain 3-64 safe username characters`);
    }
  }
  for (const key of PASSWORD_KEYS) {
    if (process.env[key].length < 32 || process.env[key].length > 1024) {
      throw new Error(`${key} must contain 32-1024 characters`);
    }
  }

  if (new Set(USERNAME_KEYS.map((key) => process.env[key])).size !== USERNAME_KEYS.length) {
    throw new Error('MongoDB identity usernames must be distinct');
  }
  if (new Set(PASSWORD_KEYS.map((key) => process.env[key])).size !== PASSWORD_KEYS.length) {
    throw new Error('MongoDB identity passwords must be distinct');
  }
  for (let index = 0; index < USERNAME_KEYS.length; index += 1) {
    if (process.env[USERNAME_KEYS[index]] === process.env[PASSWORD_KEYS[index]]) {
      throw new Error('MongoDB identity passwords must differ from usernames');
    }
  }

  if (
    process.env.MONGO_INITDB_ROOT_USERNAME
    && process.env.MONGO_INITDB_ROOT_USERNAME !== process.env.MONGO_ROOT_USER
  ) {
    throw new Error('MongoDB root username configuration is inconsistent');
  }
  if (
    process.env.MONGO_INITDB_ROOT_PASSWORD
    && process.env.MONGO_INITDB_ROOT_PASSWORD !== process.env.MONGO_ROOT_PASSWORD
  ) {
    throw new Error('MongoDB root password configuration is inconsistent');
  }
};

const normalizeRoles = (roles = []) => roles
  .map(({ role, db: roleDb }) => `${role}@${roleDb}`)
  .sort();

const rolesMatchExactly = (actual, expected) => {
  const normalizedActual = normalizeRoles(actual);
  const normalizedExpected = normalizeRoles(expected);
  return normalizedActual.length === normalizedExpected.length
    && normalizedActual.every((role, index) => role === normalizedExpected[index]);
};

requireSafeEnvironment();

const admin = db.getSiblingDB('admin');
const dryRunInput = process.env.MONGO_BOOTSTRAP_DRY_RUN || '';
const scopeInput = process.env.MONGO_BOOTSTRAP_SCOPE || 'all';
if (dryRunInput && dryRunInput !== 'true') {
  throw new Error('MONGO_BOOTSTRAP_DRY_RUN has an invalid value');
}
if (!['all', 'backup-only'].includes(scopeInput)) {
  throw new Error('MONGO_BOOTSTRAP_SCOPE has an invalid value');
}
const dryRun = dryRunInput === 'true';
const root = {
  user: process.env.MONGO_ROOT_USER,
  roles: [{ role: 'root', db: 'admin' }],
};
const managed = Object.freeze([
  {
    user: process.env.MONGO_APP_USER,
    pwd: process.env.MONGO_APP_PASSWORD,
    roles: [{ role: 'readWrite', db: 'menorah' }],
  },
  {
    user: process.env.MONGO_BACKUP_USER,
    pwd: process.env.MONGO_BACKUP_PASSWORD,
    roles: [{ role: 'backup', db: 'admin' }],
  },
  {
    user: process.env.MONGO_RESTORE_USER,
    pwd: process.env.MONGO_RESTORE_PASSWORD,
    roles: [
      { role: 'readWrite', db: 'menorah' },
      { role: 'dbAdmin', db: 'menorah' },
    ],
  },
  {
    user: process.env.MONGO_MONITOR_USER,
    pwd: process.env.MONGO_MONITOR_PASSWORD,
    roles: [
      { role: 'clusterMonitor', db: 'admin' },
      { role: 'read', db: 'local' },
    ],
  },
]);

const verifyConfiguredCredential = (identity) => {
  try {
    const credentialDb = connect(
      'mongodb://127.0.0.1:27017/admin?authSource=admin',
      identity.user,
      identity.pwd
    );
    const status = credentialDb.runCommand({ connectionStatus: 1, showPrivileges: false });
    const authenticatedUsers = status?.authInfo?.authenticatedUsers || [];
    if (
      status?.ok !== 1
      || !authenticatedUsers.some(({ user, db: authDb }) => (
        user === identity.user && authDb === 'admin'
      ))
    ) {
      throw new Error('credential verification failed');
    }
  } catch {
    throw new Error(
      'A managed MongoDB identity does not authenticate with its configured credential; '
      + 'bootstrap made no further changes'
    );
  }
};

const existingRoot = admin.getUser(root.user);
if (!existingRoot || !rolesMatchExactly(existingRoot.roles, root.roles)) {
  throw new Error(
    'MongoDB root identity was not safely initialized; managed bootstrap made no changes'
  );
}

const existingByUser = new Map();
for (const identity of managed) {
  const existing = admin.getUser(identity.user);
  existingByUser.set(identity.user, existing);
  if (existing && !rolesMatchExactly(existing.roles, identity.roles)) {
    throw new Error(
      'Existing MongoDB identity roles do not match the bootstrap contract; '
      + 'bootstrap made no changes'
    );
  }
  if (existing) verifyConfiguredCredential(identity);
}

const missing = managed.filter((identity) => !existingByUser.get(identity.user));
const scopedMissing = scopeInput === 'backup-only'
  ? missing.filter((identity) => identity.user === process.env.MONGO_BACKUP_USER)
  : missing;
if (dryRun) {
  print(
    `MongoDB managed-identity bootstrap preflight complete (${scopedMissing.length} in-scope missing, `
    + `${managed.length - missing.length} existing credentials verified; no changes made).`
  );
} else {
  let created = 0;
  try {
    for (const identity of scopedMissing) {
      admin.createUser(identity);
      verifyConfiguredCredential(identity);
      created += 1;
    }
  } catch {
    throw new Error(
      'MongoDB identity bootstrap failed; initialization may be partial and must not proceed'
    );
  }

  for (const identity of managed) {
    const persisted = admin.getUser(identity.user);
    const mustExist = scopeInput === 'all'
      || identity.user === process.env.MONGO_BACKUP_USER
      || existingByUser.has(identity.user) && Boolean(existingByUser.get(identity.user));
    if (mustExist && (!persisted || !rolesMatchExactly(persisted.roles, identity.roles))) {
      throw new Error('MongoDB identity bootstrap verification failed');
    }
    if (persisted) verifyConfiguredCredential(identity);
  }

  print(
    `MongoDB managed-identity bootstrap complete (${created} in-scope created, `
    + `${managed.length - missing.length} existing credentials verified).`
  );
}
