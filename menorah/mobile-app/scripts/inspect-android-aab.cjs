const { closeSync, existsSync, openSync, readSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const EXPECTED = Object.freeze({
  packageName: 'com.menorah.healthmobile',
  versionName: '2.7.0',
  versionCode: 15,
  targetSdk: 36,
  firebaseProjectNumber: '873291355021',
  androidApi: 'https://api-android.menorah.me/api',
  webBase: 'https://app.menorah.me',
  checkoutReturn: 'https://app.menorah.me/checkout/return',
  articleCanonical: 'https://menorah.me',
  callBase: 'https://calls.menorah.me',
  googleWebClientId:
    '873291355021-soma7nima003rvq9usj8fqj0t9kbjm6a.apps.googleusercontent.com',
  googleAndroidClientId:
    '873291355021-bi43pprpqlks9hvpjdto7kt0ekcbefr8.apps.googleusercontent.com',
});

const REQUIRED_PERMISSIONS = [
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.INTERNET',
];
const PROHIBITED_PERMISSIONS = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_PHONE_STATE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeFingerprint(value) {
  return String(value || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
}

function sha256File(filePath) {
  const digest = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = openSync(filePath, 'r');
  try {
    let bytesRead;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(descriptor);
  }
  return digest.digest('hex');
}

function inspectManifestText(manifest) {
  requireCondition(
    new RegExp(`package="${EXPECTED.packageName.replace(/\./g, '\\.')}"`).test(manifest),
    'AAB package name is not the approved production package.'
  );
  requireCondition(
    new RegExp(`(?:android:)?versionCode="${EXPECTED.versionCode}"`).test(manifest),
    'AAB versionCode is not the approved candidate value.'
  );
  requireCondition(
    new RegExp(`(?:android:)?versionName="${EXPECTED.versionName.replace(/\./g, '\\.')}"`).test(manifest),
    'AAB versionName is not 2.7.0.'
  );
  requireCondition(
    new RegExp(`(?:android:)?targetSdkVersion="${EXPECTED.targetSdk}"`).test(manifest),
    'AAB target SDK is not 36.'
  );
  requireCondition(!/(?:android:)?debuggable="true"/.test(manifest), 'AAB is debuggable.');
  requireCondition(
    /(?:android:)?usesCleartextTraffic="false"/.test(manifest),
    'AAB does not explicitly disable cleartext traffic.'
  );
  requireCondition(
    !/(?:android:)?networkSecurityConfig=/.test(manifest),
    'AAB contains a network security configuration that requires separate review.'
  );

  for (const permission of REQUIRED_PERMISSIONS) {
    requireCondition(manifest.includes(permission), `AAB is missing ${permission}.`);
  }
  for (const permission of PROHIBITED_PERMISSIONS) {
    requireCondition(!manifest.includes(permission), `AAB contains prohibited permission ${permission}.`);
  }

  for (const component of [
    'expo.modules.notifications.service.ExpoFirebaseMessagingService',
    'expo.modules.notifications.service.NotificationsService',
    'expo.modules.notifications.service.NotificationForwarderActivity',
    'com.google.firebase.MESSAGING_EVENT',
  ]) {
    requireCondition(manifest.includes(component), `AAB is missing notification component ${component}.`);
  }
  for (const metadata of [
    'com.google.firebase.messaging.default_notification_icon',
    'com.google.firebase.messaging.default_notification_color',
    'com.google.firebase.messaging.default_notification_channel_id',
  ]) {
    requireCondition(manifest.includes(metadata), `AAB is missing notification metadata ${metadata}.`);
  }
  requireCondition(manifest.includes('general'), 'AAB does not use the general fallback channel.');
  requireCondition(
    manifest.includes('android:host="app.menorah.me"')
      && manifest.includes('android:path="/reset-password"'),
    'AAB does not contain the canonical password-reset App Link.'
  );
}

function inspectResourceText(resources) {
  requireCondition(
    resources.includes('expo_runtime_version') && resources.includes(EXPECTED.versionName),
    'AAB runtime version resource is not 2.7.0.'
  );
  requireCondition(
    resources.includes('gcm_defaultSenderId')
      && resources.includes(EXPECTED.firebaseProjectNumber),
    'AAB Firebase sender ID does not match the approved project.'
  );
  requireCondition(
    resources.includes('google_app_id')
      && resources.includes(`1:${EXPECTED.firebaseProjectNumber}:android:`),
    'AAB Firebase Android application ID does not match the approved project.'
  );
  requireCondition(
    resources.includes('notification_icon_color'),
    'AAB notification color resource is missing.'
  );
}

function inspectEmbeddedBundleText(bundleText) {
  for (const value of [
    EXPECTED.androidApi,
    EXPECTED.webBase,
    EXPECTED.checkoutReturn,
    EXPECTED.articleCanonical,
    EXPECTED.callBase,
    EXPECTED.googleWebClientId,
    EXPECTED.googleAndroidClientId,
  ]) {
    requireCondition(bundleText.includes(value), `AAB JavaScript bundle is missing approved value ${value}.`);
  }
}

function run(command, args, description, encoding = 'utf8') {
  const result = spawnSync(command, args, {
    encoding,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${description} failed; inspect the local tool output without publishing secrets.`);
  }
  return result.stdout;
}

function runWithInput(command, args, description, input) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    input,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${description} failed; inspect the local tool output without publishing secrets.`);
  }
  return result.stdout;
}

function inspectAndroidAab({ aabPath, environment = process.env }) {
  const absoluteAab = resolve(aabPath || '');
  requireCondition(aabPath && existsSync(absoluteAab), 'Provide a readable Android AAB path.');
  requireCondition(absoluteAab.endsWith('.aab'), 'The artifact must be an .aab file.');

  const bundletoolJar = environment.BUNDLETOOL_JAR?.trim();
  requireCondition(bundletoolJar && existsSync(bundletoolJar), 'BUNDLETOOL_JAR must reference bundletool.');

  const highestRaw = environment.PLAY_HIGHEST_VERSION_CODE?.trim();
  requireCondition(highestRaw && /^\d+$/.test(highestRaw), 'PLAY_HIGHEST_VERSION_CODE is required.');
  requireCondition(
    EXPECTED.versionCode > Number(highestRaw),
    'Candidate versionCode is not greater than the fresh Play Console maximum.'
  );

  const expectedFingerprint = normalizeFingerprint(
    environment.EXPECTED_ANDROID_UPLOAD_CERT_SHA256
  );
  requireCondition(
    expectedFingerprint.length === 64,
    'EXPECTED_ANDROID_UPLOAD_CERT_SHA256 must contain the approved upload certificate SHA-256.'
  );

  const manifest = run(
    'java',
    ['-jar', bundletoolJar, 'dump', 'manifest', '--bundle', absoluteAab, '--module', 'base'],
    'bundletool manifest inspection'
  );
  inspectManifestText(manifest);

  const resources = run(
    'java',
    ['-jar', bundletoolJar, 'dump', 'resources', '--bundle', absoluteAab],
    'bundletool resource inspection'
  );
  inspectResourceText(resources);

  // Android upload certificates are normally self-signed. Verify archive
  // integrity without treating an untrusted certificate chain as corruption,
  // then enforce trust by comparing the exact approved fingerprint below.
  run('jarsigner', ['-verify', '-verbose', absoluteAab], 'AAB JAR-signature verification');
  const certificate = run(
    'keytool',
    ['-printcert', '-jarfile', absoluteAab],
    'AAB signer-certificate inspection'
  );
  const actualFingerprint = normalizeFingerprint(
    certificate.match(/SHA256:\s*([A-Fa-f0-9:]+)/)?.[1]
  );
  requireCondition(
    actualFingerprint === expectedFingerprint,
    'AAB signer does not match the approved EAS upload certificate.'
  );
  const certificatePem = run(
    'keytool',
    ['-printcert', '-rfc', '-jarfile', absoluteAab],
    'AAB signer-certificate export'
  );
  requireCondition(
    certificatePem.includes('BEGIN CERTIFICATE'),
    'AAB signer certificate could not be exported.'
  );
  runWithInput(
    'openssl',
    ['x509', '-checkend', '7776000', '-noout'],
    'AAB signer-certificate validity check',
    certificatePem
  );

  const embeddedBundle = run(
    'unzip',
    ['-p', absoluteAab, 'base/assets/index.android.bundle'],
    'embedded JavaScript extraction',
    'latin1'
  );
  inspectEmbeddedBundleText(embeddedBundle);

  return {
    aabSha256: sha256File(absoluteAab),
    packageName: EXPECTED.packageName,
    versionName: EXPECTED.versionName,
    versionCode: EXPECTED.versionCode,
    targetSdk: EXPECTED.targetSdk,
    signerSha256: actualFingerprint,
  };
}

if (require.main === module) {
  try {
    const result = inspectAndroidAab({ aabPath: process.argv[2] });
    console.log(
      `Android AAB verified: ${result.packageName} ${result.versionName} (${result.versionCode}), target SDK ${result.targetSdk}, AAB SHA-256 ${result.aabSha256}, signer SHA-256 ${result.signerSha256}.`
    );
  } catch (error) {
    console.error(`Android AAB inspection failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  EXPECTED,
  inspectAndroidAab,
  inspectEmbeddedBundleText,
  inspectManifestText,
  inspectResourceText,
  normalizeFingerprint,
  sha256File,
};
