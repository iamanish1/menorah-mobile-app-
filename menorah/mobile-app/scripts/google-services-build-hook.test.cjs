const assert = require('node:assert/strict');
const { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { cleanupGoogleServices } = require('./cleanup-google-services.cjs');
const {
  prepareGoogleServices,
  validateBuildSourceIdentity,
  validateGoogleServicesDocument,
  validatePlayVersionGate,
} = require('./prepare-google-services.cjs');

const APPROVED_SHA = 'a'.repeat(40);
const productionBuildEnvironment = (overrides = {}) => ({
  EAS_BUILD_PLATFORM: 'android',
  EAS_BUILD_GIT_COMMIT_HASH: APPROVED_SHA,
  EAS_BUILD_PROFILE: 'production-android',
  EAS_BUILD_PROJECT_ID: 'd7fb6e65-3440-4a79-b4b2-6746d2582fa7',
  EAS_BUILD_RUNNER: 'eas-build',
  MENORAH_APPROVED_RELEASE_SHA: APPROVED_SHA,
  MENORAH_MOBILE_ENVIRONMENT: 'production',
  PLAY_HIGHEST_VERSION_CODE: '14',
  ...overrides,
});

const validDocument = () => ({
  project_info: { project_number: '873291355021', project_id: 'test-project' },
  client: [{
    client_info: {
      mobilesdk_app_id: '1:873291355021:android:0123456789abcdef',
      android_client_info: { package_name: 'com.menorah.healthmobile' },
    },
  }],
});

const createProject = () => {
  const root = mkdtempSync(join(tmpdir(), 'menorah-google-services-'));
  mkdirSync(join(root, 'android', 'app'), { recursive: true });
  writeFileSync(join(root, 'app.json'), JSON.stringify({
    expo: { android: { versionCode: 15 } },
  }));
  const source = join(root, 'eas-secret-google-services.json');
  writeFileSync(source, JSON.stringify(validDocument()), { mode: 0o600 });
  return { root, source };
};

test('validates only the approved Firebase project and Android package', () => {
  assert.deepEqual(validateGoogleServicesDocument(validDocument()), {
    projectNumber: '873291355021',
    packageName: 'com.menorah.healthmobile',
  });

  const wrongProject = validDocument();
  wrongProject.project_info.project_number = '999999999999';
  assert.throws(() => validateGoogleServicesDocument(wrongProject), /Firebase project number/);

  const wrongPackage = validDocument();
  wrongPackage.client[0].client_info.android_client_info.package_name = 'com.example.other';
  assert.throws(() => validateGoogleServicesDocument(wrongPackage), /com\.menorah\.healthmobile/);
});

test('production builds require a fresh lower Play maximum', () => {
  const appConfig = { expo: { android: { versionCode: 15 } } };
  assert.doesNotThrow(() => validatePlayVersionGate({
    MENORAH_MOBILE_ENVIRONMENT: 'production',
    PLAY_HIGHEST_VERSION_CODE: '14',
  }, appConfig));
  assert.throws(() => validatePlayVersionGate({
    MENORAH_MOBILE_ENVIRONMENT: 'production',
  }, appConfig), /fresh Play Console check/);
  assert.throws(() => validatePlayVersionGate({
    MENORAH_MOBILE_ENVIRONMENT: 'production',
    PLAY_HIGHEST_VERSION_CODE: '15',
  }, appConfig), /greater than/);
});

test('production build source must match the exact approved EAS commit and project', () => {
  assert.doesNotThrow(() => validateBuildSourceIdentity(productionBuildEnvironment()));
  assert.throws(
    () => validateBuildSourceIdentity(productionBuildEnvironment({
      EAS_BUILD_GIT_COMMIT_HASH: 'b'.repeat(40),
    })),
    /does not match/
  );
  assert.throws(
    () => validateBuildSourceIdentity(productionBuildEnvironment({
      MENORAH_APPROVED_RELEASE_SHA: '',
    })),
    /full lowercase release SHA/
  );
  assert.throws(
    () => validateBuildSourceIdentity(productionBuildEnvironment({
      EAS_BUILD_PROFILE: 'preview-android',
    })),
    /production-android/
  );
  assert.throws(
    () => validateBuildSourceIdentity(productionBuildEnvironment({
      EAS_BUILD_PROJECT_ID: 'wrong-project',
    })),
    /unexpected EAS project/
  );
});

test('EAS hook installs with mode 0600 and cleanup removes only its marked copy', () => {
  const { root, source } = createProject();
  try {
    const environment = productionBuildEnvironment({
      GOOGLE_SERVICES_JSON: source,
    });
    const result = prepareGoogleServices({ projectRoot: root, environment });
    assert.equal(result.skipped, false);
    assert.deepEqual(JSON.parse(readFileSync(result.destination, 'utf8')), validDocument());
    assert.equal(statSync(result.destination).mode & 0o777, 0o600);

    const cleanup = cleanupGoogleServices({ projectRoot: root, environment });
    assert.deepEqual(cleanup, { skipped: false, removed: true });
    assert.equal(cleanupGoogleServices({ projectRoot: root, environment }).removed, false);
  } finally {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

test('EAS hook fails closed for a missing file secret and never overwrites a destination', () => {
  const { root, source } = createProject();
  try {
    assert.throws(() => prepareGoogleServices({
      projectRoot: root,
      environment: { EAS_BUILD_PLATFORM: 'android' },
    }), /protected EAS file secret/);

    writeFileSync(join(root, 'android', 'app', 'google-services.json'), 'existing');
    assert.throws(() => prepareGoogleServices({
      projectRoot: root,
      environment: {
        EAS_BUILD_PLATFORM: 'android',
        MENORAH_MOBILE_ENVIRONMENT: 'preview',
        GOOGLE_SERVICES_JSON: source,
      },
    }), /Refusing to overwrite/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cleanup refuses an unrecognized marker instead of deleting a local file', () => {
  const { root } = createProject();
  const destination = join(root, 'android', 'app', 'google-services.json');
  try {
    writeFileSync(destination, 'local-file');
    writeFileSync(join(root, 'android', 'app', '.google-services-prepared'), 'not-our-marker');
    assert.throws(
      () => cleanupGoogleServices({
        projectRoot: root,
        environment: { EAS_BUILD_PLATFORM: 'android' },
      }),
      /unrecognized/
    );
    assert.equal(existsSync(destination), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
