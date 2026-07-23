const crypto = require('crypto');
const request = require('supertest');

const mockClaimPayoutWebhookEvent = jest.fn();
const mockFinalizePayoutWebhookEvent = jest.fn();
const mockRecordPayoutWebhookIdentityConflict = jest.fn();

jest.mock('../../../services/payoutWebhookReconciliation', () => ({
  ...jest.requireActual('../../../services/payoutWebhookReconciliation'),
  claimPayoutWebhookEvent: (...args) => mockClaimPayoutWebhookEvent(...args),
  finalizePayoutWebhookEvent: (...args) => mockFinalizePayoutWebhookEvent(...args),
  recordPayoutWebhookIdentityConflict: (...args) => (
    mockRecordPayoutWebhookIdentityConflict(...args)
  ),
}));

const { createExpressApp } = require('../createExpressApp');
const { mountRouteProfile } = require('../routeProfiles');
const notFound = require('../../../middleware/notFound');
const errorHandler = require('../../../middleware/errorHandler');

const buildProfileApp = (profileName) => {
  const state = {
    serviceName: profileName,
    routeProfile: profileName,
    serviceRuntime: 'test',
    booted: true,
    redisReady: false,
    redisRequired: false,
  };
  const { app } = createExpressApp({
    serviceName: profileName,
    getHealthState: () => state,
  });

  mountRouteProfile(app, profileName);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

describe('canonical payout webhook ingress', () => {
  const originalEnv = process.env;
  const webhookSecret = 'X-Webhook-A1b2C3d4E5f6G7h8';
  const rawPayload = '{\n  "id":"evt_test_123",\n  "event":"payout.processed"\n}';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      JWT_SECRET: 'x'.repeat(64),
      PAYOUTS_ENABLED: 'false',
      RAZORPAY_X_WEBHOOK_SECRET: webhookSecret,
    };
    mockClaimPayoutWebhookEvent.mockResolvedValue({
      event: { _id: 'ledger-test-event' },
      identity: {
        payloadDigest: crypto.createHash('sha256').update(rawPayload).digest('hex'),
        providerEventId: null,
      },
      claimed: true,
      duplicate: false,
      conflict: false,
    });
    mockFinalizePayoutWebhookEvent.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('api-admin verifies the exact raw JSON body while payout initiation is off', async () => {
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(Buffer.from(rawPayload))
      .digest('hex');

    const response = await request(buildProfileApp('api-admin'))
      .post('/api/payouts/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawPayload)
      .expect(200);

    expect(response.body).toEqual({ success: true, reviewRequired: true });
    expect(mockClaimPayoutWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      rawBody: Buffer.from(rawPayload),
      eventType: 'payout.processed',
    }));
    expect(mockFinalizePayoutWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      processingState: 'needs_review',
      mismatchCodes: ['PAYOUT_ENTITY_MISSING'],
    }));
  });

  test('api-admin rejects an invalid payout webhook signature', async () => {
    const response = await request(buildProfileApp('api-admin'))
      .post('/api/payouts/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', '0'.repeat(64))
      .send(rawPayload)
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      message: 'Invalid signature',
    });
  });

  test.each(['api-ios', 'api-android', 'api-web'])(
    '%s does not mount the payout webhook',
    async (profileName) => {
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(Buffer.from(rawPayload))
        .digest('hex');

      await request(buildProfileApp(profileName))
        .post('/api/payouts/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawPayload)
        .expect(404);
    }
  );
});
