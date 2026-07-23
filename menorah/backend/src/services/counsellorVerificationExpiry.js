const Counsellor = require('../models/Counsellor');
const {
  expire: expireCounsellorVerification,
} = require('./counsellorVerificationService');
const {
  isCounsellorProfessionallyApproved,
} = require('./counsellorVerificationPolicy');

const DEFAULT_EXPIRY_RECONCILIATION_BATCH_SIZE = 50;
const MAX_EXPIRY_RECONCILIATION_BATCH_SIZE = 100;

const normalizeBatchSize = (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return DEFAULT_EXPIRY_RECONCILIATION_BATCH_SIZE;
  }
  return Math.min(parsed, MAX_EXPIRY_RECONCILIATION_BATCH_SIZE);
};

const dueVerificationFilter = (now, extraFilter = {}) => ({
  ...extraFilter,
  status: 'approved',
  'professionalVerification.expiresAt': {
    $type: 'date',
    $lte: now,
  },
});

const toId = (value) => String(value?._id || value || '');

const createCounsellorVerificationExpiryReconciler = ({
  CounsellorModel = Counsellor,
  expireVerification = expireCounsellorVerification,
  eligibilityEvaluator = isCounsellorProfessionallyApproved,
  nowProvider = () => new Date(),
} = {}) => {
  const reconcileOne = async ({
    counsellorId,
    now = nowProvider(),
  }) => {
    const dueCounsellor = await CounsellorModel.findOne(
      dueVerificationFilter(now, { _id: counsellorId })
    )
      .select('_id')
      .lean();

    if (!dueCounsellor) {
      return {
        counsellorId: toId(counsellorId),
        outcome: 'not_due',
      };
    }

    try {
      const result = await expireVerification({
        counsellorId: dueCounsellor._id,
        now,
      });
      return {
        counsellorId: toId(dueCounsellor),
        outcome: 'expired',
        result,
      };
    } catch (error) {
      // Multiple worker/API instances may discover the same deadline. The
      // transactional status transition is the claim: after one transaction
      // commits, a retry observes a non-approved record and is a successful
      // idempotent race rather than an operational failure.
      if (error?.code === 'VERIFICATION_NOT_DUE_FOR_EXPIRY') {
        return {
          counsellorId: toId(dueCounsellor),
          outcome: 'already_reconciled',
        };
      }
      throw error;
    }
  };

  const reconcileBatch = async ({
    now = nowProvider(),
    limit = DEFAULT_EXPIRY_RECONCILIATION_BATCH_SIZE,
  } = {}) => {
    const boundedLimit = normalizeBatchSize(limit);
    const dueCounsellors = await CounsellorModel.find(
      dueVerificationFilter(now)
    )
      .select('_id')
      .sort({
        'professionalVerification.expiresAt': 1,
        _id: 1,
      })
      .limit(boundedLimit)
      .lean();

    const summary = {
      scanned: dueCounsellors.length,
      expired: 0,
      alreadyReconciled: 0,
      failed: 0,
      failures: [],
    };

    // Deliberately sequential: each item starts a majority-write transaction,
    // so a bounded batch must not create an unbounded connection-pool burst.
    for (const dueCounsellor of dueCounsellors) {
      try {
        const result = await reconcileOne({
          counsellorId: dueCounsellor._id,
          now,
        });
        if (result.outcome === 'expired') summary.expired += 1;
        if (
          result.outcome === 'already_reconciled'
          || result.outcome === 'not_due'
        ) {
          summary.alreadyReconciled += 1;
        }
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({
          counsellorId: toId(dueCounsellor),
          code: error?.code || 'COUNSELLOR_EXPIRY_RECONCILIATION_FAILED',
        });
      }
    }

    return summary;
  };

  const evaluateAccountAccess = async ({
    account,
    now = nowProvider(),
  }) => {
    if (!account || account.role !== 'counsellor') {
      return { allowed: true, reason: null };
    }

    const counsellor = await CounsellorModel.findOne({ user: account._id })
      .lean();
    if (!counsellor) {
      return {
        allowed: false,
        reason: 'COUNSELLOR_PROFILE_NOT_FOUND',
      };
    }

    if (eligibilityEvaluator(counsellor, { account, now })) {
      return {
        allowed: true,
        reason: null,
        counsellor,
      };
    }

    const expiresAt = counsellor.professionalVerification?.expiresAt;
    const due = counsellor.status === 'approved'
      && expiresAt instanceof Date
      && expiresAt <= now;

    if (due) {
      // Whether reconciliation succeeds or another instance wins the race,
      // this request must fail closed because its approval elapsed.
      const reconciliation = await reconcileOne({
        counsellorId: counsellor._id,
        now,
      });
      return {
        allowed: false,
        reason: 'COUNSELLOR_VERIFICATION_EXPIRED',
        counsellor,
        reconciliation,
      };
    }

    // This also fails closed for a malformed approval, a stale credential
    // policy/consent version, a disabled profile, or another non-approved
    // professional-verification state. Those states require an explicit
    // lifecycle decision rather than an automatic expiry transition.
    return {
      allowed: false,
      reason: 'COUNSELLOR_PROFESSIONAL_ACCESS_DENIED',
      counsellor,
    };
  };

  return {
    evaluateAccountAccess,
    reconcileBatch,
    reconcileOne,
  };
};

const defaultReconciler = createCounsellorVerificationExpiryReconciler();

module.exports = {
  DEFAULT_EXPIRY_RECONCILIATION_BATCH_SIZE,
  MAX_EXPIRY_RECONCILIATION_BATCH_SIZE,
  createCounsellorVerificationExpiryReconciler,
  dueVerificationFilter,
  normalizeBatchSize,
  ...defaultReconciler,
};
