const {
  constants,
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const { resolve } = require('node:path');

const EXPECTED_ANDROID_PACKAGE = 'com.menorah.healthmobile';
const EXPECTED_FIREBASE_PROJECT_NUMBER = '873291355021';
const MAX_GOOGLE_SERVICES_FILE_BYTES = 1024 * 1024;
const DESTINATION_RELATIVE_PATH = 'android/app/google-services.json';
const MARKER_RELATIVE_PATH = 'android/app/.google-services-prepared';
const MARKER_CONTENT = 'prepared-by-eas-hook\n';
const APPROVED_EAS_PROJECT_ID = 'd7fb6e65-3440-4a79-b4b2-6746d2582fa7';
const APPROVED_PRODUCTION_PROFILE = 'production-android';

class GoogleServicesPreparationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GoogleServicesPreparationError';
  }
}

function validateGoogleServicesDocument(document) {
  const projectNumber = String(document?.project_info?.project_number ?? '');
  if (projectNumber !== EXPECTED_FIREBASE_PROJECT_NUMBER) {
    throw new GoogleServicesPreparationError(
      `GOOGLE_SERVICES_JSON must belong to Firebase project number ${EXPECTED_FIREBASE_PROJECT_NUMBER}.`
    );
  }

  const matchingClient = Array.isArray(document?.client)
    ? document.client.find((client) => (
      client?.client_info?.android_client_info?.package_name === EXPECTED_ANDROID_PACKAGE
    ))
    : undefined;
  if (!matchingClient) {
    throw new GoogleServicesPreparationError(
      `GOOGLE_SERVICES_JSON must contain Android package ${EXPECTED_ANDROID_PACKAGE}.`
    );
  }

  const mobileSdkAppId = matchingClient?.client_info?.mobilesdk_app_id;
  if (
    typeof mobileSdkAppId !== 'string'
    || !mobileSdkAppId.startsWith(`1:${EXPECTED_FIREBASE_PROJECT_NUMBER}:android:`)
  ) {
    throw new GoogleServicesPreparationError(
      'GOOGLE_SERVICES_JSON contains an invalid Android Firebase application ID.'
    );
  }

  return { projectNumber, packageName: EXPECTED_ANDROID_PACKAGE };
}

function validatePlayVersionGate(environment, appConfig) {
  if (environment.MENORAH_MOBILE_ENVIRONMENT !== 'production') return;

  const highestRaw = environment.PLAY_HIGHEST_VERSION_CODE?.trim();
  if (!highestRaw || !/^\d+$/.test(highestRaw)) {
    throw new GoogleServicesPreparationError(
      'PLAY_HIGHEST_VERSION_CODE must be set from a fresh Play Console check before a production Android build.'
    );
  }

  const candidateVersionCode = appConfig?.expo?.android?.versionCode;
  const highestUploadedVersionCode = Number(highestRaw);
  if (!Number.isSafeInteger(candidateVersionCode) || candidateVersionCode <= highestUploadedVersionCode) {
    throw new GoogleServicesPreparationError(
      'The repository Android versionCode must be greater than the freshly confirmed Play Console maximum.'
    );
  }
}

function validateBuildSourceIdentity(environment) {
  if (environment.MENORAH_MOBILE_ENVIRONMENT !== 'production') return;

  const approvedSha = environment.MENORAH_APPROVED_RELEASE_SHA?.trim();
  const buildSha = environment.EAS_BUILD_GIT_COMMIT_HASH?.trim();
  if (!approvedSha || !/^[0-9a-f]{40}$/.test(approvedSha)) {
    throw new GoogleServicesPreparationError(
      'MENORAH_APPROVED_RELEASE_SHA must be the independently approved full lowercase release SHA.'
    );
  }
  if (!buildSha || buildSha !== approvedSha) {
    throw new GoogleServicesPreparationError(
      'The EAS build commit does not match MENORAH_APPROVED_RELEASE_SHA.'
    );
  }
  if (environment.EAS_BUILD_PROFILE !== APPROVED_PRODUCTION_PROFILE) {
    throw new GoogleServicesPreparationError(
      `Production Android builds must use the ${APPROVED_PRODUCTION_PROFILE} profile.`
    );
  }
  if (environment.EAS_BUILD_RUNNER !== 'eas-build') {
    throw new GoogleServicesPreparationError(
      'Production Android builds must run on the guarded EAS cloud builder.'
    );
  }
  if (environment.EAS_BUILD_PROJECT_ID !== APPROVED_EAS_PROJECT_ID) {
    throw new GoogleServicesPreparationError(
      'The production build is running under an unexpected EAS project.'
    );
  }
}

function prepareGoogleServices({
  projectRoot = resolve(__dirname, '..'),
  environment = process.env,
  enforceEasBuildIdentity = true,
} = {}) {
  if (environment.EAS_BUILD_PLATFORM !== 'android') {
    return { skipped: true };
  }

  if (enforceEasBuildIdentity) validateBuildSourceIdentity(environment);

  const configuredSource = environment.GOOGLE_SERVICES_JSON?.trim();
  if (!configuredSource) {
    throw new GoogleServicesPreparationError(
      'GOOGLE_SERVICES_JSON must be configured as a protected EAS file secret.'
    );
  }

  const source = resolve(configuredSource);
  const destination = resolve(projectRoot, DESTINATION_RELATIVE_PATH);
  const marker = resolve(projectRoot, MARKER_RELATIVE_PATH);
  if (source === destination) {
    throw new GoogleServicesPreparationError(
      'GOOGLE_SERVICES_JSON must reference the EAS-provided source file, not the native destination.'
    );
  }

  let sourceStat;
  try {
    sourceStat = statSync(source);
  } catch {
    throw new GoogleServicesPreparationError(
      'GOOGLE_SERVICES_JSON must reference a readable EAS file secret.'
    );
  }
  if (
    !sourceStat.isFile()
    || sourceStat.size <= 0
    || sourceStat.size > MAX_GOOGLE_SERVICES_FILE_BYTES
  ) {
    throw new GoogleServicesPreparationError(
      'GOOGLE_SERVICES_JSON must be a non-empty JSON file within the accepted size limit.'
    );
  }

  let document;
  try {
    document = JSON.parse(readFileSync(source, 'utf8'));
  } catch {
    throw new GoogleServicesPreparationError('GOOGLE_SERVICES_JSON must contain valid JSON.');
  }
  const identity = validateGoogleServicesDocument(document);

  let appConfig;
  try {
    appConfig = JSON.parse(readFileSync(resolve(projectRoot, 'app.json'), 'utf8'));
  } catch {
    throw new GoogleServicesPreparationError('The repository app.json could not be validated.');
  }
  validatePlayVersionGate(environment, appConfig);

  if (existsSync(destination) || existsSync(marker)) {
    throw new GoogleServicesPreparationError(
      'Refusing to overwrite an existing native Google Services file or preparation marker.'
    );
  }

  try {
    copyFileSync(source, destination, constants.COPYFILE_EXCL);
    chmodSync(destination, 0o600);
    writeFileSync(marker, MARKER_CONTENT, { flag: 'wx', mode: 0o600 });
    if ((lstatSync(destination).mode & 0o777) !== 0o600) {
      throw new Error('restrictive mode was not applied');
    }
  } catch {
    rmSync(destination, { force: true });
    rmSync(marker, { force: true });
    throw new GoogleServicesPreparationError(
      'The validated Google Services file could not be installed securely.'
    );
  }

  return { skipped: false, ...identity, destination, marker };
}

if (require.main === module) {
  try {
    const result = prepareGoogleServices();
    if (result.skipped) {
      console.log('Google Services preparation skipped for the non-Android EAS build.');
    } else {
      console.log(
        `Google Services configuration validated for ${result.packageName} and Firebase project ${result.projectNumber}.`
      );
    }
  } catch (error) {
    const message = error instanceof GoogleServicesPreparationError
      ? error.message
      : 'Google Services preparation failed safely.';
    console.error(`Google Services preparation failed: ${message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  APPROVED_EAS_PROJECT_ID,
  APPROVED_PRODUCTION_PROFILE,
  DESTINATION_RELATIVE_PATH,
  EXPECTED_ANDROID_PACKAGE,
  EXPECTED_FIREBASE_PROJECT_NUMBER,
  GoogleServicesPreparationError,
  MARKER_CONTENT,
  MARKER_RELATIVE_PATH,
  prepareGoogleServices,
  validateGoogleServicesDocument,
  validateBuildSourceIdentity,
  validatePlayVersionGate,
};
