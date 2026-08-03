const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const backend = path.resolve(root, '..', 'backend');
const read = (base, file) => fs.readFileSync(path.join(base, file), 'utf8');

test('Android build includes Expo notifications and three channels', () => {
  const appConfig = JSON.parse(read(root, 'app.json'));
  const packageJson = JSON.parse(read(root, 'package.json'));
  const service = read(root, 'src/services/pushNotifications.ts');

  assert.ok(packageJson.dependencies['expo-notifications']);
  assert.equal(appConfig.expo.plugins[0][0], 'expo-notifications');
  for (const channel of ['messages', 'sessions', 'articles']) {
    assert.match(service, new RegExp(`setNotificationChannelAsync\\('${channel}'`));
  }
  assert.match(service, /getExpoPushTokenAsync\(\{ projectId: easProjectId \}\)/);
  assert.match(service, /registerPushDevice/);
});

test('Settings exposes a working Android push toggle', () => {
  const settings = read(root, 'src/screens/profile/Settings.tsx');
  assert.match(settings, /setPushNotificationsEnabled/);
  assert.match(settings, /Chat, session reminders and new articles/);
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
