const AccountDeletionChallenge = require('../AccountDeletionChallenge');
const ProviderRevocationTask = require('../ProviderRevocationTask');
const User = require('../User');

describe('Apple account-deletion persistence models', () => {
  test('keeps long-lived Apple credentials excluded from ordinary user queries', () => {
    const refreshPath = User.schema.path('socialAuth.appleRefreshTokenEncrypted');
    const clientPath = User.schema.path('socialAuth.appleClientId');

    expect(refreshPath.options).toMatchObject({
      select: false,
      default: undefined,
    });
    expect(clientPath.options).toMatchObject({
      select: false,
      default: undefined,
    });
  });

  test('protects outbox credentials and enforces one revocation task per linked account', () => {
    expect(ProviderRevocationTask.schema.path('clientId').options)
      .toMatchObject({
        required: true,
        immutable: true,
        select: false,
      });
    expect(ProviderRevocationTask.schema.path('refreshTokenEncrypted').options)
      .toMatchObject({
        required: true,
        select: false,
      });
    expect(ProviderRevocationTask.schema.path('lockTokenHash').options.select)
      .toBe(false);
    expect(ProviderRevocationTask.schema.path('provider').options.enum)
      .toEqual(['apple']);
    expect(ProviderRevocationTask.schema.path('status').options.enum)
      .toEqual([
        'pending',
        'processing',
        'retry',
        'completed',
        'manual_review',
      ]);
    expect(ProviderRevocationTask.schema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { user: 1, provider: 1 },
          expect.objectContaining({ unique: true }),
        ],
        [
          { status: 1, nextAttemptAt: 1, lockedUntil: 1 },
          expect.any(Object),
        ],
      ])
    );
  });

  test('makes Apple deletion challenges single-purpose, expiring, and nonce-protected', () => {
    expect(AccountDeletionChallenge.schema.path('challengeId').options)
      .toMatchObject({
        required: true,
        unique: true,
        immutable: true,
      });
    expect(AccountDeletionChallenge.schema.path('nonceHash').options)
      .toMatchObject({
        required: true,
        immutable: true,
        select: false,
      });
    expect(AccountDeletionChallenge.schema.path('method').options.enum)
      .toEqual(['apple']);
    expect(AccountDeletionChallenge.schema.path('purpose').options)
      .toMatchObject({
        enum: ['account-deletion'],
        default: 'account-deletion',
        immutable: true,
      });
    expect(AccountDeletionChallenge.schema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { expiresAt: 1 },
          expect.objectContaining({ expireAfterSeconds: 0 }),
        ],
        [
          { user: 1, method: 1, consumedAt: 1, expiresAt: 1 },
          expect.any(Object),
        ],
      ])
    );
  });
});
