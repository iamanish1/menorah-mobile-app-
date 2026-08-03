const PrivacyConsentState = require('../../models/PrivacyConsentState');
const PrivacyEvent = require('../../models/PrivacyEvent');
const PrivacyRightsRequest = require('../../models/PrivacyRightsRequest');
const User = require('../../models/User');
const {
  purgePersistedPrivacyPermissions,
} = require('../../services/privacyAdminPermissionAuthority');
const {
  buildConsentTransitionIdentity,
} = require('../../services/privacyConsentService');
const {
  hashIdempotencyKey,
  verifyPrivacyEventOperation,
} = require('../../services/privacyEventService');

const MIGRATION_VERSION = '20260723-privacy-state-authorization-v1';
const CONSENT_EVENT_TYPES = [
  'privacy_notice_accepted',
  'privacy_notice_withdrawn',
];

const rightsWorkflowVersionUpdate = () => ({
  $set: {
    workflowVersion: { $ifNull: ['$workflowVersion', 1] },
  },
});

const userSecurityBackfill = () => ({
  $set: {
    passwordAuthEnabled: {
      $cond: [
        {
          $and: [
            {
              $or: [
                { $eq: [{ $type: '$socialAuth.googleSub' }, 'string'] },
                { $eq: [{ $type: '$socialAuth.appleSub' }, 'string'] },
              ],
            },
            { $eq: [{ $ifNull: ['$lastPasswordChangeAt', null] }, null] },
          ],
        },
        false,
        { $ifNull: ['$passwordAuthEnabled', true] },
      ],
    },
  },
});

const collectConsentStateBackfill = async () => {
  const latestByUser = new Map();
  const cursor = PrivacyEvent.find({
    eventType: { $in: CONSENT_EVENT_TYPES },
  })
    .select('+idempotencyKeyHash +clientIdempotencyKeyHash')
    .sort({ subjectUser: 1, occurredAt: -1, _id: -1 })
    .lean()
    .cursor({ batchSize: 100 });
  for await (const event of cursor) {
    const subjectUser = String(event.subjectUser);
    if (latestByUser.has(subjectUser)) continue;
    const transitionIdentityHash = buildConsentTransitionIdentity({
      subjectUser: event.subjectUser,
      action: event.consentAction,
      noticeVersion: event.noticeVersion,
      predecessorId: event.predecessorEventId,
    });
    const idempotencyKeyHash = hashIdempotencyKey({
      subjectUser: event.subjectUser,
      idempotencyKey: `privacy-consent:${transitionIdentityHash}`,
    });
    const verification = verifyPrivacyEventOperation(event, {
      evidenceVersion: 'v2',
      eventType: event.eventType,
      subjectUser: event.subjectUser,
      noticeVersion: event.noticeVersion,
      consentAction: event.consentAction,
      idempotencyKeyHash,
      predecessorEventId: event.predecessorEventId || null,
      transitionIdentityHash,
    });
    if (!verification.valid) {
      const error = new Error(
        'Existing consent evidence must be repaired before state backfill.'
      );
      error.code = 'PRIVACY_CONSENT_EVIDENCE_UPGRADE_REQUIRED';
      throw error;
    }
    latestByUser.set(subjectUser, {
      subjectUser: event.subjectUser,
      currentEvent: event._id,
      action: event.consentAction,
      noticeVersion: event.noticeVersion,
      version: 0,
    });
  }
  return [...latestByUser.values()];
};

module.exports = {
  MIGRATION_VERSION,
  async up() {
    const consentStates = await collectConsentStateBackfill();

    await Promise.all([
      PrivacyConsentState.createIndexes(),
      PrivacyEvent.createIndexes(),
      PrivacyRightsRequest.createIndexes(),
    ]);
    await purgePersistedPrivacyPermissions({ UserModel: User });
    await Promise.all([
      PrivacyRightsRequest.updateMany({}, [rightsWorkflowVersionUpdate()]),
      User.updateMany({}, [userSecurityBackfill()]),
    ]);
    if (consentStates.length) {
      await PrivacyConsentState.bulkWrite(consentStates.map((state) => ({
        updateOne: {
          filter: { subjectUser: state.subjectUser },
          update: { $setOnInsert: state },
          upsert: true,
        },
      })));
    }
  },
  collectConsentStateBackfill,
  rightsWorkflowVersionUpdate,
  userSecurityBackfill,
};
