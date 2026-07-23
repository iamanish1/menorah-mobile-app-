const User = require('../models/User');
const {
  readAdminRoleConfiguration,
} = require('../config/adminPermissions');

const makeAuthorityError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const validateConfiguredAdminTargets = async ({
  grants,
  UserModel = User,
}) => {
  const adminIds = grants.map(({ adminId }) => adminId);
  const activeAdmins = await UserModel.find({
    _id: { $in: adminIds },
    role: 'admin',
    isActive: true,
  }).select('_id').lean();
  const found = new Set(activeAdmins.map(({ _id }) => String(_id).toLowerCase()));
  if (
    found.size !== adminIds.length
    || adminIds.some((adminId) => !found.has(adminId))
  ) {
    throw makeAuthorityError(
      'ADMIN_ROLE_GRANT_TARGET_INVALID',
      'Admin role grants reference a missing, inactive, or non-admin account.'
    );
  }
};

const enforceAdminPermissionAuthority = async ({
  env = process.env,
  UserModel = User,
} = {}) => {
  const configuration = readAdminRoleConfiguration(env);
  if (!configuration.configured) {
    throw makeAuthorityError(
      'ADMIN_ROLE_CONFIGURATION_INVALID',
      'Administrator operational-role configuration is invalid.'
    );
  }
  await validateConfiguredAdminTargets({
    grants: configuration.grants,
    UserModel,
  });
  return Object.freeze({
    configuredAdminCount: configuration.grants.length,
    configuredRoles: Object.freeze(
      [...new Set(configuration.grants.map(({ role }) => role))].sort()
    ),
  });
};

module.exports = {
  enforceAdminPermissionAuthority,
  validateConfiguredAdminTargets,
};
