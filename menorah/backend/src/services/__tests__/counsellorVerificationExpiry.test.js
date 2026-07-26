const {
  MAX_EXPIRY_RECONCILIATION_BATCH_SIZE,
  createCounsellorVerificationExpiryReconciler,
  dueVerificationFilter,
  normalizeBatchSize,
} = require('../counsellorVerificationExpiry');

const NOW = new Date('2026-07-23T08:00:00.000Z');
const COUNSELLOR_ID = '64f000000000000000000081';
const USER_ID = '64f000000000000000000082';

const queryResult = (value) => {
  const query = {
    select: jest.fn(() => query),
    sort: jest.fn(() => query),
    limit: jest.fn(() => query),
    lean: jest.fn(async () => value),
  };
  return query;
};

describe('counsellor professional-verification expiry reconciliation', () => {
  test('builds an exact due filter and clamps every batch', () => {
    expect(dueVerificationFilter(NOW, { _id: COUNSELLOR_ID })).toEqual({
      _id: COUNSELLOR_ID,
      status: 'approved',
      'professionalVerification.expiresAt': {
        $type: 'date',
        $lte: NOW,
      },
    });
    expect(normalizeBatchSize(0)).toBe(50);
    expect(normalizeBatchSize('invalid')).toBe(50);
    expect(normalizeBatchSize(7)).toBe(7);
    expect(normalizeBatchSize(1000))
      .toBe(MAX_EXPIRY_RECONCILIATION_BATCH_SIZE);
  });

  test('expires one due graph with the same server timestamp', async () => {
    const findOne = jest.fn(() => queryResult({ _id: COUNSELLOR_ID }));
    const expireVerification = jest.fn(async () => ({
      counsellor: { _id: COUNSELLOR_ID, status: 'expired' },
    }));
    const reconciler = createCounsellorVerificationExpiryReconciler({
      CounsellorModel: { findOne },
      expireVerification,
    });

    await expect(reconciler.reconcileOne({
      counsellorId: COUNSELLOR_ID,
      now: NOW,
    })).resolves.toMatchObject({
      counsellorId: COUNSELLOR_ID,
      outcome: 'expired',
    });

    expect(findOne).toHaveBeenCalledWith(
      dueVerificationFilter(NOW, { _id: COUNSELLOR_ID })
    );
    expect(expireVerification).toHaveBeenCalledWith({
      counsellorId: COUNSELLOR_ID,
      now: NOW,
    });
  });

  test('treats a transactional compare-and-set loser as idempotently reconciled', async () => {
    const expireVerification = jest.fn(async () => {
      const error = new Error('already changed');
      error.code = 'VERIFICATION_NOT_DUE_FOR_EXPIRY';
      throw error;
    });
    const reconciler = createCounsellorVerificationExpiryReconciler({
      CounsellorModel: {
        findOne: jest.fn(() => queryResult({ _id: COUNSELLOR_ID })),
      },
      expireVerification,
    });

    await expect(reconciler.reconcileOne({
      counsellorId: COUNSELLOR_ID,
      now: NOW,
    })).resolves.toEqual({
      counsellorId: COUNSELLOR_ID,
      outcome: 'already_reconciled',
    });
  });

  test('processes a bounded batch sequentially and reports safe failures', async () => {
    const due = [
      { _id: '64f000000000000000000091' },
      { _id: '64f000000000000000000092' },
      { _id: '64f000000000000000000093' },
    ];
    let inFlight = 0;
    let maximumInFlight = 0;
    const expireVerification = jest.fn(async ({ counsellorId }) => {
      inFlight += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      if (counsellorId === due[1]._id) {
        const error = new Error('sensitive database detail');
        error.code = 'REVIEW_LINKAGE_INVALID';
        throw error;
      }
      return {};
    });
    const find = jest.fn(() => queryResult(due));
    const findOne = jest.fn((filter) => queryResult(
      due.find(({ _id }) => _id === filter._id) || null
    ));
    const reconciler = createCounsellorVerificationExpiryReconciler({
      CounsellorModel: { find, findOne },
      expireVerification,
    });

    const summary = await reconciler.reconcileBatch({
      now: NOW,
      limit: 1000,
    });

    expect(summary).toEqual({
      scanned: 3,
      expired: 2,
      alreadyReconciled: 0,
      failed: 1,
      failures: [{
        counsellorId: due[1]._id,
        code: 'REVIEW_LINKAGE_INVALID',
      }],
    });
    expect(JSON.stringify(summary)).not.toContain('sensitive database detail');
    expect(maximumInFlight).toBe(1);
    const batchQuery = find.mock.results[0].value;
    expect(batchQuery.sort).toHaveBeenCalledWith({
      'professionalVerification.expiresAt': 1,
      _id: 1,
    });
    expect(batchQuery.limit)
      .toHaveBeenCalledWith(MAX_EXPIRY_RECONCILIATION_BATCH_SIZE);
  });

  test('allows only a currently eligible counsellor account', async () => {
    const profile = {
      _id: COUNSELLOR_ID,
      user: USER_ID,
      status: 'approved',
      professionalVerification: {
        expiresAt: new Date('2026-07-23T08:00:00.001Z'),
      },
    };
    const eligibilityEvaluator = jest.fn(() => true);
    const reconciler = createCounsellorVerificationExpiryReconciler({
      CounsellorModel: {
        findOne: jest.fn(() => queryResult(profile)),
      },
      expireVerification: jest.fn(),
      eligibilityEvaluator,
    });
    const account = {
      _id: USER_ID,
      role: 'counsellor',
      isActive: true,
    };

    await expect(reconciler.evaluateAccountAccess({
      account,
      now: NOW,
    })).resolves.toMatchObject({
      allowed: true,
      reason: null,
      counsellor: profile,
    });
    expect(eligibilityEvaluator).toHaveBeenCalledWith(profile, {
      account,
      now: NOW,
    });
  });

  test('expires and denies an elapsed account before the request can continue', async () => {
    const profile = {
      _id: COUNSELLOR_ID,
      user: USER_ID,
      status: 'approved',
      professionalVerification: { expiresAt: NOW },
    };
    const CounsellorModel = {
      findOne: jest.fn(() => queryResult(profile)),
    };
    const expireVerification = jest.fn(async () => ({}));
    const reconciler = createCounsellorVerificationExpiryReconciler({
      CounsellorModel,
      expireVerification,
      eligibilityEvaluator: jest.fn(() => false),
    });

    await expect(reconciler.evaluateAccountAccess({
      account: {
        _id: USER_ID,
        role: 'counsellor',
        isActive: true,
      },
      now: NOW,
    })).resolves.toMatchObject({
      allowed: false,
      reason: 'COUNSELLOR_VERIFICATION_EXPIRED',
      reconciliation: {
        counsellorId: COUNSELLOR_ID,
        outcome: 'expired',
      },
    });
    expect(expireVerification).toHaveBeenCalledTimes(1);
  });

  test('fails closed without inventing a lifecycle transition for other invalid approvals', async () => {
    const profile = {
      _id: COUNSELLOR_ID,
      user: USER_ID,
      status: 'approved',
      professionalVerification: {
        expiresAt: new Date('2027-07-23T08:00:00.000Z'),
      },
    };
    const expireVerification = jest.fn();
    const reconciler = createCounsellorVerificationExpiryReconciler({
      CounsellorModel: {
        findOne: jest.fn(() => queryResult(profile)),
      },
      expireVerification,
      eligibilityEvaluator: jest.fn(() => false),
    });

    await expect(reconciler.evaluateAccountAccess({
      account: {
        _id: USER_ID,
        role: 'counsellor',
        isActive: true,
      },
      now: NOW,
    })).resolves.toEqual({
      allowed: false,
      reason: 'COUNSELLOR_PROFESSIONAL_ACCESS_DENIED',
      counsellor: profile,
    });
    expect(expireVerification).not.toHaveBeenCalled();
  });
});
