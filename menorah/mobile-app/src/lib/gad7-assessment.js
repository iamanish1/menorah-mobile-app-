const GAD7_QUESTION_COUNT = 7;
const GAD7_DISCLAIMER =
  "This questionnaire is a screening tool and not a medical diagnosis. Your results do not replace advice from a qualified mental-health professional.";
const GAD7_RESULT_NOTICE =
  "This result is a screening score, not a medical diagnosis.";

const createInitialAnswers = (count = GAD7_QUESTION_COUNT) =>
  Array.from({ length: count }, () => null);

const setAnswer = (answers, questionIndex, value) => {
  if (
    !Array.isArray(answers) ||
    !Number.isInteger(questionIndex) ||
    questionIndex < 0 ||
    questionIndex >= answers.length ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 3
  ) {
    return answers;
  }
  const next = [...answers];
  next[questionIndex] = value;
  return next;
};

const isAnswered = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 3;

const canAdvance = (answers, questionIndex) =>
  Array.isArray(answers) && isAnswered(answers[questionIndex]);

const canSubmit = (answers) =>
  Array.isArray(answers) &&
  answers.length === GAD7_QUESTION_COUNT &&
  answers.every(isAnswered);

const toSubmissionAnswers = (answers) => {
  if (!canSubmit(answers)) return null;
  return answers.map((value, index) => ({
    questionId: index + 1,
    value,
  }));
};

const submissionSignature = (answers) =>
  canSubmit(answers) ? answers.join(":") : null;

module.exports = {
  GAD7_QUESTION_COUNT,
  GAD7_DISCLAIMER,
  GAD7_RESULT_NOTICE,
  canAdvance,
  canSubmit,
  createInitialAnswers,
  setAnswer,
  submissionSignature,
  toSubmissionAnswers,
};
