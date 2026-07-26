const { startService } = require('./shared/app/startService');

const start = () =>
  startService({
    serviceName: 'api-web',
    routeProfile: 'api-web',
    defaultPort: 4003,
    enableSocketsDefault: true
  });

if (require.main === module) {
  start().catch((err) => {
    console.error('FATAL: Failed to start compatibility api-web server:', err);
    process.exit(1);
  });
}

module.exports = { start };
