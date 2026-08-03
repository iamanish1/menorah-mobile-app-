jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn(),
    disconnect: jest.fn(),
    connection: { readyState: 0 },
  };
});

const {
  parseArguments,
} = require('../../../scripts/payout-reconciliation-report');

describe('payout reconciliation report CLI arguments', () => {
  test('parses bounded limits and typed continuation cursors', () => {
    const parsed = parseArguments([
      '--limit=25',
      '--webhook-events-after-id=64f000000000000000000001',
      '--payouts-after-id=64f000000000000000000002',
    ]);
    expect(parsed.limit).toBe(25);
    expect(String(parsed.cursors.webhookEvents)).toBe('64f000000000000000000001');
    expect(String(parsed.cursors.payouts)).toBe('64f000000000000000000002');
  });

  test.each([
    ['--limit=0', /--limit must be an integer/],
    ['--limit=1001', /--limit must be an integer/],
    ['--payouts-after-id=not-an-id', /exactly 24 hexadecimal/],
    ['--unknown=value', /Unknown report argument/],
  ])('rejects unsafe argument %s', (argument, expected) => {
    expect(() => parseArguments([argument])).toThrow(expected);
  });

  test('rejects duplicate flags', () => {
    expect(() => parseArguments(['--limit=1', '--limit=2']))
      .toThrow('--limit may only be provided once');
  });
});
