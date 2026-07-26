const { startService } = require('../../shared/app/startService');

const start = () =>
  startService({
    serviceName: 'api-ios',
    routeProfile: 'api-ios',
    defaultPort: 4001,
    enableSocketsDefault: true
  });

if (require.main === module) {
  start().catch((err) => {
    console.error('FATAL: Failed to start api-ios:', err);
    process.exit(1);
  });
}

module.exports = { start };
