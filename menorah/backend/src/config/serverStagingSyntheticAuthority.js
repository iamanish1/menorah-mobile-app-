const SERVER_STAGING_ADMIN_USER_IDS = Object.freeze({
  'ADMIN-SUPPORT': '7a110ca15a6e000000000101',
  'ADMIN-FINANCE': '7a110ca15a6e000000000102',
  'ADMIN-CONTENT': '7a110ca15a6e000000000103',
  'ADMIN-FULL-1': '7a110ca15a6e000000000104',
  'ADMIN-FULL-2': '7a110ca15a6e000000000105',
});

const SERVER_STAGING_ADMIN_ROLE_GRANTS = Object.freeze([
  Object.freeze({
    alias: 'ADMIN-SUPPORT',
    adminId: SERVER_STAGING_ADMIN_USER_IDS['ADMIN-SUPPORT'],
    role: 'support',
  }),
  Object.freeze({
    alias: 'ADMIN-FINANCE',
    adminId: SERVER_STAGING_ADMIN_USER_IDS['ADMIN-FINANCE'],
    role: 'finance',
  }),
  Object.freeze({
    alias: 'ADMIN-CONTENT',
    adminId: SERVER_STAGING_ADMIN_USER_IDS['ADMIN-CONTENT'],
    role: 'content',
  }),
  Object.freeze({
    alias: 'ADMIN-FULL-1',
    adminId: SERVER_STAGING_ADMIN_USER_IDS['ADMIN-FULL-1'],
    role: 'admin',
  }),
  Object.freeze({
    alias: 'ADMIN-FULL-2',
    adminId: SERVER_STAGING_ADMIN_USER_IDS['ADMIN-FULL-2'],
    role: 'admin',
  }),
]);

const SERVER_STAGING_PRIVACY_ADMIN_PERMISSION_GRANTS = Object.freeze([
  Object.freeze({
    adminId: SERVER_STAGING_ADMIN_USER_IDS['ADMIN-FULL-1'],
    permissions: Object.freeze([
      'privacy_reader',
      'privacy_reviewer',
      'privacy_legal_hold',
    ]),
  }),
]);

const hasExactServerStagingAdminRoleGrants = (grants) => {
  if (
    !Array.isArray(grants)
    || grants.length !== SERVER_STAGING_ADMIN_ROLE_GRANTS.length
  ) {
    return false;
  }
  const actual = new Map(
    grants.map(({ adminId, role }) => [adminId, role])
  );
  return (
    actual.size === SERVER_STAGING_ADMIN_ROLE_GRANTS.length
    && SERVER_STAGING_ADMIN_ROLE_GRANTS.every(
      ({ adminId, role }) => actual.get(adminId) === role
    )
  );
};

const hasExactServerStagingPrivacyAdminPermissionGrants = (grants) => {
  if (
    !Array.isArray(grants)
    || grants.length
      !== SERVER_STAGING_PRIVACY_ADMIN_PERMISSION_GRANTS.length
  ) {
    return false;
  }
  const [actual] = grants;
  const [expected] = SERVER_STAGING_PRIVACY_ADMIN_PERMISSION_GRANTS;
  return (
    actual?.adminId === expected.adminId
    && Array.isArray(actual.permissions)
    && actual.permissions.length === expected.permissions.length
    && new Set(actual.permissions).size === expected.permissions.length
    && expected.permissions.every(
      (permission) => actual.permissions.includes(permission)
    )
  );
};

module.exports = {
  SERVER_STAGING_ADMIN_ROLE_GRANTS,
  SERVER_STAGING_ADMIN_USER_IDS,
  SERVER_STAGING_PRIVACY_ADMIN_PERMISSION_GRANTS,
  hasExactServerStagingAdminRoleGrants,
  hasExactServerStagingPrivacyAdminPermissionGrants,
};
