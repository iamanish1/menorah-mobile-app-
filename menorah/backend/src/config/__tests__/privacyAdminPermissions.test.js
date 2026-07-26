const {
  PRIVACY_PERMISSIONS,
  readPrivacyAdminPermissionConfiguration,
  resolvePrivacyAdminGrant,
} = require('../privacyAdminPermissions');

describe('privacy admin permission configuration', () => {
  test('requires explicit ID-scoped coverage for every privacy function', () => {
    const config = readPrivacyAdminPermissionConfiguration({
      PRIVACY_ADMIN_PERMISSION_GRANTS_JSON: JSON.stringify([{
        adminId: '64f000000000000000000001',
        permissions: PRIVACY_PERMISSIONS,
      }]),
    });

    expect(config.configured).toBe(true);
    expect(config.grants).toEqual([{
      adminId: '64f000000000000000000001',
      permissions: [...PRIVACY_PERMISSIONS].sort(),
    }]);
  });

  test.each([
    undefined,
    '[]',
    '[{"adminId":"64f000000000000000000001","permissions":["privacy_reader"]}]',
    '[{"adminId":"not-an-id","permissions":["privacy_reader","privacy_reviewer","privacy_legal_hold"]}]',
    '[{"adminId":"64f000000000000000000001","permissions":["unknown"]}]',
  ])('fails closed for incomplete or malformed grants %p', (raw) => {
    const config = readPrivacyAdminPermissionConfiguration({
      ...(raw === undefined
        ? {}
        : { PRIVACY_ADMIN_PERMISSION_GRANTS_JSON: raw }),
    });
    expect(config.configured).toBe(false);
    expect(config.grants).toEqual([]);
    expect(config.invalidFields)
      .toContain('PRIVACY_ADMIN_PERMISSION_GRANTS_JSON');
  });

  test('resolves the current map on every authorization decision', () => {
    const adminA = '64f000000000000000000001';
    const adminB = '64f000000000000000000002';
    const env = {
      PRIVACY_ADMIN_PERMISSION_GRANTS_JSON: JSON.stringify([{
        adminId: adminA,
        permissions: PRIVACY_PERMISSIONS,
      }]),
    };

    expect(resolvePrivacyAdminGrant({ adminId: adminA, env })).toMatchObject({
      configured: true,
      permissions: expect.arrayContaining(PRIVACY_PERMISSIONS),
    });
    expect(resolvePrivacyAdminGrant({ adminId: adminB, env }).permissions)
      .toEqual([]);

    env.PRIVACY_ADMIN_PERMISSION_GRANTS_JSON = JSON.stringify([{
      adminId: adminB,
      permissions: PRIVACY_PERMISSIONS,
    }]);

    expect(resolvePrivacyAdminGrant({ adminId: adminA, env }).permissions)
      .toEqual([]);
    expect(resolvePrivacyAdminGrant({ adminId: adminB, env })).toMatchObject({
      configured: true,
      permissions: expect.arrayContaining(PRIVACY_PERMISSIONS),
    });
  });
});
