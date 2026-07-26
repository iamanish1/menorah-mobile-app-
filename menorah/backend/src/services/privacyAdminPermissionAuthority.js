const User = require('../models/User');
const {
  readPrivacyAdminPermissionConfiguration,
} = require('../config/privacyAdminPermissions');
const {
  isExactServerStagingSyntheticRuntime,
} = require('../config/deploymentEnvironment');
const {
  hasExactServerStagingPrivacyAdminPermissionGrants,
} = require('../config/serverStagingSyntheticAuthority');

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

const assertNoPersistedPrivacyPermissions = async ({
  UserModel = User,
} = {}) => {
  const remaining = await UserModel.collection.countDocuments(
    { privacyPermissions: { $exists: true } },
    { limit: 1 }
  );
  if (remaining !== 0) {
    throw makeAuthorityError(
      'PRIVACY_PERMISSION_STALE_STATE',
      'Legacy persisted privacy permissions remain; run the approved migration before startup.'
    );
  }
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
  const found = new Set(activeAdmins.map(({ _id }) => String(_id)));
  if (
    found.size !== adminIds.length
    || adminIds.some((adminId) => !found.has(adminId))
  ) {
    // Match the operational-authority bootstrap boundary: an exact synthetic
    // server-staging runtime may precede its explicit seed only while the
    // entire user collection is empty. Partial state and production fail.
    if (
      allowEmptySyntheticRoster
      && found.size === 0
      && !(await UserModel.exists({}))
    ) {
      return;
    }
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
  const configuration = readPrivacyAdminPermissionConfiguration(env);
  if (!configuration.configured) {
    throw makeAuthorityError(
      'PRIVACY_PERMISSION_CONFIGURATION_INVALID',
      'Privacy administrator permission configuration is invalid.'
    );
  }
  // Startup is read-only. The reviewed database migration owns removal of
  // legacy persisted grants; if it was skipped or stale state reappears, fail
  // closed instead of performing an implicit data mutation here.
  await assertNoPersistedPrivacyPermissions({ UserModel });
  await validateConfiguredAdminTargets({
    grants: configuration.grants,
    UserModel,
    allowEmptySyntheticRoster:
      isExactServerStagingSyntheticRuntime(env)
      && hasExactServerStagingPrivacyAdminPermissionGrants(
        configuration.grants
      ),
  });
  return Object.freeze({
    configuredAdminCount: configuration.grants.length,
  });
};

module.exports = {
  assertNoPersistedPrivacyPermissions,
  enforcePrivacyAdminPermissionAuthority,
  purgePersistedPrivacyPermissions,
  validateConfiguredAdminTargets,
};
