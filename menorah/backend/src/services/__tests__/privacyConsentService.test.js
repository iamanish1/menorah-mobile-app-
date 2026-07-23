const mongoose = require('mongoose');
const {
  buildConsentTransitionIdentity,
  buildConsentTransitionKey,
  createPrivacyConsentService,
} = require('../privacyConsentService');
const {
  createPrivacyEventAppender,
  hashIdempotencyKey,
} = require('../privacyEventService');

const USER = {
  _id: new mongoose.Types.ObjectId('64f000000000000000000001'),
  role: 'user',
};
const STATE_ID = new mongoose.Types.ObjectId('64f000000000000000000010');
const NOTICE_VERSION = 'approved-privacy-v1';

const queryResult = (resolveValue) => {
  const query = {};
  query.select = jest.fn(() => query);
  query.sort = jest.fn(() => query);
  query.session = jest.fn(() => query);
  query.lean = jest.fn(async () => (
    typeof resolveValue === 'function' ? resolveValue() : resolveValue
  ));
  query.then = (resolve, reject) => query.lean().then(resolve, reject);
  return query;
};

const matches = (event, predicate) => Object.entries(predicate).every(([key, value]) => {
  if (key === 'eventType' && value?.$in) return value.$in.includes(event.eventType);
  if (value === null) return event[key] === null || event[key] === undefined;
  return String(event[key]) === String(value);
});

const makeHarness = ({ forceCasMiss = false } = {}) => {
  let state = null;
  const events = [];
  class FakeEvent {
    constructor(value) {
      Object.assign(this, value);
    }

    async save() {
      events.push(this);
    }
  }
  const appendEvent = createPrivacyEventAppender({
    PrivacyEventModel: FakeEvent,
    mongooseInstance: mongoose,
  });
  const ConsentStateModel = {
    findOne: jest.fn(() => queryResult(() => state)),
    create: jest.fn(async ([document]) => {
      state = { _id: STATE_ID, ...document };
      return [{
        ...state,
        toObject: () => ({ ...state }),
      }];
    }),
    findOneAndUpdate: jest.fn((filter, update) => queryResult(() => {
      const matchesState = (
        state
        && String(state._id) === String(filter._id)
        && state.version === filter.version
        && String(state.currentEvent || '') === String(filter.currentEvent || '')
      );
      if (!matchesState || forceCasMiss) return null;
      state = {
        ...state,
        ...update.$set,
        version: state.version + update.$inc.version,
      };
      return state;
    })),
  };
  const PrivacyEventModel = {
    findOne: jest.fn((predicate) => queryResult(() => {
      const found = events.filter((event) => matches(event, predicate));
      return found.length ? found[found.length - 1] : null;
    })),
  };
  const service = createPrivacyConsentService({
    ConsentStateModel,
    PrivacyEventModel,
    appendEvent,
    readConfig: () => ({ noticeVersion: NOTICE_VERSION }),
    transactionRunner: async (work) => work({ id: 'unit-session' }),
  });
  return {
    service,
    events,
    ConsentStateModel,
    PrivacyEventModel,
    getState: () => state,
  };
};

describe('privacy notice consent lifecycle', () => {
  const originalKey = process.env.AUDIT_LOG_SIGNING_KEY;

  beforeEach(() => {
    process.env.AUDIT_LOG_SIGNING_KEY =
      'unit-only-consent-audit-signing-key-v2';
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.AUDIT_LOG_SIGNING_KEY;
    else process.env.AUDIT_LOG_SIGNING_KEY = originalKey;
  });

  test('persists client fingerprint, transition identity, and consent-state CAS', async () => {
    const harness = makeHarness();
    const now = new Date('2026-07-23T10:00:00.000Z');
    const result = await harness.service.record({
      user: USER,
      action: 'accepted',
      noticeVersion: NOTICE_VERSION,
      source: 'api-web',
      idempotencyKey: 'consent-key-0001',
      now,
    });

    const transitionIdentityHash = buildConsentTransitionIdentity({
      subjectUser: USER._id,
      action: 'accepted',
      noticeVersion: NOTICE_VERSION,
    });
    expect(result.created).toBe(true);
    expect(result.event).toMatchObject({
      evidenceVersion: 'v2',
      consentAction: 'accepted',
      predecessorEventId: null,
      transitionIdentityHash,
      clientIdempotencyKeyHash: hashIdempotencyKey({
        subjectUser: USER._id,
        idempotencyKey: 'consent-key-0001',
      }),
    });
    expect(result.event.idempotencyKeyHash).toBe(hashIdempotencyKey({
      subjectUser: USER._id,
      idempotencyKey: buildConsentTransitionKey({
        subjectUser: USER._id,
        action: 'accepted',
        noticeVersion: NOTICE_VERSION,
      }),
    }));
    expect(harness.getState()).toMatchObject({
      action: 'accepted',
      noticeVersion: NOTICE_VERSION,
      currentEvent: result.event._id,
      version: 1,
    });
  });

  test('rejects stale notice acceptance before creating state', async () => {
    const harness = makeHarness();
    await expect(harness.service.record({
      user: USER,
      action: 'accepted',
      noticeVersion: 'stale-privacy-v0',
      source: 'api-web',
    })).rejects.toMatchObject({
      code: 'PRIVACY_NOTICE_VERSION_MISMATCH',
    });
    expect(harness.ConsentStateModel.create).not.toHaveBeenCalled();
  });

  test('records withdrawal with the accepted event as its predecessor', async () => {
    const harness = makeHarness();
    const accepted = await harness.service.record({
      user: USER,
      action: 'accepted',
      noticeVersion: NOTICE_VERSION,
      source: 'api-web',
      idempotencyKey: 'consent-key-0002',
    });
    const withdrawn = await harness.service.record({
      user: USER,
      action: 'withdrawn',
      source: 'api-web',
      idempotencyKey: 'withdraw-key-0002',
    });

    expect(withdrawn.event).toMatchObject({
      consentAction: 'withdrawn',
      noticeVersion: NOTICE_VERSION,
      predecessorEventId: accepted.event._id,
    });
    expect(harness.events).toHaveLength(2);
    expect(harness.getState()).toMatchObject({
      action: 'withdrawn',
      currentEvent: withdrawn.event._id,
      version: 2,
    });
  });

  test('replays only the current transition for the same persisted client key', async () => {
    const harness = makeHarness();
    const first = await harness.service.record({
      user: USER,
      action: 'accepted',
      noticeVersion: NOTICE_VERSION,
      source: 'api-ios',
      idempotencyKey: 'consent-key-0003',
    });
    const replay = await harness.service.record({
      user: USER,
      action: 'accepted',
      noticeVersion: NOTICE_VERSION,
      source: 'api-ios',
      idempotencyKey: 'consent-key-0003',
    });

    expect(replay).toEqual({ event: first.event, created: false });
    expect(harness.events).toHaveLength(1);
  });

  test('rejects stale acceptance-key replay after withdrawal', async () => {
    const harness = makeHarness();
    await harness.service.record({
      user: USER,
      action: 'accepted',
      noticeVersion: NOTICE_VERSION,
      source: 'api-web',
      idempotencyKey: 'consent-key-0004',
    });
    await harness.service.record({
      user: USER,
      action: 'withdrawn',
      source: 'api-web',
      idempotencyKey: 'withdraw-key-0004',
    });

    await expect(harness.service.record({
      user: USER,
      action: 'accepted',
      noticeVersion: NOTICE_VERSION,
      source: 'api-web',
      idempotencyKey: 'consent-key-0004',
    })).rejects.toMatchObject({
      code: 'PRIVACY_IDEMPOTENCY_KEY_STALE',
      statusCode: 409,
    });
    expect(harness.events).toHaveLength(2);
  });

  test('does not silently bind a new client key to an already-current transition', async () => {
    const harness = makeHarness();
    await harness.service.record({
      user: USER,
      action: 'accepted',
      noticeVersion: NOTICE_VERSION,
      source: 'api-web',
      idempotencyKey: 'consent-key-0005',
    });

    await expect(harness.service.record({
      user: USER,
      action: 'accepted',
      noticeVersion: NOTICE_VERSION,
      source: 'api-web',
      idempotencyKey: 'different-key-0005',
    })).rejects.toMatchObject({
      code: 'PRIVACY_CONSENT_IDEMPOTENCY_KEY_UNBOUND',
    });
  });

  test('rejects an invalid client key before reading consent state', async () => {
    const harness = makeHarness();
    await expect(harness.service.record({
      user: USER,
      action: 'accepted',
      noticeVersion: NOTICE_VERSION,
      source: 'api-web',
      idempotencyKey: 'unsafe key with spaces',
    })).rejects.toMatchObject({
      code: 'PRIVACY_IDEMPOTENCY_KEY_INVALID',
      statusCode: 400,
    });
    expect(harness.ConsentStateModel.findOne).not.toHaveBeenCalled();
  });

  test('aborts the event transaction if the consent-state CAS misses', async () => {
    const harness = makeHarness({ forceCasMiss: true });
    await expect(harness.service.record({
      user: USER,
      action: 'accepted',
      noticeVersion: NOTICE_VERSION,
      source: 'api-web',
    })).rejects.toMatchObject({
      code: 'PRIVACY_CONSENT_STATE_CONCURRENT_CHANGE',
    });
  });
});
