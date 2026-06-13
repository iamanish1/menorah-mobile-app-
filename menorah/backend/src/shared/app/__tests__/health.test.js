const request = require('supertest');
const { createExpressApp } = require('../createExpressApp');

const buildHealthApp = (state) => createExpressApp({
  serviceName: state.serviceName,
  getHealthState: () => state
}).app;

describe('health endpoints', () => {
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
    const app = buildHealthApp({
      serviceName: 'api-web',
      serviceRuntime: 'test',
      booted: true,
      redisReady: false,
      redisRequired: false
    });

    const res = await request(app).get('/health/ready').expect(503);
    expect(res.body.checks.mongo.status).toBe('fail');
  });
});
