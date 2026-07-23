const {
  createAccountDeletionService,
  deletionEventIdempotencyKey,
} = require('../accountDeletionService');
const {
  hashIdempotencyKey,
} = require('../privacyEventService');

const USER_ID = '64f000000000000000000001';
const REQUEST_ID = '64f000000000000000000010';
const EVENT_ID = '64f000000000000000000011';
const NOW = new Date('2026-07-23T12:00:00.000Z');

const userQuery = (value) => {
  const query = {};
  query.select = jest.fn(() => query);
  query.session = jest.fn().mockResolvedValue(value);
  return query;
};

const leanQuery = (value) => {
  const query = {};
  query.session = jest.fn(() => query);
  query.lean = jest.fn().mockResolvedValue(value);
  return query;
};

const makeUser = (overrides = {}) => ({
  _id: USER_ID,
  role: 'user',
  isActive: true,
  passwordAuthEnabled: true,
  sessionVersion: 4,
  comparePassword: jest.fn().mockResolvedValue(true),
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeHarness = ({
  user = makeUser(),
  deletionRequest = null,
  existingEvent = null,
} = {}) => {
  const session = { id: 'unit-session' };
  const userLookup = userQuery(user);
  const deletionLookup = leanQuery(deletionRequest);
  const eventLookup = leanQuery(existingEvent);
  const createdRequest = {
    _id: REQUEST_ID,
    user: USER_ID,
    requestedAt: NOW,
    accountDeactivatedAt: NOW,
    retentionReviewAfter: NOW,
    status: 'pending',
  };
  const createdEvent = { _id: EVENT_ID };
  const UserModel = {
    findById: jest.fn(() => userLookup),
  };
  const DeletionRequestModel = {
    findOne: jest.fn(() => deletionLookup),
    create: jest.fn().mockResolvedValue([createdRequest]),
  };
  const PrivacyEventModel = {
    findOne: jest.fn(() => eventLookup),
  };
  const appendEvent = jest.fn().mockResolvedValue(createdEvent);
  const verifyEvent = jest.fn(() => ({ valid: true }));
  const transactionRunner = jest.fn(async (operation) => operation(session));
  const service = createAccountDeletionService({
    UserModel,
    DeletionRequestModel,
    PrivacyEventModel,
    appendEvent,
    verifyEvent,
    transactionRunner,
  });

  return {
    service,
    session,
    user,
    userLookup,
    deletionLookup,
    eventLookup,
    createdRequest,
    createdEvent,
    UserModel,
    DeletionRequestModel,
    PrivacyEventModel,
    appendEvent,
    verifyEvent,
    transactionRunner,
  };
};

describe('account deletion service', () => {
  test('atomically deactivates the account, creates the review, and appends evidence', async () => {
    const harness = makeHarness();
    const result = await harness.service.requestDeletion({
      userId: USER_ID,
      password: 'CorrectPass123',
      source: 'api-web',
      now: NOW,
    });

    expect(harness.transactionRunner).toHaveBeenCalledTimes(1);
    expect(harness.userLookup.select)
      .toHaveBeenCalledWith('+password +passwordAuthEnabled');
    expect(harness.userLookup.session).toHaveBeenCalledWith(harness.session);
    expect(harness.deletionLookup.session).toHaveBeenCalledWith(harness.session);
    expect(harness.user.save).toHaveBeenCalledWith({ session: harness.session });
    expect(harness.user.isActive).toBe(false);
    expect(harness.user.sessionVersion).toBe(5);
    expect(harness.user.lastSessionRevokedAt).toBeInstanceOf(Date);
    expect(harness.DeletionRequestModel.create).toHaveBeenCalledWith(
      [{
        user: USER_ID,
        requestedAt: NOW,
        accountDeactivatedAt: NOW,
        retentionReviewAfter: NOW,
        status: 'pending',
      }],
      { session: harness.session }
    );

    const eventKey = deletionEventIdempotencyKey(REQUEST_ID);
    expect(harness.PrivacyEventModel.findOne).toHaveBeenCalledWith({
      idempotencyKeyHash: hashIdempotencyKey({
        subjectUser: USER_ID,
        idempotencyKey: eventKey,
      }),
    });
    expect(harness.eventLookup.session).toHaveBeenCalledWith(harness.session);
    expect(harness.appendEvent).toHaveBeenCalledWith({
      eventType: 'account_deletion_requested',
      actor: USER_ID,
      actorRole: 'user',
      subjectUser: USER_ID,
      requestType: 'deletion',
      requestId: REQUEST_ID,
      source: 'api-web',
      fromStatus: null,
      toStatus: 'pending',
      idempotencyKey: eventKey,
      occurredAt: NOW,
      session: harness.session,
    });
    expect(result).toEqual({
      request: harness.createdRequest,
      event: harness.createdEvent,
      created: true,
      accountDeactivated: true,
    });
  });

  test('returns the existing request and event without revoking sessions twice', async () => {
    const existingRequest = {
      _id: REQUEST_ID,
      user: USER_ID,
      requestedAt: NOW,
      status: 'pending',
    };
    const existingEvent = { _id: EVENT_ID };
    const user = makeUser({ isActive: false });
    const harness = makeHarness({
      user,
      deletionRequest: existingRequest,
      existingEvent,
    });

    await expect(harness.service.requestDeletion({
      userId: USER_ID,
      password: 'CorrectPass123',
      source: 'api-web',
      now: NOW,
    })).resolves.toEqual({
      request: existingRequest,
      event: existingEvent,
      created: false,
      accountDeactivated: true,
    });

    expect(user.save).not.toHaveBeenCalled();
    expect(user.sessionVersion).toBe(4);
    expect(harness.DeletionRequestModel.create).not.toHaveBeenCalled();
    expect(harness.appendEvent).not.toHaveBeenCalled();
  });

  test('fails closed instead of replaying deletion behavior from invalid evidence', async () => {
    const harness = makeHarness({
      user: makeUser({ isActive: false }),
      deletionRequest: {
        _id: REQUEST_ID,
        user: USER_ID,
        requestedAt: NOW,
        status: 'pending',
      },
      existingEvent: { _id: EVENT_ID, evidenceHash: 'tampered' },
    });
    harness.verifyEvent.mockReturnValue({
      valid: false,
      reason: 'evidence_hash_mismatch',
    });

    await expect(harness.service.requestDeletion({
      userId: USER_ID,
      password: 'CorrectPass123',
    })).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_EVIDENCE_INVALID',
      statusCode: 503,
    });
  });

  test('rejects a bad password before reading or changing workflow state', async () => {
    const user = makeUser({
      comparePassword: jest.fn().mockResolvedValue(false),
    });
    const harness = makeHarness({ user });

    await expect(harness.service.requestDeletion({
      userId: USER_ID,
      password: 'WrongPass123',
    })).rejects.toMatchObject({
      code: 'ACCOUNT_PASSWORD_INVALID',
      statusCode: 400,
    });

    expect(harness.DeletionRequestModel.findOne).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
    expect(harness.DeletionRequestModel.create).not.toHaveBeenCalled();
    expect(harness.appendEvent).not.toHaveBeenCalled();
  });

  test('requires verified reset-established password auth for social-only accounts', async () => {
    const user = makeUser({
      passwordAuthEnabled: false,
      socialAuth: { googleSub: 'google-subject' },
    });
    const harness = makeHarness({ user });

    await expect(harness.service.requestDeletion({
      userId: USER_ID,
      password: 'UnknownGeneratedPassword123',
    })).rejects.toMatchObject({
      code: 'ACCOUNT_PASSWORD_SETUP_REQUIRED',
      statusCode: 409,
    });

    expect(user.comparePassword).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
    expect(harness.DeletionRequestModel.create).not.toHaveBeenCalled();
  });

  test('fails closed for an inactive account missing its deletion request', async () => {
    const user = makeUser({ isActive: false });
    const harness = makeHarness({ user });

    await expect(harness.service.requestDeletion({
      userId: USER_ID,
      password: 'CorrectPass123',
    })).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_STATE_INVALID',
      statusCode: 409,
    });

    expect(user.save).not.toHaveBeenCalled();
    expect(harness.appendEvent).not.toHaveBeenCalled();
  });

  test('does not reopen a completed deletion review on an active account', async () => {
    const user = makeUser();
    const harness = makeHarness({
      user,
      deletionRequest: {
        _id: REQUEST_ID,
        user: USER_ID,
        requestedAt: NOW,
        status: 'completed',
      },
    });

    await expect(harness.service.requestDeletion({
      userId: USER_ID,
      password: 'CorrectPass123',
    })).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_STATE_INVALID',
      statusCode: 409,
    });

    expect(user.save).not.toHaveBeenCalled();
    expect(harness.appendEvent).not.toHaveBeenCalled();
  });
});
