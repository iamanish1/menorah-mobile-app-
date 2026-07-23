const {
  assertNoPersistedPrivacyPermissions,
  enforcePrivacyAdminPermissionAuthority,
  purgePersistedPrivacyPermissions,
} = require('../privacyAdminPermissionAuthority');

const ADMIN_A = '64f000000000000000000001';
const ADMIN_B = '64f000000000000000000002';
const allPermissions = [
  'privacy_reader',
  'privacy_reviewer',
  'privacy_legal_hold',
];

const makeUserModel = ({
  activeAdminIds = [ADMIN_A],
  modifiedCount = 0,
  remainingPersistedFields = 0,
} = {}) => {
  const lean = jest.fn().mockResolvedValue(
    activeAdminIds.map((_id) => ({ _id }))
  );
  const select = jest.fn(() => ({ lean }));
  return {
    collection: {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount }),
      countDocuments: jest.fn().mockResolvedValue(remainingPersistedFields),
    },
    find: jest.fn(() => ({ select })),
  };
};

const validEnv = (grants = [{
  adminId: ADMIN_A,
  permissions: allPermissions,
}]) => ({
  PRIVACY_ADMIN_PERMISSION_GRANTS_JSON: JSON.stringify(grants),
});

describe('privacy admin permission authority', () => {
  test('validates current active admins without mutating legacy fields at startup', async () => {
    const UserModel = makeUserModel({
      activeAdminIds: [ADMIN_A, ADMIN_B],
      modifiedCount: 4,
    });

    const result = await enforcePrivacyAdminPermissionAuthority({
      env: validEnv([
        {
          adminId: ADMIN_A,
          permissions: ['privacy_reader', 'privacy_reviewer'],
        },
        {
          adminId: ADMIN_B,
          permissions: ['privacy_legal_hold'],
        },
      ]),
      UserModel,
    });

    expect(result).toEqual({
      configuredAdminCount: 2,
    });
    expect(UserModel.collection.updateMany).not.toHaveBeenCalled();
    expect(UserModel.collection.countDocuments).toHaveBeenCalledWith(
      { privacyPermissions: { $exists: true } },
      { limit: 1 }
    );
    expect(UserModel.find).toHaveBeenCalledWith({
      _id: { $in: [ADMIN_A, ADMIN_B] },
      role: 'admin',
      isActive: true,
    });
  });

  test('rejects an invalid map before any database access', async () => {
    const UserModel = makeUserModel({ modifiedCount: 2 });

    await expect(enforcePrivacyAdminPermissionAuthority({
      env: { PRIVACY_ADMIN_PERMISSION_GRANTS_JSON: '[]' },
      UserModel,
    })).rejects.toMatchObject({
      code: 'PRIVACY_PERMISSION_CONFIGURATION_INVALID',
    });

    expect(UserModel.collection.updateMany).not.toHaveBeenCalled();
    expect(UserModel.collection.countDocuments).not.toHaveBeenCalled();
    expect(UserModel.find).not.toHaveBeenCalled();
  });

  test('fails startup when a configured target is not an active admin', async () => {
    const UserModel = makeUserModel({ activeAdminIds: [] });

    await expect(enforcePrivacyAdminPermissionAuthority({
      env: validEnv(),
      UserModel,
    })).rejects.toMatchObject({
      code: 'PRIVACY_PERMISSION_GRANT_TARGET_INVALID',
    });
  });

  test('refuses startup when a legacy persisted grant remains', async () => {
    const UserModel = makeUserModel({ remainingPersistedFields: 1 });

    await expect(assertNoPersistedPrivacyPermissions({
      UserModel,
    })).rejects.toMatchObject({
      code: 'PRIVACY_PERMISSION_STALE_STATE',
    });
    expect(UserModel.collection.updateMany).not.toHaveBeenCalled();
  });

  test('migration cleanup helper still fails if a persisted grant survives removal', async () => {
    const UserModel = makeUserModel({ remainingPersistedFields: 1 });

    await expect(purgePersistedPrivacyPermissions({ UserModel }))
      .rejects.toMatchObject({ code: 'PRIVACY_PERMISSION_STALE_STATE' });
    expect(UserModel.collection.updateMany).toHaveBeenCalledTimes(1);
  });
});
