const {
  assertLiveKitAllowed,
  resolveCallPolicy,
} = require('../callPolicyService');

describe('callPolicyService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BLOCK_LIVEKIT_FOR_UNKNOWN_REGION: 'false',
      LIVEKIT_BLOCKED_COUNTRIES: 'AE',
      BLOCKED_COUNTRY_CALL_PROVIDER: 'zoom',
      ZOOM_ENABLED: 'true',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('routes India-classified users to LiveKit in-app calling', () => {
    const policy = resolveCallPolicy({
      user: { country: 'IN', phone: '+919876543210' },
    });

    expect(policy).toMatchObject({
      region: 'IN',
      provider: 'livekit',
      joinMode: 'in_app',
    });
  });

  test('routes UAE-classified users to the approved external provider', () => {
    const policy = resolveCallPolicy({
      user: { country: 'AE', phone: '+971501234567' },
    });

    expect(policy).toMatchObject({
      region: 'AE',
      provider: 'zoom',
      joinMode: 'external_link',
    });
  });

  test('UAE classification wins over mixed India signals', () => {
    const policy = resolveCallPolicy({
      user: { country: 'IN', phone: '+971501234567' },
    });

    expect(policy.region).toBe('AE');
    expect(policy.joinMode).toBe('external_link');
    expect(policy.provider).toBe('zoom');
  });

  test('allows unknown-region users by default when the block flag is false', () => {
    const policy = resolveCallPolicy({ user: { phone: '+15551234567' } });

    expect(policy).toMatchObject({
      region: 'UNKNOWN',
      provider: 'livekit',
      joinMode: 'in_app',
    });
  });

  test('blocks unknown-region users when the block flag is true', () => {
    process.env.BLOCK_LIVEKIT_FOR_UNKNOWN_REGION = 'true';
    const policy = resolveCallPolicy({ user: { phone: '+15551234567' } });

    expect(policy).toMatchObject({
      region: 'UNKNOWN',
      provider: 'disabled',
      joinMode: 'disabled',
    });
  });

  test('allows non-blocked countries to use LiveKit', () => {
    const policy = resolveCallPolicy({ user: { country: 'US', phone: '+15551234567' } });

    expect(policy).toMatchObject({
      region: 'US',
      provider: 'livekit',
      joinMode: 'in_app',
    });
  });

  test('routes configured blocked countries to external provider links', () => {
    process.env.LIVEKIT_BLOCKED_COUNTRIES = 'AE,QA';
    const policy = resolveCallPolicy({ user: { country: 'QA' } });

    expect(policy).toMatchObject({
      region: 'QA',
      provider: 'zoom',
      joinMode: 'external_link',
    });
  });

  test('LiveKit guard throws before token minting for blocked-country policies', () => {
    expect(() => assertLiveKitAllowed({ user: { country: 'AE' } })).toThrow('LiveKit blocked by call policy');
    expect(() => assertLiveKitAllowed({ user: { country: 'IN' } })).not.toThrow();
    expect(() => assertLiveKitAllowed({ user: { country: 'US' } })).not.toThrow();
  });
});
