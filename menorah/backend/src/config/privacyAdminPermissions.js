const PRIVACY_ADMIN_PERMISSION_GRANTS_ENV =
  'PRIVACY_ADMIN_PERMISSION_GRANTS_JSON';

const PRIVACY_PERMISSIONS = Object.freeze([
  'privacy_reader',
  'privacy_reviewer',
  'privacy_legal_hold',
]);

const MAX_GRANTS_JSON_BYTES = 16 * 1024;
const MAX_GRANTS = 100;

const readPrivacyAdminPermissionConfiguration = (env = process.env) => {
  const raw = env?.[PRIVACY_ADMIN_PERMISSION_GRANTS_ENV];
  if (
    typeof raw !== 'string'
    || !raw.trim()
    || Buffer.byteLength(raw, 'utf8') > MAX_GRANTS_JSON_BYTES
  ) {
    return Object.freeze({
      configured: false,
      explicit: false,
      grants: Object.freeze([]),
      invalidFields: Object.freeze([PRIVACY_ADMIN_PERMISSION_GRANTS_ENV]),
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const validArray = (
    Array.isArray(parsed)
    && parsed.length >= 1
    && parsed.length <= MAX_GRANTS
  );
  const seenAdminIds = new Set();
  const grants = [];
  if (validArray) {
    for (const grant of parsed) {
      const keys = grant && typeof grant === 'object' && !Array.isArray(grant)
        ? Object.keys(grant).sort()
        : [];
      const adminId = String(grant?.adminId || '').trim();
      const permissions = Array.isArray(grant?.permissions)
        ? [...new Set(grant.permissions)]
        : [];
      if (
        keys.join(',') !== 'adminId,permissions'
        || !/^[a-f0-9]{24}$/i.test(adminId)
        || seenAdminIds.has(adminId.toLowerCase())
        || permissions.length < 1
        || permissions.some((permission) => !PRIVACY_PERMISSIONS.includes(permission))
      ) {
        grants.length = 0;
        break;
      }
      seenAdminIds.add(adminId.toLowerCase());
      grants.push(Object.freeze({
        adminId: adminId.toLowerCase(),
        permissions: Object.freeze([...permissions].sort()),
      }));
    }
  }

  const coveredPermissions = new Set(
    grants.flatMap(({ permissions }) => permissions)
  );
  const configured = (
    validArray
    && grants.length === parsed.length
    && PRIVACY_PERMISSIONS.every((permission) => coveredPermissions.has(permission))
  );
  return Object.freeze({
    configured,
    explicit: true,
    grants: Object.freeze(configured ? grants : []),
    invalidFields: Object.freeze(
      configured ? [] : [PRIVACY_ADMIN_PERMISSION_GRANTS_ENV]
    ),
  });
};

const resolvePrivacyAdminGrant = ({
  adminId,
  env = process.env,
} = {}) => {
  const configuration = readPrivacyAdminPermissionConfiguration(env);
  if (!configuration.configured) {
    return Object.freeze({
      configured: false,
      permissions: Object.freeze([]),
    });
  }
  const normalizedAdminId = String(adminId || '').trim().toLowerCase();
  const grant = configuration.grants.find(
    ({ adminId: grantedAdminId }) => grantedAdminId === normalizedAdminId
  );
  return Object.freeze({
    configured: true,
    permissions: grant?.permissions || Object.freeze([]),
  });
};

module.exports = {
  MAX_GRANTS,
  PRIVACY_ADMIN_PERMISSION_GRANTS_ENV,
  PRIVACY_PERMISSIONS,
  readPrivacyAdminPermissionConfiguration,
  resolvePrivacyAdminGrant,
};
