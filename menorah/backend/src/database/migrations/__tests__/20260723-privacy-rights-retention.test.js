const {
  MIGRATION_VERSION,
  legacyDeletionUpdate,
} = require('../20260723-privacy-rights-retention');
const DataDeletionRequest = require('../../../models/DataDeletionRequest');
const PrivacyEvent = require('../../../models/PrivacyEvent');
const PrivacyRightsRequest = require('../../../models/PrivacyRightsRequest');

describe('privacy rights and retention migration', () => {
  test('backfills only structural workflow defaults without inventing disposition evidence', () => {
    expect(legacyDeletionUpdate()).toEqual({
      $set: {
        workflowVersion: { $ifNull: ['$workflowVersion', 1] },
        legalHold: { $ifNull: ['$legalHold', false] },
      },
    });
    const serialized = JSON.stringify(legacyDeletionUpdate());
    expect(serialized).not.toContain('completedAt');
    expect(serialized).not.toContain('reviewedBy');
    expect(serialized).not.toContain('resolutionEvidenceReference');
  });

  test('defines stable unique and retention sweep indexes', () => {
    const eventIndexes = PrivacyEvent.schema.indexes();
    const requestIndexes = PrivacyRightsRequest.schema.indexes();
    const deletionIndexes = DataDeletionRequest.schema.indexes();

    expect(eventIndexes).toEqual(expect.arrayContaining([
      [
        { idempotencyKeyHash: 1 },
        expect.objectContaining({
          unique: true,
          name: 'privacy_event_idempotency_unique_v1',
        }),
      ],
    ]));
    expect(requestIndexes).toEqual(expect.arrayContaining([
      [
        {
          status: 1,
          'legalHold.active': 1,
          'retention.dueAt': 1,
          _id: 1,
        },
        expect.objectContaining({ name: 'privacy_request_retention_sweep_v1' }),
      ],
    ]));
    expect(deletionIndexes).toEqual(expect.arrayContaining([
      [
        { status: 1, legalHold: 1, retentionReviewAfter: 1, _id: 1 },
        expect.objectContaining({ name: 'deletion_request_review_queue_v1' }),
      ],
    ]));
  });

  test('uses an explicit migration version without implying policy approval', () => {
    expect(MIGRATION_VERSION).toBe('20260723-privacy-rights-retention-v1');
    expect(MIGRATION_VERSION).not.toMatch(/approved|compliant|certified/i);
  });
});
