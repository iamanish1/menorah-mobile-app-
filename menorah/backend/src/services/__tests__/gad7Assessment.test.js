const {
  GAD7_DISCLAIMER,
  GAD7_QUESTIONS,
  GAD7_RESPONSES,
  GAD7_VERSION,
  getGad7Instrument,
  scoreGad7,
  severityForScore,
} = require('../gad7Assessment');

const answersForTotal = (total) => {
  let remaining = total;
  return Array.from({ length: 7 }, (_, index) => {
    const value = Math.min(3, remaining);
    remaining -= value;
    return { questionId: index + 1, value };
  });
};

describe('official English GAD-7 assessment', () => {
  test('publishes the exact seven official items and four standard responses', () => {
    expect(GAD7_QUESTIONS.map(({ prompt }) => prompt)).toEqual([
      'Feeling nervous, anxious or on edge',
      'Not being able to stop or control worrying',
      'Worrying too much about different things',
      'Trouble relaxing',
      'Being so restless that it is hard to sit still',
      'Becoming easily annoyed or irritable',
      'Feeling afraid as if something awful might happen',
    ]);
    expect(GAD7_RESPONSES).toEqual([
      { value: 0, label: 'Not at all' },
      { value: 1, label: 'Several days' },
      { value: 2, label: 'More than half the days' },
      { value: 3, label: 'Nearly every day' },
    ]);
    expect(getGad7Instrument()).toMatchObject({
      assessmentVersion: GAD7_VERSION,
      language: 'en',
      disclaimer: GAD7_DISCLAIMER,
      questions: expect.any(Array),
      responses: expect.any(Array),
    });
  });

  test.each([
    [0, 'Minimal'],
    [4, 'Minimal'],
    [5, 'Mild'],
    [9, 'Mild'],
    [10, 'Moderate'],
    [14, 'Moderate'],
    [15, 'Severe'],
    [21, 'Severe'],
  ])('scores %i as %s', (total, severityCategory) => {
    expect(scoreGad7(answersForTotal(total))).toMatchObject({
      totalScore: total,
      severityCategory,
    });
    expect(severityForScore(total)).toBe(severityCategory);
  });

  test('normalizes answer order before scoring', () => {
    const result = scoreGad7([
      { questionId: 7, value: 2 },
      { questionId: 1, value: 0 },
      { questionId: 4, value: 3 },
      { questionId: 2, value: 1 },
      { questionId: 6, value: 1 },
      { questionId: 3, value: 2 },
      { questionId: 5, value: 0 },
    ]);

    expect(result.totalScore).toBe(9);
    expect(result.severityCategory).toBe('Mild');
    expect(result.answers.map(({ questionId }) => questionId))
      .toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test.each([
    ['missing item', answersForTotal(3).slice(0, 6), 'ASSESSMENT_ANSWERS_INCOMPLETE'],
    ['duplicate item', answersForTotal(3).map((answer, index) => (
      index === 6 ? { questionId: 6, value: 0 } : answer
    )), 'ASSESSMENT_ANSWERS_INVALID'],
    ['out-of-range score', answersForTotal(3).map((answer, index) => (
      index === 6 ? { questionId: 7, value: 4 } : answer
    )), 'ASSESSMENT_ANSWERS_INVALID'],
  ])('rejects %s submissions', (_label, answers, code) => {
    expect(() => scoreGad7(answers)).toThrow(expect.objectContaining({ code }));
  });
});
