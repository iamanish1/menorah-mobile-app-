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
const ROTATION_CONFIRMATION = 'rotate-managed-credentials';

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
const rotationInput = process.env.MONGO_ROTATE_CREDENTIALS_CONFIRM || '';
const dryRunInput = process.env.MONGO_RECONCILE_DRY_RUN || '';
if (rotationInput && rotationInput !== ROTATION_CONFIRMATION) {
  throw new Error('MONGO_ROTATE_CREDENTIALS_CONFIRM has an invalid value');
}
if (dryRunInput && dryRunInput !== 'true') {
  throw new Error('MONGO_RECONCILE_DRY_RUN has an invalid value');
}
const rotateCredentials = rotationInput === ROTATION_CONFIRMATION;
const dryRun = dryRunInput === 'true';
if (dryRun && rotateCredentials) {
  throw new Error('MongoDB reconciliation dry-run cannot rotate credentials');
}
const root = {
  user: process.env.MONGO_ROOT_USER,
  roles: [{ role: 'root', db: 'admin' }],
};
const managed = Object.freeze([
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
  {
    // Rotate the active API identity last so an earlier reconciliation failure
    // cannot strand the still-running release with the old application secret.
    user: process.env.MONGO_APP_USER,
    pwd: process.env.MONGO_APP_PASSWORD,
    roles: [{ role: 'readWrite', db: 'menorah' }],
  },
]);

const existingRoot = admin.getUser(root.user);
const existingManaged = managed.map((identity) => admin.getUser(identity.user));
if (!existingRoot || !rolesMatchExactly(existingRoot.roles, root.roles)) {
  throw new Error('MongoDB root identity is missing or has unexpected roles; reconciliation made no changes');
}
if (existingManaged.some((identity) => !identity)) {
  throw new Error('Managed MongoDB identity set is incomplete; reconciliation made no changes');
}

if (dryRun) {
  print(
    `Verified ${managed.length} managed MongoDB identities exist for maintenance reconciliation `
    + 'without changes.'
  );
} else {
  try {
    for (const identity of managed) {
      const update = { roles: identity.roles };
      if (rotateCredentials) update.pwd = identity.pwd;
      admin.updateUser(identity.user, update);
    }
  } catch {
    if (rotateCredentials) {
      throw new Error(
        'Managed MongoDB identity reconciliation failed; credentials may be partially rotated '
        + 'and deployment must not proceed'
      );
    }
    throw new Error(
      'Managed MongoDB identity reconciliation failed; roles may be partially reconciled '
      + 'and deployment must not proceed'
    );
  }

  for (const identity of managed) {
    const persisted = admin.getUser(identity.user);
    if (!persisted || !rolesMatchExactly(persisted.roles, identity.roles)) {
      throw new Error('Managed MongoDB identity role verification failed');
    }
  }

  print(
    `Reconciled ${managed.length} managed MongoDB identities with exact roles `
    + `(${rotateCredentials ? 'password rotation confirmed' : 'passwords unchanged'}).`
  );
}
