import { spawnSync } from 'node:child_process';
import path from 'node:path';

const MOBILE_EXCEPTION_EXPIRES = '2026-10-31';
const MOBILE_ADVISORY = 'GHSA-w5hq-g745-h8pq';
const MOBILE_PACKAGES = new Set([
  '@expo/cli',
  '@expo/config',
  '@expo/config-plugins',
  '@expo/inline-modules',
  '@expo/local-build-cache-provider',
  '@expo/metro-config',
  '@expo/prebuild-config',
  '@react-native-google-signin/google-signin',
  'expo',
  'uuid',
  'xcode',
]);

const project = process.argv[2];
if (!project) {
  console.error('Usage: node .github/scripts/audit-production.mjs <package-directory>');
  process.exit(2);
}

const projectPath = path.resolve(project);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['audit', '--omit=dev', '--json'], {
  cwd: projectPath,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
  shell: process.platform === 'win32',
  windowsHide: true,
});

if (result.error || result.status === null) {
  console.error(`npm audit could not start for ${project}.`);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(result.stdout || '');
} catch {
  console.error(`Unable to parse npm audit output for ${project}.`);
  process.exit(2);
}

if (report.error) {
  console.error(`npm audit could not complete for ${project}: ${report.error.summary || 'unknown error'}`);
  process.exit(2);
}

const vulnerabilities = Object.values(report.vulnerabilities || {});
if (vulnerabilities.length === 0) {
  console.log(`${project}: production dependency audit passed with no findings.`);
  process.exit(0);
}

const normalizedProject = project.replaceAll('\\', '/').replace(/\/$/, '');
const isMobile = normalizedProject === 'menorah/mobile-app'
  || normalizedProject === 'menorah/mobile-app/mobile-app';

if (!isMobile) {
  const summary = report.metadata?.vulnerabilities || {};
  console.error(`${project}: production audit failed (${JSON.stringify(summary)}).`);
  process.exit(1);
}

if (Date.now() > Date.parse(`${MOBILE_EXCEPTION_EXPIRES}T23:59:59Z`)) {
  console.error(`${project}: the Expo audit exception expired on ${MOBILE_EXCEPTION_EXPIRES}.`);
  process.exit(1);
}

const unexpectedPackages = vulnerabilities
  .map((finding) => finding.name)
  .filter((name) => !MOBILE_PACKAGES.has(name));
const unexpectedSeverities = vulnerabilities
  .filter((finding) => finding.severity !== 'moderate')
  .map((finding) => `${finding.name}:${finding.severity}`);
const advisoryUrls = vulnerabilities.flatMap((finding) =>
  (finding.via || [])
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => entry.url)
    .filter(Boolean),
);
const unexpectedAdvisories = advisoryUrls.filter((url) => !url.includes(MOBILE_ADVISORY));

if (
  unexpectedPackages.length > 0
  || unexpectedSeverities.length > 0
  || unexpectedAdvisories.length > 0
  || advisoryUrls.length === 0
) {
  console.error(`${project}: production audit contains findings outside the reviewed Expo exception.`);
  if (unexpectedPackages.length > 0) {
    console.error(`Unexpected packages: ${[...new Set(unexpectedPackages)].join(', ')}`);
  }
  if (unexpectedSeverities.length > 0) {
    console.error(`Unexpected severities: ${[...new Set(unexpectedSeverities)].join(', ')}`);
  }
  if (unexpectedAdvisories.length > 0) {
    console.error('At least one advisory is not the reviewed Expo transitive advisory.');
  }
  process.exit(1);
}

console.warn(
  `${project}: ${vulnerabilities.length} moderate transitive findings are constrained to ${MOBILE_ADVISORY}; exception expires ${MOBILE_EXCEPTION_EXPIRES}.`,
);
