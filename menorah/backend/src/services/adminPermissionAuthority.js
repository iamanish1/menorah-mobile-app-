const User = require('../models/User');
const {
  readAdminRoleConfiguration,
} = require('../config/adminPermissions');
const {
  isExactServerStagingSyntheticRuntime,
} = require('../config/deploymentEnvironment');
const {
  hasExactServerStagingAdminRoleGrants,
} = require('../config/serverStagingSyntheticAuthority');

const makeAuthorityError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const validateConfiguredAdminTargets = async ({
  grants,
  UserModel = User,
  allowEmptySyntheticRoster = false,
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
    // A fresh synthetic server-staging database must become healthy before
    // its explicit, confirmation-gated seed job runs. Only a wholly empty
    // user collection may defer target validation; any partial or unexpected
    // roster remains a startup failure, and production never enables this.
    if (
      allowEmptySyntheticRoster
      && found.size === 0
      && !(await UserModel.exists({}))
    ) {
      return;
    }
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
    allowEmptySyntheticRoster:
      isExactServerStagingSyntheticRuntime(env)
      && hasExactServerStagingAdminRoleGrants(configuration.grants),
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
