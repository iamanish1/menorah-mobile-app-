const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const test = require('node:test');
const {
  extractPasswordResetToken,
  isSafeNavigationIdentifier,
  isValidPasswordResetToken,
  splitDeepLinkPath,
} = require('../src/lib/deepLinks.js');
const { validateProject } = require('./validate-mobile-release-config.cjs');
const { createSecureTokenStorage } = require('../src/lib/secureTokenPolicy.js');

const projectRoot = resolve(__dirname, '..');
const validToken = 'a'.repeat(64);

test('mobile release configuration remains internally consistent', () => {
  assert.deepEqual(validateProject(projectRoot), []);
});

test('password-reset deep links accept only one 64-hex fragment token', () => {
  assert.equal(extractPasswordResetToken(`token=${validToken}`), validToken);
  assert.equal(extractPasswordResetToken(`#token=${validToken.toUpperCase()}`), validToken.toUpperCase());
  assert.equal(extractPasswordResetToken('token=short'), null);
  assert.equal(extractPasswordResetToken(`token=${validToken}&token=${validToken}`), null);
  assert.equal(extractPasswordResetToken(`token=${validToken}&next=profile`), null);
  assert.equal(extractPasswordResetToken(`access_token=${validToken}`), null);
  assert.equal(extractPasswordResetToken(`token=%20${validToken}%20`), null);
  assert.equal(extractPasswordResetToken(`token=${validToken}#ignored`), null);
  assert.equal(isValidPasswordResetToken(validToken), true);
  assert.equal(isValidPasswordResetToken(` ${validToken}`), false);
});

test('deep-link parsing drops query data and retains the complete fragment', () => {
  assert.deepEqual(
    splitDeepLinkPath(`/reset-password?token=query-secret#token=${validToken}#ignored`),
    {
      pathname: '/reset-password',
      fragment: `token=${validToken}#ignored`,
    }
  );
  assert.equal(splitDeepLinkPath('a'.repeat(2049)), null);
});

test('notification navigation identifiers reject paths, URLs, and oversized input', () => {
  assert.equal(isSafeNavigationIdentifier('booking_123:room-456'), true);
  assert.equal(isSafeNavigationIdentifier('../profile'), false);
  assert.equal(isSafeNavigationIdentifier('https://attacker.example'), false);
  assert.equal(isSafeNavigationIdentifier('a'.repeat(129)), false);
  assert.equal(isSafeNavigationIdentifier(null), false);
});

function createStorageHarness() {
  const state = {
    token: null,
    clearPending: false,
    failDeleteToken: false,
    failDeleteMarker: false,
    failGetMarker: false,
    failSetMarker: false,
    failWriteToken: false,
    calls: [],
  };
  const storage = createSecureTokenStorage({
    async readSecureToken() {
      state.calls.push('read-token');
      return state.token;
    },
    async writeSecureToken(token) {
      state.calls.push('write-token');
      if (state.failWriteToken) throw new Error('secure write failed');
      state.token = token;
    },
    async deleteSecureToken() {
      state.calls.push('delete-token');
      if (state.failDeleteToken) throw new Error('secure delete failed');
      state.token = null;
    },
    async getClearPending() {
      state.calls.push('get-marker');
      if (state.failGetMarker) throw new Error('marker read failed');
      return state.clearPending;
    },
    async setClearPending() {
      state.calls.push('set-marker');
      if (state.failSetMarker) throw new Error('marker write failed');
      state.clearPending = true;
    },
    async deleteClearPending() {
      state.calls.push('delete-marker');
      if (state.failDeleteMarker) throw new Error('marker delete failed');
      state.clearPending = false;
    },
  });
  return { state, storage };
}

test('legacy secure tokens are tombstoned, deleted, and recreated before use', async () => {
  const { state, storage } = createStorageHarness();
  state.token = 'legacy-token';

  assert.equal(await storage.getToken(), 'legacy-token');
  assert.deepEqual(state.calls, [
    'get-marker',
    'read-token',
    'set-marker',
    'delete-token',
    'write-token',
    'delete-marker',
  ]);
  assert.equal(state.token, 'legacy-token');
  assert.equal(state.clearPending, false);
});

test('a failed delete-and-recreate migration remains signed out', async () => {
  const { state, storage } = createStorageHarness();
  state.token = 'legacy-token';
  state.failWriteToken = true;

  assert.equal(await storage.getToken(), null);
  assert.equal(state.token, null);
  assert.equal(state.clearPending, false);
  assert.equal(await storage.getToken(), null);
});

test('a failed secure write deletes the prior credential and cannot reactivate it', async () => {
  const { state, storage } = createStorageHarness();
  state.token = 'old-token';
  state.failWriteToken = true;

  await assert.rejects(storage.setToken('new-token'));
  assert.equal(state.token, null);
  assert.equal(await storage.getToken(), null);
  assert.equal(state.clearPending, false);
});

test('credential replacement never reads a marker and always recreates the Keychain item', async () => {
  const { state, storage } = createStorageHarness();
  state.token = 'old-token';
  state.failGetMarker = true;

  await storage.setToken('new-token');
  assert.equal(state.token, 'new-token');
  assert.deepEqual(state.calls, [
    'set-marker',
    'delete-token',
    'write-token',
    'delete-marker',
  ]);
});

test('marker-read failure cannot resurrect an old token after replacement fails', async () => {
  const { state, storage } = createStorageHarness();
  state.token = 'old-token';
  state.failGetMarker = true;
  state.failWriteToken = true;

  await assert.rejects(storage.setToken('new-token'));
  assert.equal(state.token, null);
  assert.equal(await storage.getToken(), null);
  assert.equal(state.token, null);
});

test('a failed write and delete leaves a durable non-resurrection tombstone', async () => {
  const { state, storage } = createStorageHarness();
  state.token = 'old-token';
  state.failWriteToken = true;
  state.failDeleteToken = true;

  await assert.rejects(storage.setToken('new-token'), /cleanup is pending/);
  assert.equal(state.clearPending, true);
  assert.equal(await storage.getToken(), null);
  assert.equal(state.token, 'old-token');
});

test('a failed physical logout leaves a tombstone that blocks restoration', async () => {
  const { state, storage } = createStorageHarness();
  state.token = 'old-token';
  state.failDeleteToken = true;

  await assert.rejects(storage.clearToken(), /deletion is pending/);
  assert.equal(state.clearPending, true);
  assert.equal(await storage.getToken(), null);
  assert.equal(state.token, 'old-token');

  state.failDeleteToken = false;
  assert.equal(await storage.getToken(), null);
  assert.equal(state.token, null);
  assert.equal(state.clearPending, false);
});

test('a retained tombstone stays fail-closed until marker cleanup succeeds', async () => {
  const { state, storage } = createStorageHarness();
  state.token = 'old-token';
  state.failDeleteMarker = true;

  await assert.rejects(storage.clearToken(), /cleanup is pending/);
  assert.equal(state.token, null);
  assert.equal(state.clearPending, true);
  assert.equal(await storage.getToken(), null);

  state.failDeleteMarker = false;
  assert.equal(await storage.getToken(), null);
  assert.equal(state.clearPending, false);
});
