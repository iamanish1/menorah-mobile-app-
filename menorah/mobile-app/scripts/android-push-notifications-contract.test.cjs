const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const backend = path.resolve(root, '..', 'backend');
const read = (base, file) => fs.readFileSync(path.join(base, file), 'utf8');

test('Android build includes Expo/Firebase notifications and all four channels', () => {
  const appConfig = JSON.parse(read(root, 'app.json'));
  const packageJson = JSON.parse(read(root, 'package.json'));
  const service = read(root, 'src/services/pushNotifications.ts');
  const manifest = read(root, 'android/app/src/main/AndroidManifest.xml');
  const mainApplication = read(
    root,
    'android/app/src/main/java/com/menorah/healthmobile/MainApplication.kt'
  );

  assert.ok(packageJson.dependencies['expo-notifications']);
  assert.equal(appConfig.expo.plugins[0][0], 'expo-notifications');
  for (const channel of ['general', 'messages', 'sessions', 'articles']) {
    assert.match(service, new RegExp(`setNotificationChannelAsync\\('${channel}'`));
  }
  assert.match(mainApplication, /DEFAULT_NOTIFICATION_CHANNEL_ID = "general"/);
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(manifest, /ExpoFirebaseMessagingService/);
  assert.match(manifest, /expo\.modules\.notifications\.service\.NotificationsService/);
  assert.match(manifest, /default_notification_channel_id/);
  assert.match(manifest, /android:value="general"/);
  assert.match(service, /getExpoPushTokenAsync\(\{ projectId: easProjectId \}\)/);
  assert.match(service, /registerPushDeviceWithToken/);
  assert.match(service, /addPushTokenListener/);
  assert.match(service, /retryPendingPushDeviceDetachmentsAsync/);
  assert.doesNotMatch(service, /finally\s*\{\s*await SecureStore\.deleteItemAsync\(PUSH_TOKEN_STORAGE_KEY\)/);
});

test('logout preserves failed push detachments for authenticated retry', () => {
  const auth = read(root, 'src/state/useAuth.tsx');
  const policy = read(root, 'src/services/pushDeviceLifecyclePolicy.js');
  const profile = read(root, 'src/screens/profile/ProfileHomeModern.tsx');

  assert.match(auth, /beginPushAccountTransitionAsync/);
  assert.match(auth, /preparePushDeviceForAccountTransitionAsync/);
  assert.match(auth, /retryPendingPushDeviceDetachmentsAsync/);
  assert.match(policy, /logoutAfterDetach/);
  assert.match(policy, /queueDetachment/);
  assert.match(policy, /adapter\.unregisterRemote/);
  assert.match(profile, /Sign-out incomplete/);
  assert.doesNotMatch(profile, /Signed Out Securely/);
});

test('Settings exposes a working Android push toggle', () => {
  const settings = read(root, 'src/screens/profile/Settings.tsx');
  assert.match(settings, /setPushNotificationsEnabled/);
  assert.match(settings, /Chat, session reminders and new articles/);
  assert.match(settings, /Sign-out incomplete/);
  assert.doesNotMatch(settings, /Signed Out Securely/);
  assert.doesNotMatch(settings, /Not available in this release/);
});

test('push taps route to articles, bookings, and chat', () => {
  const provider = read(root, 'src/state/useNotifications.tsx');
  assert.match(provider, /navigate\('ArticleDetail'/);
  assert.match(provider, /navigate\('ChatThread'/);
  assert.match(provider, /navigate\('BookingReview'/);
  assert.match(provider, /getLastPushResponseAsync/);
});

test('backend registers devices and queues all requested event types', () => {
  const users = read(backend, 'src/routes/users.js');
  const articles = read(backend, 'src/routes/articles.js');
  const chat = read(backend, 'src/routes/chat.js');
  const service = read(backend, 'src/services/pushNotificationService.js');

  assert.match(users, /router\.post\('\/push-devices', auth/);
  assert.match(users, /router\.delete\('\/push-devices', auth/);
  assert.match(articles, /enqueueArticlePublishedNotifications/);
  assert.match(chat, /CHAT_PUSH_ENQUEUE_FAILED/);
  assert.match(chat, /Open Menorah to view your message\./);
  assert.match(service, /reminder:30m/);
});
