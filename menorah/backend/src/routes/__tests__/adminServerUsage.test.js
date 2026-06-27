const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = { role: 'admin' };
    next();
  },
  adminAuth: (_req, _res, next) => next(),
}));

const adminRouter = require('../admin');

describe('admin server usage telemetry', () => {
  test('does not expose CPU hardware identifiers', async () => {
    const app = express();
    app.use('/api/admin', adminRouter);

    const res = await request(app).get('/api/admin/server-usage').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.cpu).toEqual({
      usagePercent: expect.any(Number),
      loadAverage: expect.any(Array),
    });
    expect(res.body.data.cpu).not.toHaveProperty('model');
    expect(res.body.data.cpu).not.toHaveProperty('cores');
  });
});
