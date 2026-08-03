const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  EXPECTED,
  inspectManifestText,
  normalizeFingerprint,
  sha256File,
} = require('./inspect-android-aab.cjs');

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, description) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${description} failed; inspect the local tool output without publishing secrets.`);
  }
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function readApkSignerFingerprint(output) {
  const match = String(output).match(
    /Signer #1 certificate SHA-256 digest:\s*([A-Fa-f0-9:]+)/
  );
  return normalizeFingerprint(match?.[1]);
}

function inspectPlayDeliveredApk({ apkPath, environment = process.env }) {
  const absoluteApk = resolve(apkPath || '');
  requireCondition(apkPath && existsSync(absoluteApk), 'Provide a readable Play-delivered APK.');
  requireCondition(absoluteApk.endsWith('.apk'), 'The Play-delivered artifact must be an .apk file.');

  const expectedPlayFingerprint = normalizeFingerprint(
    environment.EXPECTED_PLAY_APP_SIGNING_CERT_SHA256
  );
  requireCondition(
    expectedPlayFingerprint.length === 64,
    'EXPECTED_PLAY_APP_SIGNING_CERT_SHA256 must contain the Play App Signing certificate SHA-256.'
  );

  const apksigner = environment.APKSIGNER_BIN?.trim() || 'apksigner';
  const apkanalyzer = environment.APKANALYZER_BIN?.trim() || 'apkanalyzer';
  const signerOutput = run(
    apksigner,
    ['verify', '--verbose', '--print-certs', absoluteApk],
    'Play-delivered APK signature verification'
  );
  const actualPlayFingerprint = readApkSignerFingerprint(signerOutput);
  requireCondition(
    actualPlayFingerprint === expectedPlayFingerprint,
    'Play-delivered APK signer does not match the approved Play App Signing certificate.'
  );

  const manifest = run(
    apkanalyzer,
    ['manifest', 'print', absoluteApk],
    'Play-delivered APK manifest inspection'
  );
  inspectManifestText(manifest);

  return {
    apkSha256: sha256File(absoluteApk),
    packageName: EXPECTED.packageName,
    versionName: EXPECTED.versionName,
    versionCode: EXPECTED.versionCode,
    targetSdk: EXPECTED.targetSdk,
    signerSha256: actualPlayFingerprint,
  };
}

if (require.main === module) {
  try {
    const result = inspectPlayDeliveredApk({ apkPath: process.argv[2] });
    console.log(
      `Play APK verified: ${result.packageName} ${result.versionName} (${result.versionCode}), target SDK ${result.targetSdk}, APK SHA-256 ${result.apkSha256}, Play signer SHA-256 ${result.signerSha256}.`
    );
  } catch (error) {
    console.error(`Play APK inspection failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { inspectPlayDeliveredApk, readApkSignerFingerprint };
