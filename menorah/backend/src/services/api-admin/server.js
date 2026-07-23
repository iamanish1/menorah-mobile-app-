const { startService } = require('../../shared/app/startService');
const {
  enforcePrivacyAdminPermissionAuthority,
} = require('../privacyAdminPermissionAuthority');

const start = () =>
  startService({
    serviceName: 'api-admin',
    routeProfile: 'api-admin',
    defaultPort: 4004,
    enableSocketsDefault: false,
    afterDatabaseConnect: enforcePrivacyAdminPermissionAuthority
  });

if (require.main === module) {
  start().catch((err) => {
    console.error('FATAL: Failed to start api-admin:', err);
    process.exit(1);
  });
}

module.exports = { start };
