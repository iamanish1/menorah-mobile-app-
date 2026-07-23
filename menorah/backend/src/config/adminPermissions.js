const ADMIN_ROLE_GRANTS_ENV = 'ADMIN_ROLE_GRANTS_JSON';

const ADMIN_OPERATIONAL_ROLES = Object.freeze([
  'support',
  'finance',
  'content',
  'admin',
]);

const ADMIN_PERMISSIONS = Object.freeze([
  'support_read',
  'support_manage',
  'finance_read',
  'finance_payout_request',
  'finance_payout_approve',
  'content_read',
  'content_manage',
  'clinical_read',
  'clinical_manage',
  'platform_read',
  'privacy_access',
]);

const ROLE_PERMISSIONS = Object.freeze({
  support: Object.freeze([
    'support_read',
    'support_manage',
  ]),
  finance: Object.freeze([
    'finance_read',
    'finance_payout_request',
    'finance_payout_approve',
  ]),
  content: Object.freeze([
    'content_read',
    'content_manage',
  ]),
  admin: ADMIN_PERMISSIONS,
});

const MAX_GRANTS_JSON_BYTES = 16 * 1024;
const MAX_GRANTS = 100;

const invalidConfiguration = ({ explicit = false } = {}) => Object.freeze({
  configured: false,
  explicit,
  grants: Object.freeze([]),
  invalidFields: Object.freeze([ADMIN_ROLE_GRANTS_ENV]),
});

const readAdminRoleConfiguration = (env = process.env) => {
  const raw = env?.[ADMIN_ROLE_GRANTS_ENV];
  if (
    typeof raw !== 'string'
    || !raw.trim()
    || Buffer.byteLength(raw, 'utf8') > MAX_GRANTS_JSON_BYTES
  ) {
    return invalidConfiguration();
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalidConfiguration({ explicit: true });
  }

  if (
    !Array.isArray(parsed)
    || parsed.length < 1
    || parsed.length > MAX_GRANTS
  ) {
    return invalidConfiguration({ explicit: true });
  }

  const seenAdminIds = new Set();
  const grants = [];
  for (const grant of parsed) {
    const keys = grant && typeof grant === 'object' && !Array.isArray(grant)
      ? Object.keys(grant).sort()
      : [];
    const adminId = String(grant?.adminId || '').trim().toLowerCase();
    const role = String(grant?.role || '').trim().toLowerCase();
    if (
      keys.join(',') !== 'adminId,role'
      || !/^[a-f0-9]{24}$/.test(adminId)
      || seenAdminIds.has(adminId)
      || !ADMIN_OPERATIONAL_ROLES.includes(role)
    ) {
      return invalidConfiguration({ explicit: true });
    }
    seenAdminIds.add(adminId);
    grants.push(Object.freeze({
      adminId,
      role,
      permissions: ROLE_PERMISSIONS[role],
    }));
  }

  // A full administrator is required as the bounded owner of clinical,
  // privacy, and platform functions. The narrower profiles never inherit
  // these capabilities.
  if (!grants.some(({ role }) => role === 'admin')) {
    return invalidConfiguration({ explicit: true });
  }

  return Object.freeze({
    configured: true,
    explicit: true,
    grants: Object.freeze(grants),
    invalidFields: Object.freeze([]),
  });
};

const resolveAdminRoleGrant = ({
  adminId,
  env = process.env,
} = {}) => {
  const configuration = readAdminRoleConfiguration(env);
  if (!configuration.configured) {
    return Object.freeze({
      configured: false,
      role: null,
      permissions: Object.freeze([]),
    });
  }

  const normalizedAdminId = String(adminId || '').trim().toLowerCase();
  const grant = configuration.grants.find(
    ({ adminId: grantedAdminId }) => grantedAdminId === normalizedAdminId
  );
  return Object.freeze({
    configured: true,
    role: grant?.role || null,
    permissions: grant?.permissions || Object.freeze([]),
  });
};

module.exports = {
  ADMIN_OPERATIONAL_ROLES,
  ADMIN_PERMISSIONS,
  ADMIN_ROLE_GRANTS_ENV,
  MAX_GRANTS,
  ROLE_PERMISSIONS,
  readAdminRoleConfiguration,
  resolveAdminRoleGrant,
};
