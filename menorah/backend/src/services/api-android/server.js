const { startService } = require('../../shared/app/startService');

const start = () =>
  startService({
    serviceName: 'api-android',
    routeProfile: 'api-android',
    defaultPort: 4002,
    enableSocketsDefault: true
  });

if (require.main === module) {
  start().catch((err) => {
    console.error('FATAL: Failed to start api-android:', err);
    process.exit(1);
  });
}

module.exports = { start };
