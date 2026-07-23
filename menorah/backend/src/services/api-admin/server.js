const { startService } = require('../../shared/app/startService');
const {
  enforceAdminPermissionAuthority,
} = require('../adminPermissionAuthority');
const {
  enforcePrivacyAdminPermissionAuthority,
} = require('../privacyAdminPermissionAuthority');

const enforceAdminAuthorities = async (context) => {
  await enforceAdminPermissionAuthority(context);
  await enforcePrivacyAdminPermissionAuthority(context);
};

const start = () =>
  startService({
    serviceName: 'api-admin',
    routeProfile: 'api-admin',
    defaultPort: 4004,
    enableSocketsDefault: false,
    afterDatabaseConnect: enforceAdminAuthorities
  });

if (require.main === module) {
  start().catch((err) => {
    console.error('FATAL: Failed to start api-admin:', err);
    process.exit(1);
  });
}

module.exports = { start };
