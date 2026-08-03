const PsychometricAssessment = require('../models/PsychometricAssessment');
const {
  GAD7_LANGUAGE,
  GAD7_TYPE,
  GAD7_VERSION,
  Gad7AssessmentError,
  scoreGad7,
} = require('./gad7Assessment');
const {
  encryptAssessmentAnswers,
  fingerprintAssessmentPayload,
  hashAssessmentIdempotencyKey,
} = require('../utils/assessmentDataProtection');

const serializeAssessment = (assessment) => ({
  id: String(assessment._id),
  assessmentType: assessment.assessmentType,
  assessmentVersion: assessment.assessmentVersion,
  language: assessment.language,
  totalScore: assessment.totalScore,
  severityCategory: assessment.severityCategory,
  completedAt: assessment.completedAt,
});

const selectIdempotencyFields = (query) => (
  typeof query?.select === 'function'
    ? query.select('+idempotencyKeyHash +requestFingerprint')
    : query
);

const findByIdempotency = async (AssessmentModel, { userId, idempotencyKeyHash }) => (
  selectIdempotencyFields(AssessmentModel.findOne({
    user: userId,
    idempotencyKeyHash,
  }))
);

const assertReplayMatches = (assessment, requestFingerprint) => {
  if (assessment.requestFingerprint !== requestFingerprint) {
    throw new Gad7AssessmentError(
      'ASSESSMENT_IDEMPOTENCY_REUSED',
      'The submission key was already used for another assessment.',
      409
    );
  }
  return assessment;
};

const createGad7Submission = async ({
  userId,
  assessmentVersion,
  answers,
  idempotencyKey,
  completedAt = new Date(),
}, {
  AssessmentModel = PsychometricAssessment,
  encryptAnswers = encryptAssessmentAnswers,
  fingerprintPayload = fingerprintAssessmentPayload,
  hashIdempotencyKey = hashAssessmentIdempotencyKey,
} = {}) => {
  if (assessmentVersion !== GAD7_VERSION) {
    throw new Gad7AssessmentError(
      'ASSESSMENT_VERSION_UNSUPPORTED',
      'This assessment version is not supported.'
    );
  }

  const scored = scoreGad7(answers);
  const idempotencyKeyHash = hashIdempotencyKey({ userId, idempotencyKey });
  const requestFingerprint = fingerprintPayload({
    assessmentType: GAD7_TYPE,
    assessmentVersion: GAD7_VERSION,
    answers: scored.answers,
  });

  const existing = await findByIdempotency(AssessmentModel, {
    userId,
    idempotencyKeyHash,
  });
  if (existing) {
    return {
      assessment: assertReplayMatches(existing, requestFingerprint),
      created: false,
    };
  }

  const answersEncrypted = encryptAnswers(scored.answers, {
    context: `assessment:${String(userId)}:${idempotencyKeyHash}`,
  });
  const document = {
    user: userId,
    assessmentType: GAD7_TYPE,
    assessmentVersion: GAD7_VERSION,
    language: GAD7_LANGUAGE,
    answersEncrypted,
    answerCount: scored.answers.length,
    totalScore: scored.totalScore,
    severityCategory: scored.severityCategory,
    completedAt,
    idempotencyKeyHash,
    requestFingerprint,
  };

  try {
    const assessment = await AssessmentModel.create(document);
    return { assessment, created: true };
  } catch (error) {
    if (error?.code !== 11000) throw error;

    const winner = await findByIdempotency(AssessmentModel, {
      userId,
      idempotencyKeyHash,
    });
    if (!winner) throw error;
    return {
      assessment: assertReplayMatches(winner, requestFingerprint),
      created: false,
    };
  }
};

const listOwnAssessments = async ({
  userId,
  limit = 20,
}, {
  AssessmentModel = PsychometricAssessment,
} = {}) => {
  const normalizedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 50);
  return AssessmentModel.find({ user: userId })
    .sort({ completedAt: -1 })
    .limit(normalizedLimit)
    .lean();
};

const getOwnAssessment = async ({
  userId,
  assessmentId,
}, {
  AssessmentModel = PsychometricAssessment,
} = {}) => AssessmentModel.findOne({
  _id: assessmentId,
  user: userId,
}).lean();

module.exports = {
  assertReplayMatches,
  createGad7Submission,
  getOwnAssessment,
  listOwnAssessments,
  serializeAssessment,
};
