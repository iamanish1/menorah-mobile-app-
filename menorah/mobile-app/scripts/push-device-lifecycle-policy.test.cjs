const assert = require('node:assert/strict');
const test = require('node:test');

const {
  addPendingDetachment,
  createPushDeviceLifecycle,
} = require('../src/services/pushDeviceLifecyclePolicy.js');

const OLD_TOKEN = 'ExponentPushToken[old_token_123456789]';
const NEW_TOKEN = 'ExponentPushToken[new_token_123456789]';
const AUTH_TOKEN = 'signed-user-bearer';

function createHarness({
  registration = null,
  pending = [],
  registerResponses = [{ success: true }],
  unregisterResponses = [{ success: true }],
  logoutResponses = [{ success: true }],
} = {}) {
  const state = {
    authToken: AUTH_TOKEN,
    registration,
    pending: [...pending],
    calls: [],
    pendingLogouts: [],
    registerResponses: [...registerResponses],
    unregisterResponses: [...unregisterResponses],
    logoutResponses: [...logoutResponses],
  };
  const nextResponse = (responses) => responses.shift() || { success: true };

  const lifecycle = createPushDeviceLifecycle({
    async getCurrentAuthToken() {
      state.calls.push('read-auth');
      return state.authToken;
    },
    async readRegistration() {
      state.calls.push('read-registration');
      return state.registration ? { ...state.registration } : null;
    },
    async writeRegistration(value) {
      state.calls.push(`write-registration:${value.expoPushToken}`);
      state.registration = { ...value };
    },
    async deleteRegistrationIfMatches(value) {
      state.calls.push(`delete-registration:${value.expoPushToken}`);
      if (
        state.registration?.expoPushToken === value.expoPushToken
        && (
          !state.registration.userId
          || state.registration.userId === (value.userId || null)
        )
      ) state.registration = null;
    },
    async readPendingDetachments() {
      state.calls.push('read-pending');
      return state.pending.map(value => ({ ...value }));
    },
    async writePendingDetachments(value) {
      state.calls.push(`write-pending:${value.length}`);
      state.pending = value.map(candidate => ({ ...candidate }));
    },
    async registerRemote(value) {
      state.calls.push(`remote-register:${value.expoPushToken}`);
      return nextResponse(state.registerResponses);
    },
    async unregisterRemote(value) {
      state.calls.push(`remote-unregister:${value.expoPushToken}`);
      return nextResponse(state.unregisterResponses);
    },
    async logoutRemote() {
      state.calls.push('remote-logout');
      return nextResponse(state.logoutResponses);
    },
    async queuePendingLogoutToken(token) {
      state.calls.push('queue-pending-logout');
      state.pendingLogouts.push(token);
    },
    reportError(event) {
      state.calls.push(`report:${event}`);
    },
  });

  return { lifecycle, state };
}

test('failed logout detachment retains the registration and bearer for retry', async () => {
  const oldRegistration = {
    expoPushToken: OLD_TOKEN,
    userId: 'user-1',
    projectId: 'project-1',
  };
  const { lifecycle, state } = createHarness({
    registration: oldRegistration,
    unregisterResponses: [{ success: false, isNetworkError: true }, { success: true }],
  });

  await lifecycle.beginAccountTransition();
  const result = await lifecycle.prepareAccountTransition(AUTH_TOKEN, 'user-1');
  lifecycle.endAccountTransition();

  assert.equal(result.status, 'queued');
  assert.deepEqual(state.registration, oldRegistration);
  assert.equal(state.pending.length, 1);
  assert.equal(state.pending[0].expoPushToken, OLD_TOKEN);
  assert.equal(state.pending[0].authToken, AUTH_TOKEN);
  assert.equal(state.pending[0].logoutAfterDetach, true);
  assert.equal(state.pending[0].claimBeforeDetach, false);
  assert.equal(state.calls.includes('delete-registration:' + OLD_TOKEN), false);
  assert.equal(state.calls.includes('remote-logout'), false);

  await lifecycle.retryPendingDetachments();
  assert.equal(state.registration, null);
  assert.deepEqual(state.pending, []);
  assert.equal(state.calls.includes('remote-logout'), true);
});

test('token rollover durably queues the old token before replacing it', async () => {
  const { lifecycle, state } = createHarness({
    registration: {
      expoPushToken: OLD_TOKEN,
      userId: 'user-1',
      projectId: 'project-1',
    },
    unregisterResponses: [{ success: false, isNetworkError: true }, { success: true }],
  });

  const result = await lifecycle.registerCurrent({
    expoPushToken: NEW_TOKEN,
    userId: 'user-1',
    projectId: 'project-1',
  }, AUTH_TOKEN);

  assert.equal(result.enabled, true);
  assert.equal(state.registration.expoPushToken, NEW_TOKEN);
  assert.equal(state.pending.length, 1);
  assert.equal(state.pending[0].expoPushToken, OLD_TOKEN);
  assert.equal(state.pending[0].logoutAfterDetach, false);
  assert.equal(state.pending[0].claimBeforeDetach, false);
  assert.ok(
    state.calls.indexOf('write-pending:1')
      < state.calls.indexOf('write-registration:' + NEW_TOKEN),
  );
  assert.ok(
    state.calls.indexOf('write-registration:' + NEW_TOKEN)
      < state.calls.indexOf('remote-register:' + NEW_TOKEN),
  );

  await lifecycle.retryPendingDetachments();
  assert.deepEqual(state.pending, []);
  assert.equal(state.registration.expoPushToken, NEW_TOKEN);
  assert.equal(state.calls.includes('remote-logout'), false);
});

test('an ambiguous registration failure keeps all state needed for cleanup', async () => {
  const { lifecycle, state } = createHarness({
    registration: {
      expoPushToken: OLD_TOKEN,
      userId: 'user-1',
      projectId: 'project-1',
    },
    registerResponses: [{ success: false, isNetworkError: true }],
  });

  const result = await lifecycle.registerCurrent({
    expoPushToken: NEW_TOKEN,
    userId: 'user-1',
    projectId: 'project-1',
  }, AUTH_TOKEN);

  assert.equal(result.enabled, false);
  assert.equal(state.registration.expoPushToken, NEW_TOKEN);
  assert.equal(state.pending[0].expoPushToken, OLD_TOKEN);
});

test('account replacement refuses to discard a prior owner without a durable detach', async () => {
  const oldRegistration = {
    expoPushToken: OLD_TOKEN,
    userId: 'user-1',
    projectId: 'project-1',
  };
  const { lifecycle, state } = createHarness({ registration: oldRegistration });

  const result = await lifecycle.registerCurrent({
    expoPushToken: NEW_TOKEN,
    userId: 'user-2',
    projectId: 'project-1',
  }, AUTH_TOKEN);

  assert.deepEqual(result, { enabled: false, reason: 'unsafe_previous_owner' });
  assert.deepEqual(state.registration, oldRegistration);
  assert.equal(state.calls.some(call => call.startsWith('remote-register:')), false);
});

test('the same physical token is atomically reassigned after an expired prior session', async () => {
  const { lifecycle, state } = createHarness({
    registration: {
      expoPushToken: OLD_TOKEN,
      userId: 'user-1',
      projectId: 'project-1',
    },
  });

  const result = await lifecycle.registerCurrent({
    expoPushToken: OLD_TOKEN,
    userId: 'user-2',
    projectId: 'project-1',
  }, AUTH_TOKEN);

  assert.equal(result.enabled, true);
  assert.equal(state.registration.userId, 'user-2');
  assert.deepEqual(state.pending, []);
  assert.equal(state.calls.includes('remote-register:' + OLD_TOKEN), true);
  assert.equal(state.calls.includes('remote-unregister:' + OLD_TOKEN), false);
});

test('a pending prior-owner detach permits safe reassignment to the new account', async () => {
  const oldRegistration = {
    expoPushToken: OLD_TOKEN,
    userId: 'user-1',
    projectId: 'project-1',
  };
  const { lifecycle, state } = createHarness({
    registration: oldRegistration,
    pending: [{
      ...oldRegistration,
      authToken: 'old-account-bearer',
      logoutAfterDetach: true,
      claimBeforeDetach: false,
    }],
  });

  const result = await lifecycle.registerCurrent({
    expoPushToken: NEW_TOKEN,
    userId: 'user-2',
    projectId: 'project-1',
  }, AUTH_TOKEN);

  assert.equal(result.enabled, true);
  assert.equal(state.registration.userId, 'user-2');
  assert.equal(state.registration.expoPushToken, NEW_TOKEN);
  assert.equal(state.pending[0].authToken, 'old-account-bearer');
});

test('queue capacity fails closed instead of discarding an older device token', () => {
  const existing = [0, 1].map(index => ({
    expoPushToken: `ExponentPushToken[existing_${index}_123456789]`,
    userId: `user-${index}`,
    projectId: 'project-1',
    authToken: `bearer-${index}`,
    logoutAfterDetach: true,
    claimBeforeDetach: false,
  }));

  assert.throws(() => addPendingDetachment(existing, {
    expoPushToken: NEW_TOKEN,
    userId: 'user-new',
    projectId: 'project-1',
    authToken: AUTH_TOKEN,
    logoutAfterDetach: true,
    claimBeforeDetach: false,
  }, 2), /capacity reached/);
  assert.equal(existing.length, 2);
});

test('a legacy token is claimed by the authenticated owner before detachment', async () => {
  const { lifecycle, state } = createHarness({
    registration: {
      expoPushToken: OLD_TOKEN,
      userId: null,
      projectId: 'project-1',
    },
  });

  await lifecycle.beginAccountTransition();
  const result = await lifecycle.prepareAccountTransition(AUTH_TOKEN, 'user-1');
  lifecycle.endAccountTransition();

  assert.equal(result.status, 'detached');
  assert.ok(
    state.calls.indexOf('remote-register:' + OLD_TOKEN)
      < state.calls.indexOf('remote-unregister:' + OLD_TOKEN),
  );
  assert.equal(state.registration, null);
  assert.deepEqual(state.pending, []);
});
