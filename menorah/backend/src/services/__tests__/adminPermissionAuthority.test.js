const {
  enforceAdminPermissionAuthority,
  validateConfiguredAdminTargets,
} = require('../adminPermissionAuthority');

const ADMIN_ID = '64f000000000000000000121';
const SUPPORT_ID = '64f000000000000000000122';

const validEnv = {
  ADMIN_ROLE_GRANTS_JSON: JSON.stringify([
    { adminId: ADMIN_ID, role: 'admin' },
    { adminId: SUPPORT_ID, role: 'support' },
  ]),
};

const makeUserModel = (rows) => ({
  find: jest.fn(() => ({
    select: jest.fn(() => ({
      lean: jest.fn(async () => rows),
    })),
  })),
});

describe('admin permission startup authority', () => {
  test('accepts only configured targets that are active database administrators', async () => {
    const UserModel = makeUserModel([
      { _id: ADMIN_ID },
      { _id: SUPPORT_ID },
    ]);

    await expect(enforceAdminPermissionAuthority({
      env: validEnv,
      UserModel,
    })).resolves.toEqual({
      configuredAdminCount: 2,
      configuredRoles: ['admin', 'support'],
    });
    expect(UserModel.find).toHaveBeenCalledWith({
      _id: { $in: [ADMIN_ID, SUPPORT_ID] },
      role: 'admin',
      isActive: true,
    });
  });

  test('rejects invalid configuration before querying the database', async () => {
    const UserModel = makeUserModel([]);
    await expect(enforceAdminPermissionAuthority({
      env: { ADMIN_ROLE_GRANTS_JSON: '[]' },
      UserModel,
    })).rejects.toMatchObject({
      code: 'ADMIN_ROLE_CONFIGURATION_INVALID',
    });
    expect(UserModel.find).not.toHaveBeenCalled();
  });

  test('rejects missing, inactive, or non-admin grant targets', async () => {
    const UserModel = makeUserModel([{ _id: ADMIN_ID }]);
    await expect(enforceAdminPermissionAuthority({
      env: validEnv,
      UserModel,
    })).rejects.toMatchObject({
      code: 'ADMIN_ROLE_GRANT_TARGET_INVALID',
    });
  });

  test('rejects duplicate database rows instead of accepting ambiguous targets', async () => {
    const UserModel = makeUserModel([
      { _id: ADMIN_ID },
      { _id: ADMIN_ID },
    ]);
    await expect(validateConfiguredAdminTargets({
      grants: [
        { adminId: ADMIN_ID },
        { adminId: SUPPORT_ID },
      ],
      UserModel,
    })).rejects.toMatchObject({
      code: 'ADMIN_ROLE_GRANT_TARGET_INVALID',
    });
  });
});
