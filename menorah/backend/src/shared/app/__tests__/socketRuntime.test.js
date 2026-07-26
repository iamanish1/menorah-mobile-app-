const { resolveSocketRuntime } = require('../createSocketServer');

describe('Socket.IO runtime flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('cloudrun always disables sockets', () => {
    process.env.SERVICE_RUNTIME = 'cloudrun';
    process.env.ENABLE_SOCKET_IO = 'true';
    process.env.ENABLE_SOCKET_ADAPTER = 'true';

    const runtime = resolveSocketRuntime({
      serviceName: 'api-web',
      enableSocketsDefault: true
    });

    expect(runtime.socketEnabled).toBe(false);
    expect(runtime.socketAdapterEnabled).toBe(false);
  });

  test('home runtime enables sockets only for supported API services', () => {
    process.env.SERVICE_RUNTIME = 'home';
    process.env.ENABLE_SOCKET_IO = 'true';
    process.env.ENABLE_SOCKET_ADAPTER = 'false';

    expect(resolveSocketRuntime({ serviceName: 'api-ios' }).socketEnabled).toBe(true);
    expect(resolveSocketRuntime({ serviceName: 'api-android' }).socketEnabled).toBe(true);
    expect(resolveSocketRuntime({ serviceName: 'api-web' }).socketEnabled).toBe(true);
    expect(resolveSocketRuntime({ serviceName: 'api-admin' }).socketEnabled).toBe(false);
  });
});
