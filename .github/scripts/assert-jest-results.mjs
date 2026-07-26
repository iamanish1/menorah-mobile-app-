import { readFileSync } from 'node:fs';

const [resultPath, ...flags] = process.argv.slice(2);
if (!resultPath) {
  console.error('Usage: node assert-jest-results.mjs <jest-json> [--require-no-skips] [--minimum-tests N]');
  process.exit(2);
}

const minimumIndex = flags.indexOf('--minimum-tests');
const minimumTests = minimumIndex === -1 ? 0 : Number(flags[minimumIndex + 1]);
if (!Number.isInteger(minimumTests) || minimumTests < 0) {
  console.error('--minimum-tests must be a non-negative integer.');
  process.exit(2);
}

const report = JSON.parse(readFileSync(resultPath, 'utf8'));
const failures = [];
if (report.success !== true || report.numFailedTests !== 0 || report.numFailedTestSuites !== 0) {
  failures.push('Jest reported a failed test or suite.');
}
if ((report.numTotalTests ?? 0) < minimumTests) {
  failures.push(`Jest ran ${report.numTotalTests ?? 0} tests; expected at least ${minimumTests}.`);
}
if (flags.includes('--require-no-skips') && (report.numPendingTests ?? 0) !== 0) {
  failures.push(`Jest reported ${report.numPendingTests} skipped tests.`);
}
if (flags.includes('--require-no-skips') && (report.numPendingTestSuites ?? 0) !== 0) {
  failures.push(`Jest reported ${report.numPendingTestSuites} skipped suites.`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(
  `Jest result accepted: ${report.numPassedTestSuites}/${report.numTotalTestSuites} suites, `
  + `${report.numPassedTests}/${report.numTotalTests} tests, 0 failed, `
  + `${report.numPendingTests ?? 0} skipped.`,
);
