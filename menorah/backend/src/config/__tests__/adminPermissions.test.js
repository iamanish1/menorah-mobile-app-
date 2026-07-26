const {
  ADMIN_PERMISSIONS,
  ROLE_PERMISSIONS,
  readAdminRoleConfiguration,
  resolveAdminRoleGrant,
} = require('../adminPermissions');

const ADMIN_ID = '64f000000000000000000101';
const SUPPORT_ID = '64f000000000000000000102';
const FINANCE_ID = '64f000000000000000000103';
const CONTENT_ID = '64f000000000000000000104';

const validGrants = () => [
  { adminId: ADMIN_ID, role: 'admin' },
  { adminId: SUPPORT_ID, role: 'support' },
  { adminId: FINANCE_ID, role: 'finance' },
  { adminId: CONTENT_ID, role: 'content' },
];

describe('admin operational role configuration', () => {
  test('assigns bounded permissions without cross-function inheritance', () => {
    const env = {
      ADMIN_ROLE_GRANTS_JSON: JSON.stringify(validGrants()),
    };
    const configuration = readAdminRoleConfiguration(env);

    expect(configuration.configured).toBe(true);
    expect(resolveAdminRoleGrant({ adminId: SUPPORT_ID, env })).toEqual({
      configured: true,
      role: 'support',
      permissions: ROLE_PERMISSIONS.support,
    });
    expect(ROLE_PERMISSIONS.support).not.toContain('finance_read');
    expect(ROLE_PERMISSIONS.support).not.toContain('clinical_read');
    expect(ROLE_PERMISSIONS.finance).not.toContain('clinical_read');
    expect(ROLE_PERMISSIONS.content).toEqual(['content_read', 'content_manage']);
    expect(ROLE_PERMISSIONS.admin).toEqual(ADMIN_PERMISSIONS);
  });

  test.each([
    ['missing value', {}],
    ['malformed JSON', { ADMIN_ROLE_GRANTS_JSON: '{' }],
    ['empty grants', { ADMIN_ROLE_GRANTS_JSON: '[]' }],
    ['no full administrator', {
      ADMIN_ROLE_GRANTS_JSON: JSON.stringify([
        { adminId: SUPPORT_ID, role: 'support' },
      ]),
    }],
    ['duplicate administrator', {
      ADMIN_ROLE_GRANTS_JSON: JSON.stringify([
        { adminId: ADMIN_ID, role: 'admin' },
        { adminId: ADMIN_ID.toUpperCase(), role: 'support' },
      ]),
    }],
    ['unknown role', {
      ADMIN_ROLE_GRANTS_JSON: JSON.stringify([
        { adminId: ADMIN_ID, role: 'root' },
      ]),
    }],
    ['unexpected fields', {
      ADMIN_ROLE_GRANTS_JSON: JSON.stringify([
        { adminId: ADMIN_ID, role: 'admin', permissions: ['clinical_read'] },
      ]),
    }],
  ])('fails closed for %s', (_label, env) => {
    const configuration = readAdminRoleConfiguration(env);
    expect(configuration.configured).toBe(false);
    expect(configuration.grants).toEqual([]);
    expect(configuration.invalidFields).toContain('ADMIN_ROLE_GRANTS_JSON');
  });

  test('returns no role for a valid but unassigned administrator', () => {
    const env = {
      ADMIN_ROLE_GRANTS_JSON: JSON.stringify([
        { adminId: ADMIN_ID, role: 'admin' },
      ]),
    };

    expect(resolveAdminRoleGrant({ adminId: SUPPORT_ID, env })).toEqual({
      configured: true,
      role: null,
      permissions: [],
    });
  });
});
