const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const mobileRoot = resolve(__dirname, "..");
const readMobile = (relativePath) =>
  readFileSync(resolve(mobileRoot, relativePath), "utf8");
const flow = require(resolve(mobileRoot, "src/lib/gad7-assessment.js"));

test("opens the authenticated check-in from the Discover and Profile buttons", () => {
  const discover = readMobile("src/screens/discover/DiscoverModern.tsx");
  const profile = readMobile("src/screens/profile/ProfileHomeModern.tsx");
  const navigator = readMobile("src/navigation/RootNavigator.tsx");

  assert.match(discover, /title=["']Take Mental Health Check-in["']/);
  assert.match(discover, /navigation\.navigate\(["']MentalHealthCheckIn["']\)/);
  assert.match(profile, /label: ["']Take Mental Health Check-in["']/);
  assert.match(profile, /route: ["']MentalHealthCheckIn["']/);
  assert.match(navigator, /name=["']MentalHealthCheckIn["']/);
  assert.match(navigator, /component=\{MentalHealthCheckIn\}/);
});

test("completes all seven questions one at a time", () => {
  let answers = flow.createInitialAnswers();
  assert.equal(answers.length, 7);

  for (let index = 0; index < 7; index += 1) {
    assert.equal(flow.canAdvance(answers, index), false);
    answers = flow.setAnswer(answers, index, index % 4);
    assert.equal(flow.canAdvance(answers, index), true);
  }

  assert.equal(flow.canSubmit(answers), true);
  assert.deepEqual(flow.toSubmissionAnswers(answers), [
    { questionId: 1, value: 0 },
    { questionId: 2, value: 1 },
    { questionId: 3, value: 2 },
    { questionId: 4, value: 3 },
    { questionId: 5, value: 0 },
    { questionId: 6, value: 1 },
    { questionId: 7, value: 2 },
  ]);
});

test("blocks incomplete submissions", () => {
  let answers = flow.createInitialAnswers();
  for (let index = 0; index < 6; index += 1) {
    answers = flow.setAnswer(answers, index, 1);
  }

  assert.equal(flow.canSubmit(answers), false);
  assert.equal(flow.toSubmissionAnswers(answers), null);
  assert.equal(flow.submissionSignature(answers), null);
});

test("renders progress, navigation, submit, and a non-diagnostic result", () => {
  const screen = readMobile("src/screens/assessment/mental-health-check-in.tsx");

  assert.match(screen, /Question \{questionIndex \+ 1\} of \{GAD7_QUESTION_COUNT\}/);
  assert.match(screen, /\{isFinalQuestion \? ["']Submit["'] : ["']Next["']\}/);
  assert.match(screen, />\s*Back\s*</);
  assert.match(screen, /\{result\.totalScore\}/);
  assert.match(screen, /\{result\.severityCategory\}/);
  assert.match(screen, />\s*Book a Counsellor\s*</);
  assert.match(screen, />\s*Done\s*</);
  assert.match(screen, /GAD7_RESULT_NOTICE/);
  assert.doesNotMatch(screen, /you have anxiety|diagnosed with/i);
});

test("uses a stable idempotency key for repeated taps and network retries", () => {
  const screen = readMobile("src/screens/assessment/mental-health-check-in.tsx");
  const api = readMobile("src/lib/api.ts");

  assert.match(screen, /if \(submittingRef\.current/);
  assert.match(screen, /submissionAttemptRef\.current\?\.signature !== signature/);
  assert.match(screen, /key: `gad7-\$\{uuidv4\(\)\}`/);
  assert.match(api, /headers: \{ ["']Idempotency-Key["']: idempotencyKey \}/);
});

test("keeps the first release English-only with the required disclaimer", () => {
  const screen = readMobile("src/screens/assessment/mental-health-check-in.tsx");

  assert.equal(
    flow.GAD7_DISCLAIMER,
    "This questionnaire is a screening tool and not a medical diagnosis. Your results do not replace advice from a qualified mental-health professional."
  );
  assert.match(screen, /response\.data\.instrument\.language === ["']en["']/);
  assert.doesNotMatch(screen, /useTranslation|i18n|Arabic|\bar\b/);
});
