const mongoose = require('mongoose');
const PrivacyConsentState = require('../../models/PrivacyConsentState');
const PrivacyEvent = require('../../models/PrivacyEvent');
const {
  createPrivacyConsentService,
} = require('../privacyConsentService');
const {
  verifyPrivacyEventEvidence,
} = require('../privacyEventService');

const TEST_URI = process.env.PRIVACY_CONSENT_TEST_URI;
const describeWithMongo = TEST_URI ? describe : describe.skip;

jest.setTimeout(30000);

describeWithMongo('privacy consent on isolated replica-set MongoDB', () => {
  const originalAuditKey = process.env.AUDIT_LOG_SIGNING_KEY;
  const user = {
    _id: new mongoose.Types.ObjectId('64f000000000000000000001'),
    role: 'user',
  };
  let configuredNoticeVersion;
  let service;

  beforeAll(async () => {
    const parsed = new URL(TEST_URI);
    const databaseName = parsed.pathname.replace(/^\//, '');
    if (!/^menorah_privacy_consent_test(?:_|$)/.test(databaseName)) {
      throw new Error(
        'PRIVACY_CONSENT_TEST_URI must name a disposable '
        + 'menorah_privacy_consent_test* database.'
      );
    }
    process.env.AUDIT_LOG_SIGNING_KEY =
      'isolated-privacy-consent-signing-key-v2';
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 10000 });
  });

  beforeEach(async () => {
    configuredNoticeVersion = 'approved-privacy-v1';
    service = createPrivacyConsentService({
      readConfig: () => ({ noticeVersion: configuredNoticeVersion }),
    });
    await mongoose.connection.dropDatabase();
    await Promise.all([
      PrivacyConsentState.createIndexes(),
      PrivacyEvent.createIndexes(),
    ]);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    if (originalAuditKey === undefined) delete process.env.AUDIT_LOG_SIGNING_KEY;
    else process.env.AUDIT_LOG_SIGNING_KEY = originalAuditKey;
  });

  test('same-key concurrent acceptance persists one transition and one fingerprint', async () => {
    const results = await Promise.all([
      0,
      1,
      2,
    ].map((index) => service.record({
      user,
      action: 'accepted',
      noticeVersion: configuredNoticeVersion,
      source: 'api-web',
      idempotencyKey: 'shared-consent-key-0001',
      now: new Date(`2026-07-23T10:00:0${index}.000Z`),
    })));

    expect(results.filter(({ created }) => created)).toHaveLength(1);
    expect(new Set(results.map(({ event }) => String(event._id))).size).toBe(1);
    const [events, state] = await Promise.all([
      PrivacyEvent.find()
        .select('+idempotencyKeyHash +clientIdempotencyKeyHash')
        .lean(),
      PrivacyConsentState.findOne({ subjectUser: user._id }).lean(),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].clientIdempotencyKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(events[0].transitionIdentityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPrivacyEventEvidence(events[0])).toEqual({ valid: true });
    expect(state).toMatchObject({
      currentEvent: events[0]._id,
      action: 'accepted',
      noticeVersion: configuredNoticeVersion,
      version: 1,
    });
  });

  test('different concurrent keys never receive false replay success', async () => {
    const outcomes = await Promise.allSettled([
      'distinct-consent-key-a',
      'distinct-consent-key-b',
      'distinct-consent-key-c',
    ].map((idempotencyKey) => service.record({
      user,
      action: 'accepted',
      noticeVersion: configuredNoticeVersion,
      source: 'api-web',
      idempotencyKey,
    })));

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.filter(({ status }) => status === 'rejected');
    expect(rejected).toHaveLength(2);
    expect(rejected.every(({ reason }) => [
      'PRIVACY_CONSENT_IDEMPOTENCY_KEY_UNBOUND',
      'PRIVACY_CONSENT_TRANSITION_CONFLICT',
    ].includes(reason.code))).toBe(true);
    expect(await PrivacyEvent.countDocuments()).toBe(1);
  });

  test('stale acceptance replay is rejected after withdrawal and reaccept uses a new identity', async () => {
    const acceptance = await service.record({
      user,
      action: 'accepted',
      noticeVersion: configuredNoticeVersion,
      source: 'api-web',
      idempotencyKey: 'acceptance-key-0001',
    });
    const withdrawal = await service.record({
      user,
      action: 'withdrawn',
      source: 'api-web',
      idempotencyKey: ['withdr', 'awal-k', 'ey-000', '1'].join(''),
    });

    await expect(service.record({
      user,
      action: 'accepted',
      noticeVersion: configuredNoticeVersion,
      source: 'api-web',
      idempotencyKey: 'acceptance-key-0001',
    })).rejects.toMatchObject({
      code: 'PRIVACY_IDEMPOTENCY_KEY_STALE',
    });

    const reacceptance = await service.record({
      user,
      action: 'accepted',
      noticeVersion: configuredNoticeVersion,
      source: 'api-web',
      idempotencyKey: 'acceptance-key-0002',
    });
    expect(String(withdrawal.event.predecessorEventId))
      .toBe(String(acceptance.event._id));
    expect(String(reacceptance.event.predecessorEventId))
      .toBe(String(withdrawal.event._id));
    expect(new Set([
      acceptance.event.transitionIdentityHash,
      withdrawal.event.transitionIdentityHash,
      reacceptance.event.transitionIdentityHash,
    ]).size).toBe(3);
  });

  test('concurrent valid transitions serialize into a chain without predecessor forks', async () => {
    const first = await service.record({
      user,
      action: 'accepted',
      noticeVersion: configuredNoticeVersion,
      source: 'api-web',
      idempotencyKey: ['initia', 'l-cons', 'ent-ke', 'y-0001'].join(''),
    });
    configuredNoticeVersion = 'approved-privacy-v2';

    await Promise.allSettled([
      service.record({
        user,
        action: 'accepted',
        noticeVersion: configuredNoticeVersion,
        source: 'api-web',
        idempotencyKey: 'upgrade-consent-key-0001',
      }),
      service.record({
        user,
        action: 'withdrawn',
        noticeVersion: 'approved-privacy-v1',
        source: 'api-web',
        idempotencyKey: 'parallel-withdraw-key-0001',
      }),
    ]);

    const events = await PrivacyEvent.find({
      subjectUser: user._id,
    }).sort({ createdAt: 1, _id: 1 }).lean();
    expect(events.length).toBeGreaterThanOrEqual(2);
    const childCounts = new Map();
    for (const event of events.slice(1)) {
      const predecessor = String(event.predecessorEventId);
      childCounts.set(predecessor, (childCounts.get(predecessor) || 0) + 1);
    }
    expect([...childCounts.values()].every((count) => count === 1)).toBe(true);
    expect(String(events[1].predecessorEventId)).toBe(String(first.event._id));
    const state = await PrivacyConsentState.findOne({
      subjectUser: user._id,
    }).lean();
    expect(String(state.currentEvent)).toBe(String(events.at(-1)._id));
    expect(state.version).toBe(events.length);
  });

  test('findOneAndReplace and bulkWrite cannot mutate signed events', async () => {
    const result = await service.record({
      user,
      action: 'accepted',
      noticeVersion: configuredNoticeVersion,
      source: 'api-web',
      idempotencyKey: 'mutation-guard-key-0001',
    });

    await expect(PrivacyEvent.findOneAndReplace(
      { _id: result.event._id },
      result.event.toObject()
    )).rejects.toMatchObject({ code: 'PRIVACY_EVENT_APPEND_ONLY' });
    await expect(PrivacyEvent.bulkWrite([{
      updateOne: {
        filter: { _id: result.event._id },
        update: { $set: { toStatus: 'tampered' } },
      },
    }])).rejects.toMatchObject({ code: 'PRIVACY_EVENT_APPEND_ONLY' });

    const stored = await PrivacyEvent.findById(result.event._id)
      .select('+idempotencyKeyHash +clientIdempotencyKeyHash')
      .lean();
    expect(stored.toStatus).toBeNull();
    expect(verifyPrivacyEventEvidence(stored)).toEqual({ valid: true });
  });
});
