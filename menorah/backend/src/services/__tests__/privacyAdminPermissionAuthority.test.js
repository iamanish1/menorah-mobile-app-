const {
  assertNoPersistedPrivacyPermissions,
  enforcePrivacyAdminPermissionAuthority,
  purgePersistedPrivacyPermissions,
} = require('../privacyAdminPermissionAuthority');
const {
  SERVER_STAGING_PRIVACY_ADMIN_PERMISSION_GRANTS,
} = require('../../config/serverStagingSyntheticAuthority');

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

const exactServerStagingEnv = {
  NODE_ENV: 'production',
  DEPLOYMENT_ENVIRONMENT: 'staging',
  SERVICE_RUNTIME: 'server-staging',
  MENORAH_SYNTHETIC_DATA_ONLY: 'true',
  MENORAH_SERVER_STAGING_ENVIRONMENT_ID: 'menorah-server-staging-v1',
  MENORAH_SERVER_STAGING_PROJECT_NAME:
    'menorah-server-staging-validation',
  MENORAH_SERVER_STAGING_HTTPS_PORT: '38443',
  MONGODB_URI:
    'mongodb://menorah-staging-app:synthetic@staging-mongo-primary:27017/'
    + 'menorah_staging?replicaSet=menorah-staging-rs'
    + '&authSource=admin&retryWrites=true',
  MONGODB_REPLICA_SET_NAME: 'menorah-staging-rs',
  MONGODB_READ_PREFERENCE: 'primaryPreferred',
  MONGODB_RETRY_WRITES: 'true',
  PRIVACY_ADMIN_PERMISSION_GRANTS_JSON: JSON.stringify(
    SERVER_STAGING_PRIVACY_ADMIN_PERMISSION_GRANTS
  ),
};

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

  test('allows an entirely empty roster only in exact synthetic server staging', async () => {
    const UserModel = makeUserModel({ activeAdminIds: [] });
    UserModel.exists = jest.fn().mockResolvedValue(null);

    await expect(enforcePrivacyAdminPermissionAuthority({
      env: {
        ...exactServerStagingEnv,
      },
      UserModel,
    })).resolves.toEqual({
      configuredAdminCount: 1,
    });
    expect(UserModel.exists).toHaveBeenCalledWith({});
  });

  test('rejects unrelated users in an exact staging pre-seed database', async () => {
    const UserModel = makeUserModel({ activeAdminIds: [] });
    UserModel.exists = jest.fn().mockResolvedValue({
      _id: '64f000000000000000000199',
    });

    await expect(enforcePrivacyAdminPermissionAuthority({
      env: {
        ...exactServerStagingEnv,
      },
      UserModel,
    })).rejects.toMatchObject({
      code: 'PRIVACY_PERMISSION_GRANT_TARGET_INVALID',
    });
  });

  test('rejects a valid but non-synthetic privacy grant during pre-seed', async () => {
    const UserModel = makeUserModel({ activeAdminIds: [] });
    UserModel.exists = jest.fn().mockResolvedValue(null);

    await expect(enforcePrivacyAdminPermissionAuthority({
      env: {
        ...exactServerStagingEnv,
        ...validEnv(),
      },
      UserModel,
    })).rejects.toMatchObject({
      code: 'PRIVACY_PERMISSION_GRANT_TARGET_INVALID',
    });
    expect(UserModel.exists).not.toHaveBeenCalled();
  });

  test('uses normal target validation after the exact privacy admin exists', async () => {
    const [{ adminId }] =
      SERVER_STAGING_PRIVACY_ADMIN_PERMISSION_GRANTS;
    const UserModel = makeUserModel({ activeAdminIds: [adminId] });
    UserModel.exists = jest.fn().mockResolvedValue(null);

    await expect(enforcePrivacyAdminPermissionAuthority({
      env: exactServerStagingEnv,
      UserModel,
    })).resolves.toEqual({
      configuredAdminCount: 1,
    });
    expect(UserModel.exists).not.toHaveBeenCalled();
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
