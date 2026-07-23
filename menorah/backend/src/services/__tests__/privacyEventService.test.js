const mongoose = require('mongoose');
const {
  createPrivacyEventAppender,
  hashIdempotencyKey,
  stableEvidencePayload,
  verifyPrivacyEventEvidence,
  verifyPrivacyEventOperation,
} = require('../privacyEventService');
const PrivacyEvent = require('../../models/PrivacyEvent');

describe('privacy append-only event evidence', () => {
  const originalKey = process.env.AUDIT_LOG_SIGNING_KEY;

  beforeEach(() => {
    process.env.AUDIT_LOG_SIGNING_KEY = 'unit-only-privacy-audit-signing-key';
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.AUDIT_LOG_SIGNING_KEY;
    else process.env.AUDIT_LOG_SIGNING_KEY = originalKey;
  });

  test('signs only bounded workflow metadata and saves a new event', async () => {
    const saved = [];
    class FakeEvent {
      constructor(value) {
        Object.assign(this, value);
      }

      async save(options) {
        saved.push({ event: this, options });
      }
    }
    const append = createPrivacyEventAppender({
      PrivacyEventModel: FakeEvent,
      mongooseInstance: mongoose,
    });
    const event = await append({
      eventType: 'rights_request_submitted',
      actor: '64f000000000000000000001',
      actorRole: 'user',
      subjectUser: '64f000000000000000000001',
      requestType: 'correction',
      requestId: '64f000000000000000000002',
      source: 'api-web',
      toStatus: 'submitted',
      idempotencyKey: 'request-key-0001',
      clientIdempotencyKey: 'client-request-key-0001',
    });

    expect(event.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved).toHaveLength(1);
    expect(stableEvidencePayload(event)).not.toMatch(/description|email|phone/i);
    expect(verifyPrivacyEventEvidence(event)).toEqual({ valid: true });
    expect(verifyPrivacyEventOperation(event, {
      evidenceVersion: 'v2',
      eventType: 'rights_request_submitted',
      subjectUser: '64f000000000000000000001',
      requestType: 'correction',
      requestId: '64f000000000000000000002',
      idempotencyKeyHash: event.idempotencyKeyHash,
      clientIdempotencyKeyHash: event.clientIdempotencyKeyHash,
      toStatus: 'submitted',
    })).toEqual({ valid: true });
    expect(verifyPrivacyEventEvidence({
      ...event,
      toStatus: 'completed',
    })).toEqual({
      valid: false,
      reason: 'evidence_hash_mismatch',
    });
    expect(verifyPrivacyEventEvidence({
      ...event,
      idempotencyKeyHash: '0'.repeat(64),
    })).toEqual({
      valid: false,
      reason: 'evidence_hash_mismatch',
    });
    expect(verifyPrivacyEventOperation(event, {
      eventType: 'rights_request_submitted',
      subjectUser: '64f000000000000000000001',
      requestType: 'grievance',
    })).toEqual({
      valid: false,
      reason: 'operation_identity_mismatch',
      field: 'requestType',
    });
  });

  test('scopes idempotency hashes to the subject without retaining the key', () => {
    const first = hashIdempotencyKey({
      subjectUser: 'user-a',
      idempotencyKey: 'request-key-0001',
    });
    const second = hashIdempotencyKey({
      subjectUser: 'user-b',
      idempotencyKey: 'request-key-0001',
    });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
    expect(first).not.toContain('request-key');
  });

  test('classifies an invalid client idempotency key as a bad request', () => {
    expect(() => hashIdempotencyKey({
      subjectUser: 'user-a',
      idempotencyKey: 'bad key',
    })).toThrow(expect.objectContaining({
      code: 'PRIVACY_IDEMPOTENCY_KEY_INVALID',
      statusCode: 400,
    }));
  });

  test('fails closed without the audit signing key', async () => {
    delete process.env.AUDIT_LOG_SIGNING_KEY;
    class FakeEvent {
      constructor(value) {
        Object.assign(this, value);
      }

      save = jest.fn();
    }
    const append = createPrivacyEventAppender({
      PrivacyEventModel: FakeEvent,
      mongooseInstance: mongoose,
    });
    await expect(append({
      eventType: 'privacy_notice_accepted',
      actor: '64f000000000000000000001',
      actorRole: 'user',
      subjectUser: '64f000000000000000000001',
      noticeVersion: 'unit-v1',
      consentAction: 'accepted',
      source: 'api-web',
    })).rejects.toMatchObject({ code: 'PRIVACY_AUDIT_NOT_CONFIGURED' });
  });

  test('registers application-level mutation guards for audit events', () => {
    [
      'updateOne',
      'updateMany',
      'findOneAndUpdate',
      'findOneAndReplace',
      'replaceOne',
      'deleteOne',
      'deleteMany',
      'findOneAndDelete',
    ].forEach((operation) => {
      expect(PrivacyEvent.schema.s.hooks.hasHooks(operation)).toBe(true);
    });
    expect(PrivacyEvent.schema.s.hooks.hasHooks('bulkWrite')).toBe(true);
    expect(PrivacyEvent.schema.s.hooks.hasHooks('insertMany')).toBe(true);
    expect(PrivacyEvent.schema.path('evidenceHash').options.immutable).toBe(true);
    expect(PrivacyEvent.schema.path('evidenceVersion').options.immutable).toBe(true);
  });
});
