const {
  decryptAssessmentAnswers,
  encryptAssessmentAnswers,
  fingerprintAssessmentPayload,
  hashAssessmentIdempotencyKey,
} = require('../assessmentDataProtection');

describe('psychometric assessment data protection', () => {
  const originalKey = process.env.DATA_ENCRYPTION_KEY;
  const answers = Array.from({ length: 7 }, (_, index) => ({
    questionId: index + 1,
    value: index % 4,
  }));
  const context = `assessment:64f000000000000000000001:${'a'.repeat(64)}`;

  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = 'test-only-assessment-encryption-root-key';
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
    else process.env.DATA_ENCRYPTION_KEY = originalKey;
  });

  test('encrypts individual answers with authenticated context binding', () => {
    const encrypted = encryptAssessmentAnswers(answers, { context });

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain('questionId');
    expect(decryptAssessmentAnswers(encrypted, { context })).toEqual(answers);
    expect(() => decryptAssessmentAnswers(encrypted, {
      context: `assessment:64f000000000000000000002:${'a'.repeat(64)}`,
    })).toThrow(/failed authentication/i);
  });

  test('creates stable user-scoped idempotency hashes without retaining the key', () => {
    const key = 'gad7-submit-1234567890';
    const first = hashAssessmentIdempotencyKey({
      userId: '64f000000000000000000001',
      idempotencyKey: key,
    });
    const replay = hashAssessmentIdempotencyKey({
      userId: '64f000000000000000000001',
      idempotencyKey: key,
    });
    const otherUser = hashAssessmentIdempotencyKey({
      userId: '64f000000000000000000002',
      idempotencyKey: key,
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(replay).toBe(first);
    expect(otherUser).not.toBe(first);
    expect(first).not.toContain(key);
  });

  test('uses a keyed request fingerprint for the low-entropy answer set', () => {
    const fingerprint = fingerprintAssessmentPayload({ answers });
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).not.toContain(JSON.stringify(answers));
  });

  test('fails closed without configured key material', () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(() => encryptAssessmentAnswers(answers, { context }))
      .toThrow(expect.objectContaining({
        code: 'ASSESSMENT_DATA_PROTECTION_UNAVAILABLE',
      }));
  });
});
