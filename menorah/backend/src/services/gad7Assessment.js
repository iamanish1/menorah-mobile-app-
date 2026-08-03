const GAD7_TYPE = 'GAD-7';
const GAD7_VERSION = 'gad-7-en-1.0';
const GAD7_LANGUAGE = 'en';

const GAD7_DISCLAIMER = 'This questionnaire is a screening tool and not a medical diagnosis. Your results do not replace advice from a qualified mental-health professional.';
const GAD7_RESULT_NOTICE = 'This result is a screening score, not a medical diagnosis.';
const GAD7_TIMEFRAME = 'Over the last 2 weeks, how often have you been bothered by the following problems?';

// Official English GAD-7 wording. Pfizer made the GAD-7 available without
// copyright restriction; keep this version immutable once submissions exist.
const GAD7_QUESTIONS = Object.freeze([
  'Feeling nervous, anxious or on edge',
  'Not being able to stop or control worrying',
  'Worrying too much about different things',
  'Trouble relaxing',
  'Being so restless that it is hard to sit still',
  'Becoming easily annoyed or irritable',
  'Feeling afraid as if something awful might happen',
].map((prompt, index) => Object.freeze({
  questionId: index + 1,
  prompt,
})));

const GAD7_RESPONSES = Object.freeze([
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
].map(Object.freeze));

class Gad7AssessmentError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'Gad7AssessmentError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const severityForScore = (score) => {
  if (score <= 4) return 'Minimal';
  if (score <= 9) return 'Mild';
  if (score <= 14) return 'Moderate';
  return 'Severe';
};

const normalizeGad7Answers = (answers) => {
  if (!Array.isArray(answers) || answers.length !== GAD7_QUESTIONS.length) {
    throw new Gad7AssessmentError(
      'ASSESSMENT_ANSWERS_INCOMPLETE',
      'All seven questions must be answered.'
    );
  }

  const byQuestion = new Map();
  for (const answer of answers) {
    const questionId = Number(answer?.questionId);
    const value = Number(answer?.value);
    if (
      !Number.isInteger(questionId)
      || questionId < 1
      || questionId > GAD7_QUESTIONS.length
      || !Number.isInteger(value)
      || value < 0
      || value > 3
      || byQuestion.has(questionId)
    ) {
      throw new Gad7AssessmentError(
        'ASSESSMENT_ANSWERS_INVALID',
        'The assessment answers are invalid.'
      );
    }
    byQuestion.set(questionId, value);
  }

  if (byQuestion.size !== GAD7_QUESTIONS.length) {
    throw new Gad7AssessmentError(
      'ASSESSMENT_ANSWERS_INCOMPLETE',
      'All seven questions must be answered.'
    );
  }

  return GAD7_QUESTIONS.map(({ questionId }) => ({
    questionId,
    value: byQuestion.get(questionId),
  }));
};

const scoreGad7 = (answers) => {
  const normalizedAnswers = normalizeGad7Answers(answers);
  const totalScore = normalizedAnswers.reduce((total, answer) => total + answer.value, 0);
  return {
    answers: normalizedAnswers,
    totalScore,
    severityCategory: severityForScore(totalScore),
  };
};

const getGad7Instrument = () => ({
  assessmentType: GAD7_TYPE,
  assessmentVersion: GAD7_VERSION,
  language: GAD7_LANGUAGE,
  title: 'Mental Health Check-in',
  timeframe: GAD7_TIMEFRAME,
  disclaimer: GAD7_DISCLAIMER,
  resultNotice: GAD7_RESULT_NOTICE,
  questions: GAD7_QUESTIONS.map((question) => ({ ...question })),
  responses: GAD7_RESPONSES.map((response) => ({ ...response })),
});

module.exports = {
  GAD7_TYPE,
  GAD7_VERSION,
  GAD7_LANGUAGE,
  GAD7_DISCLAIMER,
  GAD7_RESULT_NOTICE,
  GAD7_TIMEFRAME,
  GAD7_QUESTIONS,
  GAD7_RESPONSES,
  Gad7AssessmentError,
  getGad7Instrument,
  normalizeGad7Answers,
  scoreGad7,
  severityForScore,
};
