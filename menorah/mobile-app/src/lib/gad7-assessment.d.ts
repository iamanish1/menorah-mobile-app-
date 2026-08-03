export const GAD7_QUESTION_COUNT: 7;
export const GAD7_DISCLAIMER: string;
export const GAD7_RESULT_NOTICE: string;

export function createInitialAnswers(count?: number): Array<number | null>;
export function setAnswer(
  answers: Array<number | null>,
  questionIndex: number,
  value: number,
): Array<number | null>;
export function canAdvance(
  answers: Array<number | null>,
  questionIndex: number,
): boolean;
export function canSubmit(answers: Array<number | null>): boolean;
export function toSubmissionAnswers(
  answers: Array<number | null>,
): Array<{ questionId: number; value: number }> | null;
export function submissionSignature(
  answers: Array<number | null>,
): string | null;
