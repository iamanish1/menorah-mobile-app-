const request = require('supertest');
const { createExpressApp } = require('../createExpressApp');

const buildHealthApp = (state) => createExpressApp({
  serviceName: state.serviceName,
  getHealthState: () => state
}).app;

describe('health endpoints', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('/health/live does not require dependencies', async () => {
    const app = buildHealthApp({
      serviceName: 'api-web',
      serviceRuntime: 'test',
      booted: false,
      redisReady: false,
      redisRequired: true
    });

    const res = await request(app).get('/health/live').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.process.status).toBe('ok');
  });

  test('/health aliases live and /api/health aliases readiness', async () => {
    const app = buildHealthApp({
      serviceName: 'api-web',
      serviceRuntime: 'test',
      booted: false,
      redisReady: false,
      redisRequired: false
    });

    await request(app).get('/health').expect(200);
    await request(app).get('/api/health').expect(503);
  });

  test('/health/ready returns 503 when MongoDB is unavailable', async () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    const app = buildHealthApp({
      serviceName: 'api-web',
      serviceRuntime: 'test',
      booted: true,
      redisReady: false,
      redisRequired: false
    });

    const res = await request(app).get('/health/ready').expect(503);
    expect(res.headers['x-menorah-deployment-environment']).toBe('staging');
    expect(res.body.checks.mongo.status).toBe('fail');
  });

  test('/health/deep reports redacted LiveKit configuration status', async () => {
    process.env.LIVEKIT_URL = 'wss://calls.example.com';
    process.env.LIVEKIT_API_URL = 'https://calls.example.com';
    process.env.LIVEKIT_API_KEY = 'livekit-key';
    process.env.LIVEKIT_API_SECRET = 'livekit-secret';

    const app = buildHealthApp({
      serviceName: 'api-web',
      serviceRuntime: 'test',
      booted: true,
      redisReady: false,
      redisRequired: false
    });

    const res = await request(app).get('/health/deep');

    expect(res.body.checks.providers.config.livekit).toEqual({ configured: true });
    expect(JSON.stringify(res.body)).not.toContain('livekit-secret');
    expect(JSON.stringify(res.body)).not.toContain('livekit-key');
  });
});
