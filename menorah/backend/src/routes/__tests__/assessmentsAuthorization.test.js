const express = require('express');
const request = require('supertest');
const { GAD7_VERSION } = require('../../services/gad7Assessment');

const USER_A = '64f000000000000000000001';
const USER_B = '64f000000000000000000002';
const ASSESSMENT_ID = '64f000000000000000000010';
const mockCreate = jest.fn();
const mockList = jest.fn();
const mockGet = jest.fn();
const mockAudit = jest.fn();

jest.mock('../../middleware/auth', () => ({
  auth: (req, res, next) => {
    const authorization = req.header('Authorization');
    if (authorization === 'Bearer user-a') {
      req.user = { _id: USER_A, role: 'user' };
      return next();
    }
    if (authorization === 'Bearer user-b') {
      req.user = { _id: USER_B, role: 'user' };
      return next();
    }
    if (authorization === 'Bearer counsellor-a') {
      req.user = { _id: USER_B, role: 'counsellor' };
      return next();
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  },
}));

jest.mock('../../services/psychometricAssessmentService', () => ({
  createGad7Submission: (...args) => mockCreate(...args),
  listOwnAssessments: (...args) => mockList(...args),
  getOwnAssessment: (...args) => mockGet(...args),
  serializeAssessment: (assessment) => ({
    id: String(assessment._id),
    assessmentType: assessment.assessmentType,
    assessmentVersion: assessment.assessmentVersion,
    language: assessment.language,
    totalScore: assessment.totalScore,
    severityCategory: assessment.severityCategory,
    completedAt: assessment.completedAt,
  }),
}));

jest.mock('../../utils/securityAudit', () => ({
  recordSecurityEvent: (...args) => mockAudit(...args),
}));

const assessmentRouter = require('../assessments');

const assessment = {
  _id: ASSESSMENT_ID,
  user: USER_A,
  assessmentType: 'GAD-7',
  assessmentVersion: GAD7_VERSION,
  language: 'en',
  totalScore: 9,
  severityCategory: 'Mild',
  completedAt: new Date('2026-08-02T10:00:00.000Z'),
};
const completeAnswers = Array.from({ length: 7 }, (_, index) => ({
  questionId: index + 1,
  value: index % 4,
}));

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/assessments', assessmentRouter);
  return app;
};

describe('psychometric assessment authentication and ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockImplementation(async ({ answers }) => {
      if (!Array.isArray(answers) || answers.length !== 7) {
        throw Object.assign(new Error('incomplete'), {
          code: 'ASSESSMENT_ANSWERS_INCOMPLETE',
        });
      }
      return { assessment, created: true };
    });
    mockList.mockResolvedValue([assessment]);
    mockGet.mockImplementation(async ({ userId, assessmentId }) => (
      userId === USER_A && assessmentId === ASSESSMENT_ID ? assessment : null
    ));
  });

  test.each([
    ['instrument', 'get', '/api/assessments/instruments/gad-7'],
    ['submission', 'post', '/api/assessments/gad-7'],
    ['history', 'get', '/api/assessments'],
    ['detail', 'get', `/api/assessments/${ASSESSMENT_ID}`],
  ])('requires authentication for %s', async (_label, method, path) => {
    await request(buildApp())[method](path).send({}).expect(401);
  });

  test('allows only user accounts to access the check-in', async () => {
    await request(buildApp())
      .get('/api/assessments/instruments/gad-7')
      .set('Authorization', 'Bearer counsellor-a')
      .expect(403);
  });

  test('returns the versioned English instrument only to an authenticated user', async () => {
    const response = await request(buildApp())
      .get('/api/assessments/instruments/gad-7')
      .set('Authorization', 'Bearer user-a')
      .expect(200);

    expect(response.body.data.instrument).toMatchObject({
      assessmentType: 'GAD-7',
      assessmentVersion: GAD7_VERSION,
      language: 'en',
      questions: expect.any(Array),
      responses: expect.any(Array),
    });
    expect(response.body.data.instrument.questions).toHaveLength(7);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  test('submits only for the authenticated user and returns a sanitized result', async () => {
    const response = await request(buildApp())
      .post('/api/assessments/gad-7')
      .set('Authorization', 'Bearer user-a')
      .set('Idempotency-Key', 'gad7-submit-1234567890')
      .send({
        userId: USER_B,
        assessmentVersion: GAD7_VERSION,
        answers: completeAnswers,
      })
      .expect(201);

    expect(mockCreate).toHaveBeenCalledWith({
      userId: USER_A,
      assessmentVersion: GAD7_VERSION,
      answers: completeAnswers,
      idempotencyKey: 'gad7-submit-1234567890',
    });
    expect(response.body.data.assessment).toMatchObject({
      totalScore: 9,
      severityCategory: 'Mild',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/answers|encrypted|fingerprint|idempotency/i);
  });

  test('blocks incomplete submissions without echoing answers', async () => {
    const response = await request(buildApp())
      .post('/api/assessments/gad-7')
      .set('Authorization', 'Bearer user-a')
      .set('Idempotency-Key', 'gad7-submit-1234567890')
      .send({
        assessmentVersion: GAD7_VERSION,
        answers: completeAnswers.slice(0, 6),
      })
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      code: 'ASSESSMENT_ANSWERS_INCOMPLETE',
      message: 'Please answer all seven questions before submitting.',
    });
    expect(JSON.stringify(response.body)).not.toContain('questionId');
  });

  test('returns an idempotent replay as success without creating another result response', async () => {
    mockCreate.mockResolvedValue({ assessment, created: false });
    const response = await request(buildApp())
      .post('/api/assessments/gad-7')
      .set('Authorization', 'Bearer user-a')
      .set('Idempotency-Key', 'gad7-submit-1234567890')
      .send({ assessmentVersion: GAD7_VERSION, answers: completeAnswers })
      .expect(200);

    expect(response.body.data.replayed).toBe(true);
    expect(response.body.data.assessment.id).toBe(ASSESSMENT_ID);
  });

  test('uses an owner predicate and hides another user result as not found', async () => {
    await request(buildApp())
      .get(`/api/assessments/${ASSESSMENT_ID}`)
      .set('Authorization', 'Bearer user-b')
      .expect(404);

    expect(mockGet).toHaveBeenCalledWith({
      userId: USER_B,
      assessmentId: ASSESSMENT_ID,
    });
  });

  test('keeps answers and scores out of audit metadata', async () => {
    await request(buildApp())
      .post('/api/assessments/gad-7')
      .set('Authorization', 'Bearer user-a')
      .set('Idempotency-Key', 'gad7-submit-1234567890')
      .send({ assessmentVersion: GAD7_VERSION, answers: completeAnswers })
      .expect(201);

    const auditPayload = JSON.stringify(
      mockAudit.mock.calls.map(([, options]) => options.details)
    );
    expect(auditPayload).not.toContain('totalScore');
    expect(auditPayload).not.toContain('severityCategory');
    expect(auditPayload).not.toContain('questionId');
    expect(auditPayload).not.toContain('Idempotency-Key');
  });
});
