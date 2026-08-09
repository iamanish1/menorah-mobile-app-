const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const {
  inspectEmbeddedBundleText,
  inspectManifestText,
  inspectResourceText,
  normalizeFingerprint,
  sha256File,
} = require('./inspect-android-aab.cjs');

const validManifest = `
<manifest package="com.menorah.healthmobile" android:versionCode="17" android:versionName="2.7.0">
  <uses-sdk android:targetSdkVersion="36" />
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
  <uses-permission android:name="android.permission.CAMERA" />
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  <uses-permission android:name="android.permission.INTERNET" />
  <application android:usesCleartextTraffic="false">
    <meta-data android:name="com.google.firebase.messaging.default_notification_icon" />
    <meta-data android:name="com.google.firebase.messaging.default_notification_color" />
    <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="general" />
    <service android:name="expo.modules.notifications.service.ExpoFirebaseMessagingService">
      <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </service>
    <receiver android:name="expo.modules.notifications.service.NotificationsService" />
    <activity android:name="expo.modules.notifications.service.NotificationForwarderActivity" />
    <data android:host="app.menorah.me" android:path="/reset-password" />
  </application>
</manifest>`;

test('artifact manifest policy accepts only the release identity and permissions', () => {
  assert.doesNotThrow(() => inspectManifestText(validManifest));
  assert.throws(
    () => inspectManifestText(validManifest.replace('</manifest>', '<uses-permission android:name="android.permission.READ_PHONE_STATE" /></manifest>')),
    /prohibited permission/
  );
  assert.throws(
    () => inspectManifestText(validManifest.replace('usesCleartextTraffic="false"', 'usesCleartextTraffic="true"')),
    /cleartext/
  );
  assert.throws(
    () => inspectManifestText(validManifest.replace(
      'usesCleartextTraffic="false"',
      'usesCleartextTraffic="false" android:networkSecurityConfig="@xml/network_security_config"'
    )),
    /network security configuration/
  );
});

test('artifact resource and embedded bundle policy requires Firebase and production origins', () => {
  assert.doesNotThrow(() => inspectResourceText(
    'expo_runtime_version 2.7.0 gcm_defaultSenderId 873291355021 google_app_id 1:873291355021:android:abc notification_icon_color'
  ));
  assert.doesNotThrow(() => inspectEmbeddedBundleText([
    'https://api-android.menorah.me/api',
    'https://app.menorah.me',
    'https://app.menorah.me/checkout/return',
    'https://menorah.me',
    'https://calls.menorah.me',
    '873291355021-soma7nima003rvq9usj8fqj0t9kbjm6a.apps.googleusercontent.com',
    '873291355021-bi43pprpqlks9hvpjdto7kt0ekcbefr8.apps.googleusercontent.com',
  ].join('\0')));
  assert.throws(
    () => inspectEmbeddedBundleText([
      'https://api-android.menorah.me/api',
      'https://app.menorah.me',
      '873291355021-soma7nima003rvq9usj8fqj0t9kbjm6a.apps.googleusercontent.com',
      '873291355021-bi43pprpqlks9hvpjdto7kt0ekcbefr8.apps.googleusercontent.com',
    ].join('\0')),
    /checkout\/return|menorah\.me|calls\.menorah\.me/
  );
});

test('certificate fingerprints normalize without weakening exact comparison', () => {
  assert.equal(
    normalizeFingerprint('aa:bb:01'),
    'AABB01'
  );
});

test('artifact digest is recorded from the exact downloaded bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'menorah-aab-digest-'));
  try {
    const artifact = join(directory, 'candidate.aab');
    writeFileSync(artifact, 'immutable Menorah Android candidate');
    assert.equal(
      sha256File(artifact),
      '944c23ce7fab9117b6debb36b7d9885791e7c7ec3dd655d156fa528be0f967b2'
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
