const {
  enforceAdminPermissionAuthority,
  validateConfiguredAdminTargets,
} = require('../adminPermissionAuthority');
const {
  SERVER_STAGING_ADMIN_ROLE_GRANTS,
} = require('../../config/serverStagingSyntheticAuthority');

const ADMIN_ID = '64f000000000000000000121';
const SUPPORT_ID = '64f000000000000000000122';

const validEnv = {
  ADMIN_ROLE_GRANTS_JSON: JSON.stringify([
    { adminId: ADMIN_ID, role: 'admin' },
    { adminId: SUPPORT_ID, role: 'support' },
  ]),
};

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
  ADMIN_ROLE_GRANTS_JSON: JSON.stringify(
    SERVER_STAGING_ADMIN_ROLE_GRANTS.map(({ adminId, role }) => ({
      adminId,
      role,
    }))
  ),
};

const makeUserModel = (rows, existingUser = null) => ({
  find: jest.fn(() => ({
    select: jest.fn(() => ({
      lean: jest.fn(async () => rows),
    })),
  })),
  exists: jest.fn(async () => existingUser),
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

  test('allows an entirely empty roster only in exact synthetic server staging', async () => {
    const UserModel = makeUserModel([]);

    await expect(enforceAdminPermissionAuthority({
      env: {
        ...exactServerStagingEnv,
      },
      UserModel,
    })).resolves.toEqual({
      configuredAdminCount: 5,
      configuredRoles: ['admin', 'content', 'finance', 'support'],
    });
    expect(UserModel.exists).toHaveBeenCalledWith({});
  });

  test('rejects an incomplete synthetic roster in exact server staging', async () => {
    const UserModel = makeUserModel(
      [{ _id: SERVER_STAGING_ADMIN_ROLE_GRANTS[0].adminId }],
      { _id: SERVER_STAGING_ADMIN_ROLE_GRANTS[0].adminId }
    );

    await expect(enforceAdminPermissionAuthority({
      env: {
        ...exactServerStagingEnv,
      },
      UserModel,
    })).rejects.toMatchObject({
      code: 'ADMIN_ROLE_GRANT_TARGET_INVALID',
    });
    expect(UserModel.exists).not.toHaveBeenCalled();
  });

  test('rejects an unrelated account in the pre-seed database', async () => {
    const UserModel = makeUserModel([], {
      _id: '64f000000000000000000199',
    });

    await expect(enforceAdminPermissionAuthority({
      env: {
        ...exactServerStagingEnv,
      },
      UserModel,
    })).rejects.toMatchObject({
      code: 'ADMIN_ROLE_GRANT_TARGET_INVALID',
    });
  });

  test('rejects empty targets when a server-staging selector is crossed', async () => {
    const UserModel = makeUserModel([]);

    await expect(enforceAdminPermissionAuthority({
      env: {
        ...exactServerStagingEnv,
        MENORAH_SERVER_STAGING_PROJECT_NAME: 'menorah',
      },
      UserModel,
    })).rejects.toMatchObject({
      code: 'ADMIN_ROLE_GRANT_TARGET_INVALID',
    });
    expect(UserModel.exists).not.toHaveBeenCalled();
  });

  test('rejects a valid but non-synthetic grant roster during pre-seed', async () => {
    const UserModel = makeUserModel([]);

    await expect(enforceAdminPermissionAuthority({
      env: {
        ...exactServerStagingEnv,
        ...validEnv,
      },
      UserModel,
    })).rejects.toMatchObject({
      code: 'ADMIN_ROLE_GRANT_TARGET_INVALID',
    });
    expect(UserModel.exists).not.toHaveBeenCalled();
  });

  test('uses normal target validation after the exact roster exists', async () => {
    const UserModel = makeUserModel(
      SERVER_STAGING_ADMIN_ROLE_GRANTS.map(({ adminId }) => ({
        _id: adminId,
      }))
    );

    await expect(enforceAdminPermissionAuthority({
      env: exactServerStagingEnv,
      UserModel,
    })).resolves.toEqual({
      configuredAdminCount: 5,
      configuredRoles: ['admin', 'content', 'finance', 'support'],
    });
    expect(UserModel.exists).not.toHaveBeenCalled();
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
