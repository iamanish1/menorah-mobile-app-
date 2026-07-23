const {
  createPrivacyRightsWorkflow,
  hashActiveKey,
  normalizeSubmission,
  serializeDeletionRequest,
  serializeRightsRequest,
} = require('../privacyRightsWorkflow');

const USER_ID = '64f000000000000000000001';
const ADMIN_ID = '64f000000000000000000002';
const REQUEST_ID = '64f000000000000000000003';
const NOW = new Date('2026-07-23T10:00:00.000Z');

const queryResult = (value) => {
  const query = {
    select: jest.fn(() => query),
    sort: jest.fn(() => query),
    limit: jest.fn(() => query),
    session: jest.fn(() => query),
    lean: jest.fn(async () => value),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

const validReplayEvidence = () => ({
  PrivacyEventModel: {
    findOne: jest.fn(() => queryResult({ _id: 'signed-event' })),
  },
  verifyEvent: jest.fn(() => ({ valid: true })),
});

describe('privacy rights workflow', () => {
  test('uses a strict bounded export scope and validates correction/grievance detail', () => {
    expect(normalizeSubmission({
      requestType: 'export',
      body: {},
    })).toEqual(expect.objectContaining({
      scope: 'account_data',
      payload: { deliveryInstructions: 'manual_secure_delivery_required' },
    }));
    expect(() => normalizeSubmission({
      requestType: 'export',
      body: { scope: 'all_platform_data' },
    })).toThrow(/bounded account-data/);
    expect(normalizeSubmission({
      requestType: 'correction',
      body: {
        correctionFields: ['name', 'email'],
        description: 'Please correct these two account fields.',
      },
    }).correctionFields).toEqual(['name', 'email']);
    expect(() => normalizeSubmission({
      requestType: 'grievance',
      body: { description: 'short' },
    })).toThrow(/between 10 and 4000/);
  });

  test('does not serialize encrypted payload, reviewer identity, or evidence reference', () => {
    const serialized = serializeRightsRequest({
      _id: REQUEST_ID,
      requestType: 'correction',
      status: 'submitted',
      source: 'api-web',
      correctionFields: ['email'],
      contactChannel: 'in_app',
      submittedAt: NOW,
      payloadEncrypted: 'v1:sensitive',
      reviewedBy: ADMIN_ID,
      resolutionEvidenceReference: 'private-case-reference',
      legalHold: { active: false },
      retention: {},
    });
    expect(serialized).not.toHaveProperty('payloadEncrypted');
    expect(serialized).not.toHaveProperty('reviewedBy');
    expect(serialized).not.toHaveProperty('resolutionEvidenceReference');

    expect(serializeDeletionRequest({
      _id: REQUEST_ID,
      status: 'pending',
      requestedAt: NOW,
      accountDeactivatedAt: NOW,
      retentionReviewAfter: NOW,
      reviewNotes: 'sensitive',
    })).not.toHaveProperty('reviewNotes');
  });

  test('scopes active-request uniqueness to user and type', () => {
    expect(hashActiveKey({ userId: USER_ID, requestType: 'export' }))
      .toMatch(/^[a-f0-9]{64}$/);
    expect(hashActiveKey({ userId: USER_ID, requestType: 'export' }))
      .not.toBe(hashActiveKey({ userId: USER_ID, requestType: 'grievance' }));
  });

  test('stores correction text only through the encrypted payload field', async () => {
    const sensitive = 'Please correct a sensitive account detail.';
    const create = jest.fn(async ([document]) => [{ ...document }]);
    const encryptPayload = jest.fn(() => 'v1:encrypted-envelope');
    const appendEvent = jest.fn();
    const workflow = createPrivacyRightsWorkflow({
      RightsRequestModel: {
        findOne: jest.fn(() => queryResult(null)),
        create,
      },
      encryptPayload,
      appendEvent,
      transactionRunner: async (work) => work(null),
    });

    await workflow.submitRequest({
      user: { _id: USER_ID, role: 'user' },
      requestType: 'correction',
      body: {
        correctionFields: ['other'],
        description: sensitive,
      },
      source: 'api-web',
    });

    expect(encryptPayload).toHaveBeenCalledWith(
      { description: sensitive },
      expect.objectContaining({
        context: expect.stringMatching(/^privacy-request:/),
      })
    );
    const stored = create.mock.calls[0][0][0];
    expect(stored.payloadEncrypted).toBe('v1:encrypted-envelope');
    expect(JSON.stringify(stored)).not.toContain(sensitive);
    expect(JSON.stringify(appendEvent.mock.calls)).not.toContain(sensitive);
  });

  test('returns an exact idempotent replay without exposing its encrypted payload', async () => {
    const description = 'Please correct the email on my account.';
    const existing = {
      _id: REQUEST_ID,
      user: USER_ID,
      requestType: 'correction',
      status: 'submitted',
      source: 'api-web',
      scope: null,
      correctionFields: ['email'],
      contactChannel: 'in_app',
      payloadEncrypted: 'v1:encrypted-envelope',
      submittedAt: NOW,
    };
    const findOne = jest.fn(() => queryResult(existing));
    const decryptPayload = jest.fn(() => ({ description }));
    const workflow = createPrivacyRightsWorkflow({
      ...validReplayEvidence(),
      RightsRequestModel: { findOne, create: jest.fn() },
      decryptPayload,
    });

    const result = await workflow.submitRequest({
      user: { _id: USER_ID, role: 'user' },
      requestType: 'correction',
      body: {
        correctionFields: ['email'],
        description,
      },
      source: 'api-web',
      idempotencyKey: 'rights-request-key-0001',
      now: NOW,
    });

    expect(result.created).toBe(false);
    expect(result.request).toMatchObject({
      _id: REQUEST_ID,
      requestType: 'correction',
    });
    expect(result.request).not.toHaveProperty('payloadEncrypted');
    expect(result.request).not.toHaveProperty('idempotencyKeyHash');
    expect(decryptPayload).toHaveBeenCalledWith(
      'v1:encrypted-envelope',
      { context: `privacy-request:${REQUEST_ID}` }
    );
    expect(findOne.mock.calls[0][0]).toEqual({
      idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  test('rejects reuse of an idempotency key for another request type', async () => {
    const decryptPayload = jest.fn();
    const workflow = createPrivacyRightsWorkflow({
      ...validReplayEvidence(),
      RightsRequestModel: {
        findOne: jest.fn(() => queryResult({
          _id: REQUEST_ID,
          user: USER_ID,
          requestType: 'export',
          status: 'submitted',
          scope: 'account_data',
          correctionFields: [],
          contactChannel: 'in_app',
          payloadEncrypted: 'v1:encrypted-envelope',
        })),
      },
      decryptPayload,
    });

    await expect(workflow.submitRequest({
      user: { _id: USER_ID, role: 'user' },
      requestType: 'grievance',
      body: {
        description: 'Please investigate this privacy concern.',
      },
      source: 'api-web',
      idempotencyKey: 'rights-request-key-0002',
      now: NOW,
    })).rejects.toMatchObject({
      code: 'PRIVACY_IDEMPOTENCY_KEY_REUSED',
      statusCode: 409,
    });
    expect(decryptPayload).not.toHaveBeenCalled();
  });

  test('rejects reuse of an idempotency key for a different request body', async () => {
    const workflow = createPrivacyRightsWorkflow({
      ...validReplayEvidence(),
      RightsRequestModel: {
        findOne: jest.fn(() => queryResult({
          _id: REQUEST_ID,
          user: USER_ID,
          requestType: 'grievance',
          status: 'submitted',
          scope: null,
          correctionFields: [],
          contactChannel: 'email',
          payloadEncrypted: 'v1:encrypted-envelope',
        })),
      },
      decryptPayload: jest.fn(() => ({
        description: 'The originally submitted privacy concern.',
      })),
    });

    await expect(workflow.submitRequest({
      user: { _id: USER_ID, role: 'user' },
      requestType: 'grievance',
      body: {
        contactChannel: 'email',
        description: 'A different privacy concern using the same key.',
      },
      source: 'api-web',
      idempotencyKey: 'rights-request-key-0003',
      now: NOW,
    })).rejects.toMatchObject({
      code: 'PRIVACY_IDEMPOTENCY_KEY_REUSED',
      statusCode: 409,
    });
  });

  test('rejects a different body while the same request type remains active', async () => {
    const create = jest.fn();
    const workflow = createPrivacyRightsWorkflow({
      ...validReplayEvidence(),
      RightsRequestModel: {
        findOne: jest.fn(() => queryResult({
          _id: REQUEST_ID,
          user: USER_ID,
          requestType: 'correction',
          status: 'submitted',
          scope: null,
          correctionFields: ['email'],
          contactChannel: 'in_app',
          payloadEncrypted: 'v1:encrypted-envelope',
        })),
        create,
      },
      decryptPayload: jest.fn(() => ({
        description: 'Please correct the originally submitted email.',
      })),
    });

    await expect(workflow.submitRequest({
      user: { _id: USER_ID, role: 'user' },
      requestType: 'correction',
      body: {
        correctionFields: ['email'],
        description: 'Please record this different email correction.',
      },
      source: 'api-web',
    })).rejects.toMatchObject({
      code: 'PRIVACY_ACTIVE_REQUEST_CONFLICT',
      statusCode: 409,
    });
    expect(create).not.toHaveBeenCalled();
  });

  test('replays an equivalent active request without discarding new evidence', async () => {
    const description = 'Please review this active privacy grievance.';
    const existing = {
      _id: REQUEST_ID,
      user: USER_ID,
      requestType: 'grievance',
      status: 'under_review',
      scope: null,
      correctionFields: [],
      contactChannel: 'email',
      payloadEncrypted: 'v1:encrypted-envelope',
    };
    const workflow = createPrivacyRightsWorkflow({
      ...validReplayEvidence(),
      RightsRequestModel: {
        findOne: jest.fn(() => queryResult(existing)),
      },
      decryptPayload: jest.fn(() => ({ description })),
    });

    await expect(workflow.submitRequest({
      user: { _id: USER_ID, role: 'user' },
      requestType: 'grievance',
      body: { description, contactChannel: 'email' },
      source: 'api-web',
    })).resolves.toEqual({
      request: expect.objectContaining({
        _id: REQUEST_ID,
        status: 'under_review',
      }),
      created: false,
    });
  });

  test('rejects a mismatched replay after a concurrent unique-key race', async () => {
    const findOne = jest.fn()
      .mockImplementationOnce(() => queryResult(null))
      .mockImplementationOnce(() => queryResult(null))
      .mockImplementationOnce(() => queryResult({
        _id: REQUEST_ID,
        user: USER_ID,
        requestType: 'correction',
        status: 'submitted',
        scope: null,
        correctionFields: ['email'],
        contactChannel: 'in_app',
        payloadEncrypted: 'v1:encrypted-envelope',
      }));
    const duplicateError = new Error('duplicate');
    duplicateError.code = 11000;
    const workflow = createPrivacyRightsWorkflow({
      ...validReplayEvidence(),
      RightsRequestModel: {
        findOne,
        create: jest.fn().mockRejectedValue(duplicateError),
      },
      encryptPayload: jest.fn(() => 'v1:new-envelope'),
      decryptPayload: jest.fn(() => ({
        description: 'The request that won the race.',
      })),
      transactionRunner: async (work) => work(null),
    });

    await expect(workflow.submitRequest({
      user: { _id: USER_ID, role: 'user' },
      requestType: 'correction',
      body: {
        correctionFields: ['email'],
        description: 'The request that lost the race.',
      },
      source: 'api-web',
      idempotencyKey: 'rights-request-key-0004',
      now: NOW,
    })).rejects.toMatchObject({
      code: 'PRIVACY_IDEMPOTENCY_KEY_REUSED',
      statusCode: 409,
    });
    expect(findOne).toHaveBeenCalledTimes(3);
  });

  test('requires exact ownership for user request and deletion lookups', async () => {
    const rightsFindOne = jest.fn(() => queryResult(null));
    const deletionFindOne = jest.fn(() => queryResult(null));
    const workflow = createPrivacyRightsWorkflow({
      RightsRequestModel: { findOne: rightsFindOne },
      DeletionRequestModel: { findOne: deletionFindOne },
    });

    await workflow.getOwnRequest({ userId: USER_ID, requestId: REQUEST_ID });
    await workflow.getOwnDeletionRequest({ userId: USER_ID, requestId: REQUEST_ID });

    expect(rightsFindOne).toHaveBeenCalledWith({ _id: REQUEST_ID, user: USER_ID });
    expect(deletionFindOne).toHaveBeenCalledWith({ _id: REQUEST_ID, user: USER_ID });
  });

  test('repeats the no-legal-hold predicate when completing deletion review', async () => {
    const current = {
      _id: REQUEST_ID,
      user: USER_ID,
      status: 'under_review',
      legalHold: false,
      workflowVersion: 4,
    };
    const findOneAndUpdate = jest.fn(() => queryResult({
      ...current,
      status: 'completed',
      completedAt: NOW,
    }));
    const appendEvent = jest.fn();
    const workflow = createPrivacyRightsWorkflow({
      DeletionRequestModel: {
        findById: jest.fn(() => queryResult(current)),
        findOneAndUpdate,
      },
      appendEvent,
      transactionRunner: async (work) => work(null),
    });

    await workflow.transitionDeletionRequest({
      requestId: REQUEST_ID,
      admin: { _id: ADMIN_ID },
      toStatus: 'completed',
      evidenceReference: 'case-evidence-0001',
      source: 'api-admin',
      now: NOW,
    });

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: REQUEST_ID,
        status: 'under_review',
        legalHold: { $ne: true },
        workflowVersion: 4,
      },
      expect.objectContaining({
        $set: expect.objectContaining({ completedAt: NOW }),
      }),
      expect.objectContaining({ new: true })
    );
    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'deletion_request_status_changed',
      fromStatus: 'under_review',
      toStatus: 'completed',
    }));
  });

  test('fails closed if a hold races deletion completion', async () => {
    const workflow = createPrivacyRightsWorkflow({
      DeletionRequestModel: {
        findById: jest.fn(() => queryResult({
          _id: REQUEST_ID,
          user: USER_ID,
          status: 'under_review',
          legalHold: false,
          workflowVersion: 2,
        })),
        findOneAndUpdate: jest.fn(() => queryResult(null)),
      },
      appendEvent: jest.fn(),
      transactionRunner: async (work) => work(null),
    });

    await expect(workflow.transitionDeletionRequest({
      requestId: REQUEST_ID,
      admin: { _id: ADMIN_ID },
      toStatus: 'completed',
      evidenceReference: 'case-evidence-0001',
      source: 'api-admin',
      now: NOW,
    })).rejects.toMatchObject({ code: 'DELETION_REQUEST_HELD_OR_CHANGED' });
  });

  test('applies a legal hold with compare-and-set and append-only evidence', async () => {
    const current = {
      _id: REQUEST_ID,
      user: USER_ID,
      requestType: 'grievance',
      status: 'under_review',
      legalHold: { active: false },
      workflowVersion: 3,
      retention: { payloadDisposedAt: null },
    };
    const findOneAndUpdate = jest.fn(() => queryResult({
      ...current,
      legalHold: { active: true },
    }));
    const appendEvent = jest.fn();
    const workflow = createPrivacyRightsWorkflow({
      RightsRequestModel: {
        findById: jest.fn(() => queryResult(current)),
        findOneAndUpdate,
      },
      appendEvent,
      transactionRunner: async (work) => work(null),
    });

    await workflow.setLegalHold({
      kind: 'rights',
      requestId: REQUEST_ID,
      admin: { _id: ADMIN_ID },
      action: 'apply',
      policyReference: 'hold-policy-0001',
      source: 'api-admin',
      now: NOW,
    });

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: REQUEST_ID,
        'legalHold.active': { $ne: true },
        workflowVersion: 3,
        'retention.payloadDisposedAt': null,
      },
      {
        $set: expect.objectContaining({
          'legalHold.active': true,
          'legalHold.setAt': NOW,
          'legalHold.setBy': ADMIN_ID,
          'legalHold.policyReference': 'hold-policy-0001',
        }),
        $inc: { workflowVersion: 1 },
      },
      expect.objectContaining({ new: true })
    );
    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'legal_hold_applied',
      requestId: REQUEST_ID,
      policyVersion: 'hold-policy-0001',
    }));
  });

  test('explicitly rejects applying a hold after payload disposition', async () => {
    const findOneAndUpdate = jest.fn();
    const workflow = createPrivacyRightsWorkflow({
      RightsRequestModel: {
        findById: jest.fn(() => queryResult({
          _id: REQUEST_ID,
          user: USER_ID,
          requestType: 'grievance',
          status: 'completed',
          workflowVersion: 4,
          legalHold: { active: false },
          retention: { payloadDisposedAt: NOW },
        })),
        findOneAndUpdate,
      },
      appendEvent: jest.fn(),
      transactionRunner: async (work) => work(null),
    });

    await expect(workflow.setLegalHold({
      kind: 'rights',
      requestId: REQUEST_ID,
      admin: { _id: ADMIN_ID },
      action: 'apply',
      policyReference: 'hold-policy-0001',
      source: 'api-admin',
      now: NOW,
    })).rejects.toMatchObject({
      code: 'LEGAL_HOLD_PAYLOAD_ALREADY_DISPOSED',
      statusCode: 409,
    });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('sets a due date only from an explicit configured retention period', async () => {
    const current = {
      _id: REQUEST_ID,
      user: USER_ID,
      requestType: 'export',
      status: 'under_review',
      workflowVersion: 1,
    };
    const findOneAndUpdate = jest.fn(() => queryResult({
      ...current,
      status: 'completed',
    }));
    const workflow = createPrivacyRightsWorkflow({
      RightsRequestModel: {
        findById: jest.fn(() => queryResult(current)),
        findOneAndUpdate,
      },
      appendEvent: jest.fn(),
      readConfig: () => ({
        retentionPolicy: {
          version: 'approved-retention-v1',
          categories: {
            privacy_rights_request_payload: { retentionDays: 12 },
          },
        },
      }),
      transactionRunner: async (work) => work(null),
    });

    await workflow.transitionRightsRequest({
      requestId: REQUEST_ID,
      admin: { _id: ADMIN_ID },
      toStatus: 'completed',
      evidenceReference: 'case-evidence-0001',
      source: 'api-admin',
      now: NOW,
    });

    expect(findOneAndUpdate.mock.calls[0][1].$set['retention.dueAt'])
      .toEqual(new Date(NOW.getTime() + 12 * 24 * 60 * 60 * 1000));
    expect(findOneAndUpdate.mock.calls[0][1].$set['retention.policyVersion'])
      .toBe('approved-retention-v1');
  });
});
