const PsychometricAssessment = require('../PsychometricAssessment');

describe('PsychometricAssessment model', () => {
  test('stores only encrypted individual answers and validates result bounds', () => {
    const document = new PsychometricAssessment({
      user: '64f000000000000000000001',
      assessmentType: 'GAD-7',
      assessmentVersion: 'gad-7-en-1.0',
      language: 'en',
      answersEncrypted: 'v1:iv:tag:ciphertext',
      answerCount: 7,
      totalScore: 9,
      severityCategory: 'Mild',
      idempotencyKeyHash: 'a'.repeat(64),
      requestFingerprint: 'b'.repeat(64),
    });

    expect(document.validateSync()).toBeUndefined();
    expect(PsychometricAssessment.schema.path('answers')).toBeUndefined();
    expect(PsychometricAssessment.schema.path('answersEncrypted').options.select).toBe(false);
    expect(PsychometricAssessment.schema.path('requestFingerprint').options.select).toBe(false);
  });

  test('defines the user history and duplicate-submission indexes', () => {
    expect(PsychometricAssessment.schema.indexes()).toEqual(expect.arrayContaining([
      [
        { user: 1, idempotencyKeyHash: 1 },
        expect.objectContaining({
          unique: true,
          name: 'assessment_user_idempotency_unique_v1',
        }),
      ],
      [
        { user: 1, completedAt: -1 },
        expect.objectContaining({ name: 'assessment_user_completedAt_v1' }),
      ],
      [
        { user: 1, assessmentType: 1, completedAt: -1 },
        expect.objectContaining({ name: 'assessment_user_type_completedAt_v1' }),
      ],
    ]));
  });
});
