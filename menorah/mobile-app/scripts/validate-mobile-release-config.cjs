const { readFileSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const normalizeText = (value) => value.replace(/\r\n?/g, '\n');
const read = (root, relativePath) =>
  normalizeText(readFileSync(join(root, relativePath), 'utf8'));
const readJson = (root, relativePath) => JSON.parse(read(root, relativePath));

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function collectSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(absolute);
    }
    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [absolute] : [];
  });
}

function valuesAfterKey(plist, key) {
  const pattern = new RegExp(
    `<key>${escapeRegex(key)}</key>\\s*<string>([^<]+)</string>`,
    'g'
  );
  return Array.from(plist.matchAll(pattern), (match) => match[1]);
}

function privacyReasons(plist, category) {
  const escapedCategory = escapeRegex(category);
  const match = plist.match(
    new RegExp(
      `<string>${escapedCategory}</string>[\\s\\S]*?<key>NSPrivacyAccessedAPITypeReasons</key>\\s*<array>([\\s\\S]*?)</array>`
    )
  );
  return match
    ? Array.from(match[1].matchAll(/<string>([^<]+)<\/string>/g), (item) => item[1])
    : [];
}

function isExpectedHttpsApiUrl(value, expectedHost) {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === expectedHost &&
      url.pathname === '/api' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch (_error) {
    return false;
  }
}

const RELEASE_URL_VARIABLES = [
  'EXPO_PUBLIC_IOS_API_BASE_URL',
  'EXPO_PUBLIC_ANDROID_API_BASE_URL',
  'EXPO_PUBLIC_WEB_BASE_URL',
  'EXPO_PUBLIC_CHECKOUT_RETURN_URL',
  'EXPO_PUBLIC_JITSI_BASE_URL',
];

const PRODUCTION_RELEASE_HOSTS = new Set([
  'api-ios.menorah.me',
  'api-android.menorah.me',
  'app.menorah.me',
  'calls.menorah.me',
]);

function resolveBuildProfile(eas, profileName, seen = new Set()) {
  const profile = eas.build?.[profileName];
  if (!profile || seen.has(profileName)) return null;

  const nextSeen = new Set(seen).add(profileName);
  const parent = profile.extends
    ? resolveBuildProfile(eas, profile.extends, nextSeen)
    : {};
  if (profile.extends && !parent) return null;

  return {
    ...parent,
    ...profile,
    android: { ...(parent.android || {}), ...(profile.android || {}) },
    ios: { ...(parent.ios || {}), ...(profile.ios || {}) },
    env: { ...(parent.env || {}), ...(profile.env || {}) },
  };
}

function containsProductionReleaseHost(values) {
  return Object.values(values || {}).some((value) => {
    if (typeof value !== 'string') return false;
    try {
      return PRODUCTION_RELEASE_HOSTS.has(new URL(value).hostname.toLowerCase());
    } catch {
      return false;
    }
  });
}

function validateProject(root = projectRoot) {
  const failures = [];
  const fail = (condition, message) => {
    if (!condition) failures.push(message);
  };

  const pkg = readJson(root, 'package.json');
  const repositoryRoot = resolve(root, '..', '..');
  const app = readJson(root, 'app.json').expo;
  const eas = readJson(root, 'eas.json');
  const appConfig = read(root, 'app.config.ts');
  const envSource = read(root, 'src/lib/env.ts');
  const androidGradle = read(root, 'android/app/build.gradle');
  const androidManifest = read(root, 'android/app/src/main/AndroidManifest.xml');
  const androidStrings = read(root, 'android/app/src/main/res/values/strings.xml');
  const androidStyles = read(root, 'android/app/src/main/res/values/styles.xml');
  const androidColors = read(root, 'android/app/src/main/res/values/colors.xml');
  const mainActivity = read(
    root,
    'android/app/src/main/java/com/menorah/healthmobile/MainActivity.kt'
  );
  const mainApplication = read(
    root,
    'android/app/src/main/java/com/menorah/healthmobile/MainApplication.kt'
  );
  const appDelegate = read(root, 'ios/MenorahHealth/AppDelegate.swift');
  const infoPlist = read(root, 'ios/MenorahHealth/Info.plist');
  const podfile = read(root, 'ios/Podfile');
  const podfileProperties = readJson(root, 'ios/Podfile.properties.json');
  const expoPlist = read(root, 'ios/MenorahHealth/Supporting/Expo.plist');
  const entitlements = read(root, 'ios/MenorahHealth/MenorahHealth.entitlements');
  const project = read(root, 'ios/MenorahHealth.xcodeproj/project.pbxproj');
  const privacy = read(root, 'ios/MenorahHealth/PrivacyInfo.xcprivacy');
  const secureStorage = read(root, 'src/lib/secureStorage.ts');
  const secureTokenPolicy = read(root, 'src/lib/secureTokenPolicy.js');
  const subscriptionService = read(root, 'src/services/subscriptionService.ts');
  const rootNavigator = read(root, 'src/navigation/RootNavigator.tsx');
  const captureProtection = read(root, 'src/components/SensitiveContentProtection.tsx');
  const notificationState = read(root, 'src/state/useNotifications.tsx');
  const apiSource = read(root, 'src/lib/api.ts');
  const appSource = read(root, 'App.tsx');
  const authState = read(root, 'src/state/useAuth.tsx');
  const chatState = read(root, 'src/state/useChat.tsx');
  const chatList = read(root, 'src/screens/chat/ChatList.tsx');
  const socketSource = read(root, 'src/lib/socket.ts');
  const queryHooks = read(root, 'src/hooks/useQueries.ts');
  const errorBoundary = read(root, 'src/components/ErrorBoundary.tsx');
  const resetPassword = read(root, 'src/screens/auth/ResetPassword.tsx');
  const editProfile = read(root, 'src/screens/profile/EditProfile.tsx');
  const settingsScreen = read(root, 'src/screens/profile/Settings.tsx');
  const pushNotifications = read(root, 'src/services/pushNotifications.ts');
  const socialAuthButtons = read(root, 'src/components/auth/SocialAuthButtons.tsx');
  const changePassword = read(root, 'src/screens/profile/ChangePassword.tsx');
  const safeDiagnostics = read(root, 'src/lib/safeDiagnostics.ts');
  const mobileStoreActions = read(root, 'docs/mobile-store-external-actions.md');
  const androidBuildWorkflow = read(
    repositoryRoot,
    '.github/workflows/build-android.yml'
  );
  const wrapperPkg = readJson(root, 'mobile-app/package.json');
  const version = pkg.version;
  const buildNumber = String(app.ios.buildNumber);
  const iosBundleIdentifier = 'com.menorah.health.app';
  const androidPackageName = 'com.menorah.healthmobile';

  const expectedExpoVersions = {
    expo: '~57.0.8',
    'expo-constants': '~57.0.7',
    'expo-dev-client': '~57.0.9',
    'expo-image-picker': '~57.0.6',
    'expo-linking': '~57.0.4',
    'expo-updates': '~57.0.10',
    'react-native-screens': '~4.26.0',
  };
  for (const [name, expected] of Object.entries(expectedExpoVersions)) {
    fail(pkg.dependencies[name] === expected, `${name} must be ${expected}`);
  }
  fail(
    pkg.devDependencies['@expo/metro-runtime'] === '~57.0.7',
    '@expo/metro-runtime must be ~57.0.7'
  );
  fail(
    pkg.dependencies['expo-screen-capture'] === '~57.0.1',
    'expo-screen-capture must remain installed at the SDK-compatible version'
  );
  fail(
    pkg.dependencies['expo-apple-authentication'] === '~57.0.1',
    'expo-apple-authentication must remain installed at the SDK-compatible version'
  );
  fail(
    !pkg.dependencies['@stomp/stompjs'],
    'unused STOMP client must not return to the production bundle'
  );
  fail(
    wrapperPkg.dependencies.expo === '~57.0.8',
    'nested mobile wrapper must use Expo ~57.0.8'
  );
  fail(
    app.ios.bundleIdentifier === iosBundleIdentifier &&
      app.android.package === androidPackageName,
    'app.json store identifiers must remain production-aligned'
  );
  fail(
    appConfig.includes(`bundleIdentifier: '${iosBundleIdentifier}'`) &&
      appConfig.includes(`package: '${androidPackageName}'`),
    'app.config.ts store identifiers must remain production-aligned'
  );
  fail(
    app.orientation === 'portrait' &&
      app.userInterfaceStyle === 'automatic' &&
      appConfig.includes("orientation: 'portrait'") &&
      appConfig.includes("userInterfaceStyle: 'automatic'") &&
      !infoPlist.includes('UIInterfaceOrientationLandscape'),
    'Expo and native projects must agree on portrait-only automatic appearance'
  );
  fail(
    new RegExp(`applicationId\\s+'${escapeRegex(androidPackageName)}'`).test(
      androidGradle
    ) &&
      project.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${iosBundleIdentifier};`),
    'native store identifiers must match app configuration'
  );
  fail(
    eas.cli && eas.cli.appVersionSource === 'local',
    'EAS must use the repository-aligned local version metadata'
  );
  for (const [profileName, expectedEnvironment] of [
    ['development-ios', 'development'],
    ['development-android', 'development'],
    ['preview-ios', 'preview'],
    ['preview-android', 'preview'],
  ]) {
    const profile = resolveBuildProfile(eas, profileName);
    fail(
      profile
        && profile.environment === expectedEnvironment
        && profile.env.MENORAH_MOBILE_ENVIRONMENT === expectedEnvironment
        && !containsProductionReleaseHost(profile.env)
        && RELEASE_URL_VARIABLES.every((name) => !(name in profile.env))
        && !profile.env.EXPO_PUBLIC_API_BASE_URL,
      `${profileName} must source release URLs from its explicit non-production EAS environment without embedded production origins`
    );
  }
  for (const profileName of ['production-ios', 'production-android']) {
    const profile = resolveBuildProfile(eas, profileName);
    const profileEnv = profile?.env || {};
    fail(
      profile
        && profile.environment === 'production'
        && profile.env.MENORAH_MOBILE_ENVIRONMENT === 'production'
        && isExpectedHttpsApiUrl(
          profileEnv.EXPO_PUBLIC_IOS_API_BASE_URL,
          'api-ios.menorah.me'
        )
        && isExpectedHttpsApiUrl(
          profileEnv.EXPO_PUBLIC_ANDROID_API_BASE_URL,
          'api-android.menorah.me'
        )
        && !profileEnv.EXPO_PUBLIC_API_BASE_URL,
      `${profileName} must retain the approved production platform API URLs in the production EAS environment`
    );
  }
  fail(
    appConfig.includes("require('./scripts/release-environment.cjs')") &&
      appConfig.includes('readReleaseEnvironment(process.env)') &&
      RELEASE_URL_VARIABLES.every((name) =>
        androidBuildWorkflow.includes(`${name}: \${{ vars.${name} }}`)
      ) &&
      [
        'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
        'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
      ].every((name) =>
        androidBuildWorkflow.includes(`${name}: \${{ vars.${name} }}`)
      ) &&
      androidBuildWorkflow.includes('NODE_ENV: production') &&
      androidBuildWorkflow.includes('MENORAH_MOBILE_ENVIRONMENT: production') &&
      androidBuildWorkflow.includes('environment: android-release-signing') &&
      androidBuildWorkflow.includes('GITHUB_TRIGGER_REF: ${{ github.ref }}') &&
      androidBuildWorkflow.includes('GITHUB_TRIGGER_SHA: ${{ github.sha }}') &&
      androidBuildWorkflow.includes(
        'ANDROID_RELEASE_SIGNING_READY: ${{ vars.ANDROID_RELEASE_SIGNING_READY }}'
      ) &&
      androidBuildWorkflow.includes(
        '"$GITHUB_TRIGGER_REF" != "refs/heads/main" || "$RELEASE_SHA" != "$GITHUB_TRIGGER_SHA"'
      ) &&
      androidBuildWorkflow.includes(
        '"$ANDROID_RELEASE_SIGNING_READY" != "protected-main-only"'
      ) &&
      androidBuildWorkflow.includes('release_sha:') &&
      androidBuildWorkflow.includes('ref: ${{ inputs.release_sha }}') &&
      androidBuildWorkflow.includes('persist-credentials: false') &&
      androidBuildWorkflow.includes("readAndroidReleaseEnvironment(process.env)") &&
      androidBuildWorkflow.indexOf('Validate release environment') <
        androidBuildWorkflow.indexOf('Decode keystore'),
    'manual Android release builds must bind an exact approved SHA and validate protected release variables before accessing signing material'
  );
  fail(
    envSource.includes("Platform.OS === 'ios'") &&
      envSource.includes('EXPO_PUBLIC_IOS_API_BASE_URL') &&
      envSource.includes('EXPO_PUBLIC_ANDROID_API_BASE_URL') &&
      envSource.includes('__DEV__\n    ? (process.env.EXPO_PUBLIC_API_BASE_URL?.trim())') &&
      appConfig.includes('IOS_API_BASE_URL: configuredIosApiBaseUrl') &&
      appConfig.includes('ANDROID_API_BASE_URL: configuredAndroidApiBaseUrl'),
    'runtime and baked configuration must select the platform-specific API URL'
  );
  fail(
    pkg.scripts.update ===
      'eas update --channel production --environment production --message' &&
      pkg.scripts['update:preview'] ===
      'eas update --channel preview --environment preview --message' &&
      mobileStoreActions.includes('Build-profile `env` values do not') &&
      mobileStoreActions.includes('Never run an unqualified `eas update`.'),
    'OTA scripts must bind channels to explicit EAS environments and retain the external variable check'
  );

  fail(app.version === version, 'app.json version must equal package.json version');
  fail(app.runtimeVersion === version, 'Expo runtimeVersion must equal the app version');
  fail(
    new RegExp(`version:\\s*'${escapeRegex(version)}'`).test(appConfig),
    'app.config.ts version must equal package.json version'
  );
  fail(
    new RegExp(`runtimeVersion:\\s*'${escapeRegex(version)}'`).test(appConfig),
    'app.config.ts runtimeVersion must equal package.json version'
  );
  fail(
    new RegExp(`buildNumber:\\s*'${escapeRegex(buildNumber)}'`).test(appConfig),
    'app.config.ts iOS build number must equal app.json'
  );
  fail(
    new RegExp(`versionCode:\\s*${escapeRegex(String(app.android.versionCode))}\\b`).test(
      appConfig
    ),
    'app.config.ts Android version code must equal app.json'
  );
  fail(
    new RegExp(`versionName\\s+"${escapeRegex(version)}"`).test(androidGradle),
    'Android versionName must equal package.json version'
  );
  fail(
    new RegExp(`versionCode\\s+${escapeRegex(String(app.android.versionCode))}\\b`).test(
      androidGradle
    ),
    'Android native versionCode must equal app.json'
  );
  fail(
    valuesAfterKey(infoPlist, 'CFBundleShortVersionString')[0] === version,
    'iOS CFBundleShortVersionString must equal package.json version'
  );
  fail(
    valuesAfterKey(infoPlist, 'CFBundleVersion')[0] === buildNumber,
    'iOS CFBundleVersion must equal app.json buildNumber'
  );
  const marketingVersions = Array.from(
    project.matchAll(/MARKETING_VERSION = ([^;]+);/g),
    (match) => match[1]
  );
  fail(
    marketingVersions.length > 0 && marketingVersions.every((value) => value === version),
    'all Xcode MARKETING_VERSION values must equal package.json version'
  );
  const projectVersions = Array.from(
    project.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g),
    (match) => match[1]
  );
  fail(
    projectVersions.length > 0 && projectVersions.every((value) => value === buildNumber),
    'all Xcode CURRENT_PROJECT_VERSION values must equal app.json buildNumber'
  );
  const deploymentTargets = Array.from(
    project.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([^;]+);/g),
    (match) => match[1]
  );
  fail(
    deploymentTargets.length > 0 &&
      deploymentTargets.every((value) => value === '16.4') &&
      podfile.includes("platform :ios, podfile_properties['ios.deploymentTarget'] || '16.4'") &&
      podfileProperties['ios.deploymentTarget'] === '16.4' &&
      podfileProperties.newArchEnabled === 'true' &&
      valuesAfterKey(infoPlist, 'LSMinimumSystemVersion')[0] === '16.4' &&
      appConfig.includes("LSMinimumSystemVersion: '16.4'"),
    'SDK 57 native iOS configuration must consistently target iOS 16.4 with New Architecture'
  );
  fail(
    androidStrings.includes(`<string name="expo_runtime_version">${version}</string>`),
    'Android Expo runtime version must equal package.json version'
  );
  fail(
    app.android.adaptiveIcon.backgroundColor === '#f0f9f4' &&
      app.android.adaptiveIcon.foregroundImage === './assets/brand/menorah-logo-no-bg.png' &&
      app.androidStatusBar.backgroundColor === '#2d7a5c' &&
      appConfig.includes("backgroundColor: '#2d7a5c'") &&
      androidStyles.includes('<item name="android:statusBarColor">#2d7a5c</item>') &&
      androidColors.includes('<color name="iconBackground">#f0f9f4</color>'),
    'Expo and native Android status-bar and adaptive-icon colors must remain aligned'
  );
  fail(
    valuesAfterKey(expoPlist, 'EXUpdatesRuntimeVersion')[0] === version,
    'iOS Expo runtime version must equal package.json version'
  );

  fail(
    (app.ios.associatedDomains || []).includes('applinks:app.menorah.me'),
    'app.json must declare the canonical iOS associated domain'
  );
  fail(
    entitlements.includes('<string>applinks:app.menorah.me</string>'),
    'native iOS entitlements must declare the canonical associated domain'
  );
  fail(
    androidManifest.includes('android:autoVerify="true"') &&
      androidManifest.includes('android:host="app.menorah.me"') &&
      androidManifest.includes('android:path="/reset-password"') &&
      !androidManifest.includes('android:pathPrefix="/reset-password"'),
    'Android must verify only the canonical password-reset App Link path'
  );
  fail(
    appConfig.includes("associatedDomains: ['applinks:app.menorah.me']") &&
      appConfig.includes("path: '/reset-password'"),
    'app.config.ts must mirror the native associated-link scope'
  );
  const cameraUsage =
    'Menorah Health uses the camera for optional face verification and video support sessions.';
  fail(
    appConfig.includes(`cameraPermission: '${cameraUsage}'`) &&
      infoPlist.includes(`<string>${cameraUsage}</string>`),
    'the archived iOS camera prompt must disclose face verification and video sessions'
  );
  for (const permission of [
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_PHONE_STATE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
  ]) {
    fail(
      (app.android.blockedPermissions || []).includes(permission) &&
        new RegExp(
          `<uses-permission[^>]+android:name="${escapeRegex(permission)}"[^>]+tools:node="remove"`
        ).test(androidManifest),
      `${permission} must be blocked because the app has no approved direct use for it`
    );
  }
  fail(
    mainActivity.includes('addFlags(WindowManager.LayoutParams.FLAG_SECURE)') &&
      !mainActivity.includes('clearFlags(WindowManager.LayoutParams.FLAG_SECURE)'),
    'MainActivity must enforce FLAG_SECURE for the complete Android lifecycle'
  );
  fail(
    mainApplication.includes('ExpoReactHostFactory.getDefaultReactHost(') &&
      !mainApplication.includes('ReactNativeHostWrapper') &&
      !mainApplication.includes('DefaultReactNativeHost') &&
      !mainApplication.includes('reactNativeHost:'),
    'Android must use the Expo SDK 57 ReactHost factory template'
  );
  fail(
    androidGradle.includes("require.resolve('hermes-compiler/package.json'") &&
      androidGradle.includes(' + "/hermesc/%OS-BIN%/hermesc"') &&
      !androidGradle.includes('/sdks/hermesc/'),
    'Android must resolve the Expo SDK 57 hermes-compiler binary'
  );
  fail(
    androidGradle.includes("'true'.equalsIgnoreCase(System.getenv('EAS_BUILD'))") &&
      androidGradle.includes("file('eas-build.gradle').isFile()") &&
      androidGradle.includes("rootProject.file('../credentials.json').isFile()") &&
      androidGradle.includes('gradle.taskGraph.whenReady') &&
      androidGradle.includes('Release task resolved without a complete readable signing configuration') &&
      !androidGradle.includes('if (releaseBuildRequested || releaseSigningPartiallyConfigured)'),
    'Android release signing must accept verified EAS injection and still fail closed after task resolution'
  );
  fail(
    appDelegate.includes('internal import Expo') &&
      appDelegate.includes('@main') &&
      !appDelegate.includes('@UIApplicationMain') &&
      !appDelegate.includes('bindReactNativeFactory'),
    'iOS AppDelegate must use the Expo SDK 57 entry-point template'
  );
  fail(
    captureProtection.includes('preventScreenCaptureAsync') &&
      captureProtection.includes('enableAppSwitcherProtectionAsync') &&
      !captureProtection.includes('isAuthed'),
    'all app screens and iOS app-switcher snapshots must remain protected'
  );
  fail(
    appSource.includes('<SensitiveContentProtection />') &&
      resetPassword.includes("usePreventScreenCapture('password-reset')"),
    'capture protection must be mounted globally and on password reset'
  );

  const expectedPrivacyReasons = {
    NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'],
    NSPrivacyAccessedAPICategoryFileTimestamp: ['C617.1'],
    NSPrivacyAccessedAPICategoryDiskSpace: ['E174.1'],
    NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1'],
  };
  for (const [category, expectedReasons] of Object.entries(expectedPrivacyReasons)) {
    const actual = privacyReasons(privacy, category);
    fail(
      JSON.stringify(actual) === JSON.stringify(expectedReasons),
      `${category} reasons must be ${expectedReasons.join(', ')}`
    );
  }
  fail(!/0A2A\.1|3B52\.1|85F4\.1/.test(privacy), 'privacy manifest has inapplicable reasons');
  fail(
    !/<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/.test(privacy),
    'privacy manifest must not make an empty collected-data declaration'
  );

  fail(
    secureStorage.includes('SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY'),
    'tokens must use WHEN_UNLOCKED_THIS_DEVICE_ONLY'
  );
  fail(
    !secureStorage.includes('SecureStore.AFTER_FIRST_UNLOCK'),
    'tokens must not remain accessible after first unlock'
  );
  fail(
    secureStorage.includes('TOKEN_CLEAR_PENDING_KEY') &&
      secureStorage.includes('createSecureTokenStorage') &&
      secureTokenPolicy.includes('finishPendingClear') &&
      secureTokenPolicy.includes('migrateSecureTokenPolicy') &&
      !/AsyncStorage\.\w+\(\s*TOKEN_KEY\b/.test(secureStorage),
    'AsyncStorage may hold only the non-secret credential-deletion tombstone'
  );
  fail(
    !subscriptionService.includes('AsyncStorage'),
    'subscription entitlement must never fall back to AsyncStorage'
  );
  fail(
    rootNavigator.includes('splitDeepLinkPath') &&
      rootNavigator.includes('extractPasswordResetToken') &&
      /\.\.\.\(isAuthed\s*\?\s*\{/.test(rootNavigator),
    'deep-link state must discard queries, validate reset tokens, and gate protected routes'
  );
  fail(
    resetPassword.includes('isValidPasswordResetToken'),
    'password-reset screen must revalidate restored or internal navigation state'
  );
  fail(
    !editProfile.includes('requestMediaLibraryPermissionsAsync') &&
      editProfile.includes('launchImageLibraryAsync'),
    'Android profile photos must use the system picker without broad media permission'
  );
  fail(
    (
      settingsScreen.includes('Not available in this release') &&
        !settingsScreen.includes('handleNotificationToggle') &&
        !settingsScreen.includes('notificationPreferences.push || true')
    ) || (
      settingsScreen.includes('setPushNotificationsEnabled') &&
        pushNotifications.includes('getExpoPushTokenAsync') &&
        pushNotifications.includes('registerPushDevice') &&
        apiSource.includes('url: "/users/push-devices"') &&
        app.plugins.some((plugin) => (
          plugin === 'expo-notifications' || plugin?.[0] === 'expo-notifications'
        ))
    ),
    'Settings must not expose a nonfunctional push-notification control'
  );
  fail(
    notificationState.includes('isSafeNavigationIdentifier') &&
      notificationState.includes("navigate('Tabs', { screen: 'Bookings' })") &&
      !notificationState.includes('counsellorName') &&
      !notificationState.includes('${data.status}'),
    'notification data must be validated, generic, and use the authenticated tab route'
  );
  fail(
    !apiSource.includes('logDebug') &&
      safeDiagnostics.includes("diagnosticLabel(event) ?? 'invalid_event'") &&
      safeDiagnostics.includes('SAFE_ERROR_CODES'),
    'diagnostics must not construct payload logs or emit unvalidated labels/codes'
  );
  const setTokenBody = apiSource.match(/async setToken\(token: string\)[\s\S]*?\n  }/)?.[0] || '';
  const replacementBody = secureTokenPolicy.match(
    /const replaceSecureToken[\s\S]*?\n  };/
  )?.[0] || '';
  fail(
    setTokenBody.indexOf('await secureStorage.setToken(token)') >= 0 &&
      setTokenBody.indexOf('await secureStorage.setToken(token)') <
        setTokenBody.indexOf('this.token = token'),
    'a bearer token must not enter memory until secure persistence succeeds'
  );
  fail(
    replacementBody.indexOf('accessBlocked = true') >= 0 &&
      replacementBody.indexOf('await adapter.setClearPending()') >= 0 &&
      replacementBody.indexOf('await adapter.setClearPending()') <
        replacementBody.indexOf('await adapter.deleteSecureToken()') &&
      replacementBody.indexOf('await adapter.deleteSecureToken()') <
        replacementBody.indexOf('await adapter.writeSecureToken(token)'),
    'all Keychain replacements must block first, tombstone, delete, and recreate'
  );
  fail(
    apiSource.includes('invalidateLocalSession();') &&
      authState.includes('onSessionInvalidated') &&
      authState.includes('queryClient.clear()'),
    'HTTP 401 must invalidate the authenticated UI and protected query cache'
  );
  fail(
    notificationState.includes('useLayoutEffect') &&
      chatState.includes('resetSensitiveChatState') &&
      chatState.includes('clearTypingTimeouts') &&
      chatState.includes('useLayoutEffect') &&
      chatState.includes('accountGenerationRef') &&
      chatState.includes('isAccountScopeActive(scope)') &&
      appSource.includes("<AccountScopedApp key={user?.id ?? 'signed-out'} />") &&
      socketSource.includes('connectionGeneration') &&
      socketSource.includes('forceNew: true'),
    'account transitions must remount and generation-gate chat, notifications, requests, and sockets'
  );
  fail(
    chatList.includes('View app notifications') &&
      chatList.includes('Review recent updates from this app.') &&
      !chatList.includes('Turn on notifications') &&
      !chatList.includes('Never miss a reply'),
    'in-app notification history must not claim unavailable OS notification delivery'
  );
  fail(
    chatList.includes('Messages use secure connections') &&
      !/end-to-end encrypted/i.test(chatList) &&
      !/always confidential/i.test(chatList),
    'chat copy must not claim end-to-end encryption or absolute confidentiality'
  );
  fail(
    /["']bookings["']\s*,\s*userId/.test(queryHooks) &&
      /["']chatRooms["']\s*,\s*userId/.test(queryHooks) &&
      /["']profile["']\s*,\s*userId/.test(queryHooks),
    'protected React Query keys must include the authenticated user ID'
  );
  fail(
    !errorBoundary.includes('this.state.error.message') &&
      !errorBoundary.includes('this.state.error.stack') &&
      !/screenshot/i.test(errorBoundary) &&
      errorBoundary.includes('incidentReference'),
    'production error UI must expose only a generic incident reference'
  );
  fail(
    authState.includes('await invalidateSession();') &&
      changePassword.includes('await invalidateSession();') &&
      settingsScreen.includes('await invalidateSession();'),
    'password reset, password change, and account deletion must invalidate local sessions immediately'
  );
  fail(
    socialAuthButtons.includes('credential.authorizationCode') &&
      /url:\s*["']\/auth\/apple["']/.test(apiSource) &&
      apiSource.includes('authorizationCode: string;'),
    'Apple sign-in must send the one-time authorization code for server-held revocation credentials'
  );
  fail(
    /url:\s*["']\/users\/account\/deletion-challenge["']/.test(apiSource) &&
      /method:\s*["']apple["']\s*;/.test(apiSource) &&
      settingsScreen.includes('nonce: challenge.data.nonce') &&
      settingsScreen.includes('state: challenge.data.challengeId') &&
      settingsScreen.includes('credential.state !== challenge.data.challengeId') &&
      settingsScreen.includes('AppleAuthentication.AppleAuthenticationButton') &&
      settingsScreen.includes('await completeAcceptedDeletion(response);'),
    'Apple-linked deletion must use a server challenge, official button, fresh authorization, and local invalidation'
  );

  const sourceFiles = collectSourceFiles(join(root, 'src'));
  for (const absolute of sourceFiles) {
    const source = readFileSync(absolute, 'utf8');
    const relative = absolute.slice(root.length + 1).replaceAll('\\', '/');
    if (relative !== 'src/lib/safeDiagnostics.ts') {
      fail(!/\bconsole\.(?:log|warn|error|debug)\b/.test(source), `${relative} logs directly`);
      fail(
        !/\breport(?:Event|Error)\(\s*(?!['"`])/.test(source),
        `${relative} passes a dynamic diagnostic event label`
      );
    }
    fail(!/\b(?:expo-clipboard|@react-native-clipboard|Clipboard\.)\b/.test(source), `${relative} uses clipboard APIs`);
    fail(
      !/100% Secure Payments|Browse licensed therapists/.test(source),
      `${relative} contains an unqualified security or clinical claim`
    );
  }
  const asyncStorageImports = sourceFiles
    .filter((absolute) =>
      readFileSync(absolute, 'utf8').includes('@react-native-async-storage/async-storage')
    )
    .map((absolute) => absolute.slice(root.length + 1).replaceAll('\\', '/'))
    .sort();
  fail(
    JSON.stringify(asyncStorageImports) === JSON.stringify([
      'src/components/onboarding/first-login-tour.tsx',
      'src/lib/secureStorage.ts',
      'src/theme/ThemeProvider.tsx',
    ]),
    'AsyncStorage must remain limited to the logout tombstone and benign UI preferences'
  );

  const aasaText = read(root, 'associations/apple-app-site-association.template.json');
  const assetLinksText = read(root, 'associations/assetlinks.template.json');
  const aasa = JSON.parse(aasaText);
  const assetLinks = JSON.parse(assetLinksText);
  const aasaDetail =
    aasa.applinks && Array.isArray(aasa.applinks.details)
      ? aasa.applinks.details[0]
      : undefined;
  const assetLink = Array.isArray(assetLinks) ? assetLinks[0] : undefined;
  fail(
    aasaDetail &&
      Array.isArray(aasaDetail.appIDs) &&
      aasaDetail.appIDs[0] ===
      '__APPLE_TEAM_ID__.__IOS_BUNDLE_ID__',
    'AASA template must retain Apple placeholders'
  );
  fail(
    aasaDetail &&
      Array.isArray(aasaDetail.components) &&
      aasaDetail.components.length === 1 &&
      aasaDetail.components[0]['/'] === '/reset-password',
    'AASA template must expose only /reset-password'
  );
  fail(
    assetLink &&
      assetLink.target &&
      assetLink.target.package_name === '__ANDROID_PACKAGE_NAME__' &&
      Array.isArray(assetLink.target.sha256_cert_fingerprints) &&
      assetLink.target.sha256_cert_fingerprints[0] ===
        '__ANDROID_SHA256_CERT_FINGERPRINT__',
    'assetlinks template must retain Android placeholders'
  );
  fail(
    !/[A-F0-9]{2}(?::[A-F0-9]{2}){31}/i.test(assetLinksText),
    'assetlinks template must not contain a real certificate fingerprint'
  );

  return failures;
}

if (require.main === module) {
  const failures = validateProject();
  if (failures.length > 0) {
    console.error('Mobile release configuration validation failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
  } else {
    console.log('Mobile release configuration validation passed.');
  }
}

module.exports = {
  containsProductionReleaseHost,
  normalizeText,
  privacyReasons,
  resolveBuildProfile,
  validateProject,
  valuesAfterKey,
};
