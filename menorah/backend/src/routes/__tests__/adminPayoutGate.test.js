const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = { _id: '64f000000000000000000001', role: 'admin' };
    next();
  },
  requireRecentAdminMfa: (_req, _res, next) => next(),
}));

const adminRouter = require('../admin');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  return app;
};

describe('payout initiation gate', () => {
  const originalValue = process.env.PAYOUTS_ENABLED;

  beforeEach(() => {
    process.env.PAYOUTS_ENABLED = 'false';
  });

  afterAll(() => {
    if (originalValue === undefined) delete process.env.PAYOUTS_ENABLED;
    else process.env.PAYOUTS_ENABLED = originalValue;
  });

  test('rejects new payout requests while the default-off gate is disabled', async () => {
    const response = await request(buildApp())
      .post('/api/admin/payouts/64f000000000000000000020')
      .set('Idempotency-Key', 'payout-request-test-1')
      .send({ amount: 10000 })
      .expect(503);

    expect(response.body).toEqual({
      success: false,
      code: 'PAYOUTS_DISABLED',
      message: 'New payout requests and approvals are temporarily unavailable.',
    });
  });

  test('rejects payout approval while leaving the separate webhook route unaffected', async () => {
    const response = await request(buildApp())
      .post('/api/admin/payouts/64f000000000000000000030/approve')
      .send({})
      .expect(503);

    expect(response.body.code).toBe('PAYOUTS_DISABLED');
  });
});
