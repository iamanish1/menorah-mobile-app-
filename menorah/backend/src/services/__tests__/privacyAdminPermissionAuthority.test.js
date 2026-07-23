const {
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
  test('purges every legacy persisted grant and validates current active admins', async () => {
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
      removedPersistedFields: 4,
    });
    expect(UserModel.collection.updateMany).toHaveBeenCalledWith(
      { privacyPermissions: { $exists: true } },
      { $unset: { privacyPermissions: '' } }
    );
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

  test('purges legacy state before failing closed on an invalid map', async () => {
    const UserModel = makeUserModel({ modifiedCount: 2 });

    await expect(enforcePrivacyAdminPermissionAuthority({
      env: { PRIVACY_ADMIN_PERMISSION_GRANTS_JSON: '[]' },
      UserModel,
    })).rejects.toMatchObject({
      code: 'PRIVACY_PERMISSION_CONFIGURATION_INVALID',
    });

    expect(UserModel.collection.updateMany).toHaveBeenCalledTimes(1);
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

  test('refuses startup when a legacy persisted grant survives cleanup', async () => {
    const UserModel = makeUserModel({ remainingPersistedFields: 1 });

    await expect(purgePersistedPrivacyPermissions({
      UserModel,
    })).rejects.toMatchObject({
      code: 'PRIVACY_PERMISSION_STALE_STATE',
    });
  });
});
