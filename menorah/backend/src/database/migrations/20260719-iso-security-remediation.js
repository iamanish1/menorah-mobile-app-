const Payout = require('../../models/Payout');
const KycVerification = require('../../models/KycVerification');
const DataDeletionRequest = require('../../models/DataDeletionRequest');
const Counsellor = require('../../models/Counsellor');
const { encryptBankAccountNumber } = require('../../utils/bankAccountEncryption');
const { FACE_CHECK_RETENTION_DAYS } = require('../../config/kyc');

const ACTIVE_PAYOUT_STATUSES = ['awaiting_approval', 'processing', 'queued', 'pending', 'on_hold'];

const getRetentionDays = () => {
  const raw = String(process.env.KYC_RETENTION_DAYS || '').trim();
  const days = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(days) || days !== FACE_CHECK_RETENTION_DAYS) {
    throw new Error(`KYC_RETENTION_DAYS must equal ${FACE_CHECK_RETENTION_DAYS} before migration`);
  }
  return days;
};

const assertPayoutUniquenessPreconditions = async () => {
  const duplicateActivePayouts = await Payout.aggregate([
    { $match: { status: { $in: ACTIVE_PAYOUT_STATUSES } } },
    { $group: { _id: '$counsellor', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]);
  if (duplicateActivePayouts.length) {
    throw new Error('Duplicate active payouts must be reconciled under finance approval before migration');
  }

  const duplicateIdempotencyKeys = await Payout.aggregate([
    { $match: { idempotencyKey: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$idempotencyKey', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]);
  if (duplicateIdempotencyKeys.length) {
    throw new Error('Duplicate payout idempotency keys must be reconciled before migration');
  }

  const duplicateProviderIds = await Payout.aggregate([
    { $match: { razorpayPayoutId: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$razorpayPayoutId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]);
  if (duplicateProviderIds.length) {
    throw new Error('Duplicate Razorpay payout IDs must be reconciled before migration');
  }
};

const reconcilePayoutProviderIndex = async () => {
  let indexes;
  try {
    indexes = await Payout.collection.indexes();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') {
      indexes = [];
    } else {
      throw error;
    }
  }
  const existing = indexes.find((index) => (
    index.key?.razorpayPayoutId === 1 && Object.keys(index.key).length === 1
  ));
  const isDesiredIndex = existing?.unique === true
    && existing?.partialFilterExpression?.razorpayPayoutId?.$type === 'string';
  if (existing && !isDesiredIndex) {
    await Payout.collection.dropIndex(existing.name);
  }
};

module.exports = {
  async up() {
    const retentionDays = getRetentionDays();
    const now = new Date();
    await assertPayoutUniquenessPreconditions();

    // Existing payout records predate request idempotency. Give each a stable,
    // non-secret legacy value before creating the unique index.
    const legacyPayouts = await Payout.find({
      $or: [
        { idempotencyKey: { $exists: false } },
        { idempotencyKey: null },
        { idempotencyKey: '' },
      ],
    }).select('_id').lean();
    if (legacyPayouts.length) {
      await Payout.collection.bulkWrite(legacyPayouts.map(({ _id }) => ({
        updateOne: {
          filter: { _id },
          update: { $set: { idempotencyKey: `legacy-${_id.toString()}` } },
        },
      })));
    }

    const legacyBankAccounts = await Counsellor.find({
      'bankDetails.accountNumber': { $type: 'string' },
    }).select('+bankDetails.accountNumber +bankDetails.accountNumberEncrypted').lean();
    if (legacyBankAccounts.length) {
      await Counsellor.collection.bulkWrite(legacyBankAccounts.map((counsellor) => {
        const accountNumber = String(counsellor.bankDetails?.accountNumber || '').trim();
        if (!/^\d{9,18}$/.test(accountNumber)) {
          throw new Error('A legacy bank account number is invalid; migration stopped before removing plaintext');
        }
        const alreadyEncrypted = Boolean(counsellor.bankDetails?.accountNumberEncrypted);
        return {
          updateOne: {
            filter: { _id: counsellor._id },
            update: {
              $set: {
                'bankDetails.accountNumberEncrypted': alreadyEncrypted
                  ? counsellor.bankDetails.accountNumberEncrypted
                  : encryptBankAccountNumber(accountNumber),
                'bankDetails.accountNumberLast4': accountNumber.slice(-4),
              },
              $unset: { 'bankDetails.accountNumber': '' },
            },
          },
        };
      }));
    }

    await KycVerification.updateMany(
      { $or: [{ consentVersion: { $exists: false } }, { consentVersion: null }, { consentVersion: '' }] },
      { $set: { consentVersion: 'legacy' } }
    );
    await KycVerification.updateMany(
      { $or: [{ consentAcceptedAt: { $exists: false } }, { consentAcceptedAt: null }] },
      [{ $set: { consentAcceptedAt: { $ifNull: ['$submittedAt', '$createdAt'] } } }]
    );
    await KycVerification.updateMany(
      { $or: [{ retentionExpiresAt: { $exists: false } }, { retentionExpiresAt: null }] },
      [{
        $set: {
          retentionExpiresAt: {
            $dateAdd: {
              startDate: { $ifNull: ['$consentAcceptedAt', '$submittedAt', '$createdAt', now] },
              unit: 'day',
              amount: retentionDays,
            },
          },
        },
      }]
    );
    await KycVerification.updateMany(
      { $or: [{ legalHold: { $exists: false } }, { legalHold: null }] },
      { $set: { legalHold: false } }
    );

    // The old unique index included null values. Replace it only after the
    // duplicate preflight so multiple approval requests can safely have no
    // provider ID until they are submitted.
    await reconcilePayoutProviderIndex();
    await Promise.all([
      Payout.createIndexes(),
      KycVerification.createIndexes(),
      DataDeletionRequest.createIndexes(),
    ]);
  },
  getRetentionDays,
  assertPayoutUniquenessPreconditions,
  reconcilePayoutProviderIndex,
};
