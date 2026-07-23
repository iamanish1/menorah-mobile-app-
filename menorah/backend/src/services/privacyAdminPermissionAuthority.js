const User = require('../models/User');
const {
  readPrivacyAdminPermissionConfiguration,
} = require('../config/privacyAdminPermissions');

const makeAuthorityError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const purgePersistedPrivacyPermissions = async ({
  UserModel = User,
} = {}) => {
  const result = await UserModel.collection.updateMany(
    { privacyPermissions: { $exists: true } },
    { $unset: { privacyPermissions: '' } }
  );
  const remaining = await UserModel.collection.countDocuments(
    { privacyPermissions: { $exists: true } },
    { limit: 1 }
  );
  if (remaining !== 0) {
    throw makeAuthorityError(
      'PRIVACY_PERMISSION_STALE_STATE',
      'Persisted privacy permission state could not be removed.'
    );
  }
  return Number(result?.modifiedCount || 0);
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
  const found = new Set(activeAdmins.map(({ _id }) => String(_id)));
  if (
    found.size !== adminIds.length
    || adminIds.some((adminId) => !found.has(adminId))
  ) {
    throw makeAuthorityError(
      'PRIVACY_PERMISSION_GRANT_TARGET_INVALID',
      'Privacy permission grants reference a missing, inactive, or non-admin account.'
    );
  }
};

const enforcePrivacyAdminPermissionAuthority = async ({
  env = process.env,
  UserModel = User,
} = {}) => {
  // Persisted grants are legacy state and are never consulted for access.
  // Remove them before validating the current map so a failed startup remains
  // fail-closed even if an older application revision read this field.
  const removedPersistedFields = await purgePersistedPrivacyPermissions({
    UserModel,
  });
  const configuration = readPrivacyAdminPermissionConfiguration(env);
  if (!configuration.configured) {
    throw makeAuthorityError(
      'PRIVACY_PERMISSION_CONFIGURATION_INVALID',
      'Privacy administrator permission configuration is invalid.'
    );
  }
  await validateConfiguredAdminTargets({
    grants: configuration.grants,
    UserModel,
  });
  return Object.freeze({
    configuredAdminCount: configuration.grants.length,
    removedPersistedFields,
  });
};

module.exports = {
  enforcePrivacyAdminPermissionAuthority,
  purgePersistedPrivacyPermissions,
  validateConfiguredAdminTargets,
};
