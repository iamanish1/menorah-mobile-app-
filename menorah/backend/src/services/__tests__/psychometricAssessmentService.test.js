const {
  createGad7Submission,
  getOwnAssessment,
  listOwnAssessments,
  serializeAssessment,
} = require('../psychometricAssessmentService');
const { GAD7_VERSION } = require('../gad7Assessment');

const USER_ID = '64f000000000000000000001';
const OTHER_USER_ID = '64f000000000000000000002';
const IDEMPOTENCY_HASH = 'a'.repeat(64);
const FINGERPRINT = 'b'.repeat(64);
const answers = Array.from({ length: 7 }, (_, index) => ({
  questionId: index + 1,
  value: index % 4,
}));

const queryResult = (value) => ({
  select: jest.fn().mockResolvedValue(value),
});

const dependencies = (AssessmentModel, overrides = {}) => ({
  AssessmentModel,
  encryptAnswers: jest.fn(() => 'v1:encrypted-answers'),
  fingerprintPayload: jest.fn(() => FINGERPRINT),
  hashIdempotencyKey: jest.fn(() => IDEMPOTENCY_HASH),
  ...overrides,
});

describe('psychometric assessment submission service', () => {
  test('calculates and stores the canonical backend result', async () => {
    const created = { _id: '64f000000000000000000010' };
    const AssessmentModel = {
      findOne: jest.fn(() => queryResult(null)),
      create: jest.fn(async (document) => Object.assign(created, document)),
    };
    const deps = dependencies(AssessmentModel);

    const result = await createGad7Submission({
      userId: USER_ID,
      assessmentVersion: GAD7_VERSION,
      answers,
      idempotencyKey: 'gad7-submit-1234567890',
      completedAt: new Date('2026-08-02T10:00:00.000Z'),
    }, deps);

    expect(result.created).toBe(true);
    expect(AssessmentModel.create).toHaveBeenCalledWith(expect.objectContaining({
      user: USER_ID,
      assessmentType: 'GAD-7',
      assessmentVersion: GAD7_VERSION,
      language: 'en',
      answersEncrypted: 'v1:encrypted-answers',
      answerCount: 7,
      totalScore: 9,
      severityCategory: 'Mild',
      idempotencyKeyHash: IDEMPOTENCY_HASH,
      requestFingerprint: FINGERPRINT,
    }));
    expect(AssessmentModel.create.mock.calls[0][0]).not.toHaveProperty('answers');
    expect(deps.encryptAnswers).toHaveBeenCalledWith(
      answers,
      { context: `assessment:${USER_ID}:${IDEMPOTENCY_HASH}` }
    );
  });

  test('returns an exact replay without creating a duplicate document', async () => {
    const existing = {
      _id: '64f000000000000000000010',
      requestFingerprint: FINGERPRINT,
    };
    const AssessmentModel = {
      findOne: jest.fn(() => queryResult(existing)),
      create: jest.fn(),
    };

    const result = await createGad7Submission({
      userId: USER_ID,
      assessmentVersion: GAD7_VERSION,
      answers,
      idempotencyKey: 'gad7-submit-1234567890',
    }, dependencies(AssessmentModel));

    expect(result).toEqual({ assessment: existing, created: false });
    expect(AssessmentModel.create).not.toHaveBeenCalled();
  });

  test('recovers the unique-index winner after a concurrent repeated tap', async () => {
    const winner = {
      _id: '64f000000000000000000010',
      requestFingerprint: FINGERPRINT,
    };
    const AssessmentModel = {
      findOne: jest.fn()
        .mockReturnValueOnce(queryResult(null))
        .mockReturnValueOnce(queryResult(winner)),
      create: jest.fn().mockRejectedValue(Object.assign(new Error('duplicate'), {
        code: 11000,
      })),
    };

    const result = await createGad7Submission({
      userId: USER_ID,
      assessmentVersion: GAD7_VERSION,
      answers,
      idempotencyKey: 'gad7-submit-1234567890',
    }, dependencies(AssessmentModel));

    expect(result).toEqual({ assessment: winner, created: false });
    expect(AssessmentModel.findOne).toHaveBeenCalledTimes(2);
  });

  test('rejects reuse of the same key for different answers', async () => {
    const AssessmentModel = {
      findOne: jest.fn(() => queryResult({
        _id: '64f000000000000000000010',
        requestFingerprint: 'c'.repeat(64),
      })),
      create: jest.fn(),
    };

    await expect(createGad7Submission({
      userId: USER_ID,
      assessmentVersion: GAD7_VERSION,
      answers,
      idempotencyKey: 'gad7-submit-1234567890',
    }, dependencies(AssessmentModel))).rejects.toMatchObject({
      code: 'ASSESSMENT_IDEMPOTENCY_REUSED',
      statusCode: 409,
    });
    expect(AssessmentModel.create).not.toHaveBeenCalled();
  });

  test('scopes result listing and detail lookup to the authenticated user', async () => {
    const listQuery = {
      sort: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn().mockResolvedValue([]),
    };
    listQuery.sort.mockReturnValue(listQuery);
    listQuery.limit.mockReturnValue(listQuery);
    const detailQuery = {
      lean: jest.fn().mockResolvedValue(null),
    };
    const AssessmentModel = {
      find: jest.fn(() => listQuery),
      findOne: jest.fn(() => detailQuery),
    };

    await listOwnAssessments({ userId: USER_ID, limit: 100 }, { AssessmentModel });
    await getOwnAssessment({
      userId: OTHER_USER_ID,
      assessmentId: '64f000000000000000000010',
    }, { AssessmentModel });

    expect(AssessmentModel.find).toHaveBeenCalledWith({ user: USER_ID });
    expect(listQuery.limit).toHaveBeenCalledWith(50);
    expect(AssessmentModel.findOne).toHaveBeenCalledWith({
      _id: '64f000000000000000000010',
      user: OTHER_USER_ID,
    });
  });

  test('serializes only the result fields needed by the user app', () => {
    const serialized = serializeAssessment({
      _id: '64f000000000000000000010',
      assessmentType: 'GAD-7',
      assessmentVersion: GAD7_VERSION,
      language: 'en',
      totalScore: 9,
      severityCategory: 'Mild',
      completedAt: new Date('2026-08-02T10:00:00.000Z'),
      answersEncrypted: 'v1:sensitive',
      idempotencyKeyHash: IDEMPOTENCY_HASH,
      requestFingerprint: FINGERPRINT,
    });

    expect(serialized).toEqual({
      id: '64f000000000000000000010',
      assessmentType: 'GAD-7',
      assessmentVersion: GAD7_VERSION,
      language: 'en',
      totalScore: 9,
      severityCategory: 'Mild',
      completedAt: new Date('2026-08-02T10:00:00.000Z'),
    });
    expect(JSON.stringify(serialized)).not.toMatch(/answer|idempotency|fingerprint|encrypted/i);
  });
});
