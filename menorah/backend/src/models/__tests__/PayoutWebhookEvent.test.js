const PayoutWebhookEvent = require('../PayoutWebhookEvent');

const validEvent = (overrides = {}) => new PayoutWebhookEvent({
  eventKey: 'razorpay-x:evt_payout_123',
  providerEventId: 'evt_payout_123',
  payloadDigest: 'a'.repeat(64),
  eventType: 'payout.processed',
  providerPayoutId: 'pout_1234567890',
  ...overrides,
});

describe('PayoutWebhookEvent model', () => {
  test('accepts bounded reconciliation evidence without storing webhook bodies', () => {
    const event = validEvent();
    expect(event.validateSync()).toBeUndefined();

    const paths = Object.keys(PayoutWebhookEvent.schema.paths).join(' ').toLowerCase();
    expect(paths).not.toMatch(/rawbody|payloadbody|signature|secret|bankaccount/);
  });

  test('keeps the optional provider event id absent instead of indexing null', () => {
    const event = validEvent({ providerEventId: undefined });
    expect(event.providerEventId).toBeUndefined();
    expect(event.validateSync()).toBeUndefined();
  });

  test('rejects unsafe mismatch codes and unbounded delivery counts', () => {
    const event = validEvent({
      mismatchCodes: ['unsafe-code'],
      deliveryCount: 1.5,
    });
    const error = event.validateSync();
    expect(error.errors['mismatchCodes.0']).toBeDefined();
    expect(error.errors.deliveryCount).toBeDefined();
  });

  test('defines unique replay identities and supporting review indexes', () => {
    const indexes = PayoutWebhookEvent.schema.indexes();
    expect(indexes).toEqual(expect.arrayContaining([
      [
        { eventKey: 1 },
        expect.objectContaining({
          unique: true,
          name: 'unique_payout_webhook_event_key',
        }),
      ],
      [
        { payloadDigest: 1 },
        expect.objectContaining({
          unique: true,
          name: 'unique_payout_webhook_payload_digest',
        }),
      ],
      [
        { providerEventId: 1 },
        expect.objectContaining({
          unique: true,
          sparse: true,
          name: 'unique_razorpay_x_webhook_event_id',
        }),
      ],
      [{ processingState: 1, receivedAt: 1 }, expect.any(Object)],
      [{ providerPayoutId: 1, receivedAt: -1 }, expect.any(Object)],
    ]));
  });
});
