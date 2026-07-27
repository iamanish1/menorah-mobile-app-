'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildAndroidAssociation,
  buildAppleAssociation,
  createServer,
} = require('./server');

const validEnvironment = {
  APPLE_APP_LINK_TEAM_ID: 'ABCDEFGHIJ',
  APPLE_APP_LINK_BUNDLE_ID: 'com.menorah.health.app',
  ANDROID_APP_LINK_PACKAGE_NAME: 'com.menorah.healthmobile',
  ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS: 'AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA:AA',
};

async function withServer(environment, callback) {
  const server = createServer(environment);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    await callback(server);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function request(server, path) {
  const { port } = server.address();
  return fetch(`http://127.0.0.1:${port}${path}`);
}

test('missing or malformed signing identifiers do not produce association files', () => {
  assert.equal(buildAppleAssociation({}), null);
  assert.equal(buildAppleAssociation({
    APPLE_APP_LINK_TEAM_ID: 'not-a-team-id',
    APPLE_APP_LINK_BUNDLE_ID: 'com.menorah.health.app',
  }), null);

  assert.equal(buildAndroidAssociation({}), null);
  assert.equal(buildAndroidAssociation({
    ANDROID_APP_LINK_PACKAGE_NAME: 'com.menorah.healthmobile',
    ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS: 'not-a-fingerprint',
  }), null);
});

test('association endpoints fail closed when signing identifiers are absent', async () => {
  await withServer({}, async (server) => {
    const appleResponse = await request(server, '/.well-known/apple-app-site-association');
    const androidResponse = await request(server, '/.well-known/assetlinks.json');

    assert.equal(appleResponse.status, 404);
    assert.equal(androidResponse.status, 404);
    assert.equal(appleResponse.headers.get('cache-control'), 'no-store');
  });
});

test('valid signing identifiers generate standards-compliant JSON', async () => {
  await withServer(validEnvironment, async (server) => {
    const appleResponse = await request(server, '/.well-known/apple-app-site-association');
    assert.equal(appleResponse.status, 200);
    assert.equal(appleResponse.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal((await appleResponse.json()).applinks.details[0].appID, 'ABCDEFGHIJ.com.menorah.health.app');

    const androidResponse = await request(server, '/.well-known/assetlinks.json');
    assert.equal(androidResponse.status, 200);
    assert.equal((await androidResponse.json())[0].target.package_name, 'com.menorah.healthmobile');
  });
});
