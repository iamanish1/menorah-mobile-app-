const mongoose = require('mongoose');
const {
  parseArguments,
} = require('../../../scripts/payment-reconciliation-report');

describe('payment reconciliation report CLI arguments', () => {
  test('uses safe defaults when no pagination arguments are supplied', () => {
    expect(parseArguments([])).toEqual({
      limit: 100,
      cursors: {},
    });
  });

  test('converts each explicit stream cursor to a MongoDB ObjectId', () => {
    const parsed = parseArguments([
      '--limit=250',
      '--webhook-events-after-id=64F000000000000000000001',
      '--payment-attempts-after-id=64f000000000000000000002',
      '--quarantined-bookings-after-id=64f000000000000000000003',
      '--paid-authorization-gaps-after-id=64f000000000000000000004',
    ]);

    expect(parsed.limit).toBe(250);
    expect(parsed.cursors).toEqual({
      webhookEvents: expect.any(mongoose.Types.ObjectId),
      paymentAttempts: expect.any(mongoose.Types.ObjectId),
      quarantinedBookings: expect.any(mongoose.Types.ObjectId),
      paidAuthorizationGaps: expect.any(mongoose.Types.ObjectId),
    });
    expect(Object.fromEntries(
      Object.entries(parsed.cursors)
        .map(([stream, cursor]) => [stream, cursor.toHexString()])
    )).toEqual({
      webhookEvents: '64f000000000000000000001',
      paymentAttempts: '64f000000000000000000002',
      quarantinedBookings: '64f000000000000000000003',
      paidAuthorizationGaps: '64f000000000000000000004',
    });
  });

  test.each([
    '--webhook-events-after-id=64f00000000000000000001',
    '--payment-attempts-after-id=64f0000000000000000000022',
    '--quarantined-bookings-after-id=64f00000000000000000000g',
    '--paid-authorization-gaps-after-id=',
  ])('rejects an unsafe ObjectId cursor: %s', (argument) => {
    expect(() => parseArguments([argument]))
      .toThrow(/must be exactly 24 hexadecimal characters/);
  });

  test('rejects unknown and duplicate flags instead of silently mispaging', () => {
    expect(() => parseArguments(['--webhook-event-after-id=64f000000000000000000001']))
      .toThrow('Unknown report argument');
    expect(() => parseArguments(['--limit=10', '--limit=20']))
      .toThrow('--limit may only be provided once');
  });
});
