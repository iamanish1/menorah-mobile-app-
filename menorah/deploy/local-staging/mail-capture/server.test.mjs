import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import {
  LOCAL_MAIL_CAPTURE_ENVIRONMENT_ID,
  LOCAL_MAIL_CAPTURE_PROJECT,
  SERVER_STAGING_MAIL_CAPTURE_ENVIRONMENT_ID,
  SERVER_STAGING_MAIL_CAPTURE_PROJECTS,
  createMailCaptureServer,
} from './server.mjs';

const API_KEY = `re_local_${'a'.repeat(40)}`;
const SERVER_API_KEY = `re_server_staging_${'b'.repeat(40)}`;

const startServer = async (options = {}) => {
  const server = createMailCaptureServer({
    apiKey: API_KEY,
    ...options,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    server,
  };
};

const closeServer = async (server) => {
  server.closeAllConnections();
  server.close();
  await once(server, 'close');
};

const authorizedHeaders = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

test('health is generic while capture and control routes require authentication', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const unauthorizedCapture = await fetch(`${baseUrl}/emails`, {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(unauthorizedCapture.status, 401);

    const unauthorizedRead = await fetch(`${baseUrl}/control/messages`);
    assert.equal(unauthorizedRead.status, 401);
  } finally {
    await closeServer(server);
  }
});

test('Resend-compatible capture can be read and cleared without logging content', async () => {
  const recipient = 'admin-full-1@mail.staging.localhost';
  const otp = '918273';
  const logCalls = [];
  const errorCalls = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...values) => logCalls.push(values);
  console.error = (...values) => errorCalls.push(values);

  const { baseUrl, server } = await startServer();
  try {
    const capture = await fetch(`${baseUrl}/emails`, {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({
        from: 'Menorah Synthetic <noreply@mail.staging.localhost>',
        to: [recipient],
        subject: 'Menorah Health – Admin Login Verification',
        html: `<p>Your code is <strong>${otp}</strong></p>`,
      }),
    });
    assert.equal(capture.status, 200);
    assert.match((await capture.json()).id, /^local_[a-f0-9]{32}$/);

    const read = await fetch(
      `${baseUrl}/control/messages?recipient=${encodeURIComponent(recipient)}`,
      { headers: authorizedHeaders },
    );
    assert.equal(read.status, 200);
    const { data } = await read.json();
    assert.equal(data.length, 1);
    assert.deepEqual(data[0].to, [recipient]);
    assert.match(data[0].html, new RegExp(otp));
    assert.equal(data[0].capturedAtEpochMs, undefined);

    const clear = await fetch(`${baseUrl}/control/messages`, {
      method: 'DELETE',
      headers: authorizedHeaders,
    });
    assert.equal(clear.status, 204);

    const emptyRead = await fetch(`${baseUrl}/control/messages`, {
      headers: authorizedHeaders,
    });
    assert.deepEqual(await emptyRead.json(), { data: [] });

    const capturedOutput = JSON.stringify([logCalls, errorCalls]);
    assert.equal(logCalls.length, 0);
    assert.equal(errorCalls.length, 0);
    assert.doesNotMatch(capturedOutput, new RegExp(recipient));
    assert.doesNotMatch(capturedOutput, new RegExp(otp));
  } finally {
    console.log = originalLog;
    console.error = originalError;
    await closeServer(server);
  }
});

test('invalid messages fail closed and the in-memory queue is bounded', async () => {
  const { baseUrl, server } = await startServer({ maxMessages: 2 });
  try {
    const unsupported = await fetch(`${baseUrl}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: '{}',
    });
    assert.equal(unsupported.status, 415);

    const invalid = await fetch(`${baseUrl}/emails`, {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({
        from: 'sender@mail.staging.localhost',
        to: ['first@mail.staging.localhost', 'second@mail.staging.localhost'],
        subject: 'invalid',
        html: '<p>invalid</p>',
      }),
    });
    assert.equal(invalid.status, 422);

    const oversized = await fetch(`${baseUrl}/emails`, {
      method: 'POST',
      headers: authorizedHeaders,
      body: JSON.stringify({
        from: 'sender@mail.staging.localhost',
        to: ['recipient@mail.staging.localhost'],
        subject: 'oversized',
        text: 'x'.repeat(300 * 1024),
      }),
    });
    assert.equal(oversized.status, 413);

    for (const index of [1, 2, 3]) {
      const response = await fetch(`${baseUrl}/emails`, {
        method: 'POST',
        headers: authorizedHeaders,
        body: JSON.stringify({
          from: 'sender@mail.staging.localhost',
          to: [`recipient-${index}@mail.staging.localhost`],
          subject: `message-${index}`,
          text: `capture-${index}`,
        }),
      });
      assert.equal(response.status, 200);
    }

    const read = await fetch(`${baseUrl}/control/messages`, {
      headers: authorizedHeaders,
    });
    const { data } = await read.json();
    assert.deepEqual(
      data.map(({ subject }) => subject),
      ['message-2', 'message-3'],
    );
  } finally {
    await closeServer(server);
  }
});

test('capture startup accepts only exact identity, project, and key-prefix pairs', () => {
  assert.doesNotThrow(() => createMailCaptureServer({
    apiKey: API_KEY,
    composeProject: LOCAL_MAIL_CAPTURE_PROJECT,
    environmentId: LOCAL_MAIL_CAPTURE_ENVIRONMENT_ID,
  }));
  for (const composeProject of SERVER_STAGING_MAIL_CAPTURE_PROJECTS) {
    assert.doesNotThrow(() => createMailCaptureServer({
      apiKey: SERVER_API_KEY,
      composeProject,
      environmentId: SERVER_STAGING_MAIL_CAPTURE_ENVIRONMENT_ID,
    }));
  }

  for (const apiKey of [
    '',
    'ordinary-key',
    're_local_short',
    `re_test_${'a'.repeat(40)}`,
    `re_live_${'a'.repeat(40)}`,
  ]) {
    assert.throws(
      () => createMailCaptureServer({ apiKey }),
      /strong mail-capture key for an exact isolated environment/,
    );
  }

  for (const options of [
    {
      apiKey: SERVER_API_KEY,
      composeProject: LOCAL_MAIL_CAPTURE_PROJECT,
      environmentId: LOCAL_MAIL_CAPTURE_ENVIRONMENT_ID,
    },
    {
      apiKey: API_KEY,
      composeProject: SERVER_STAGING_MAIL_CAPTURE_PROJECTS[0],
      environmentId: SERVER_STAGING_MAIL_CAPTURE_ENVIRONMENT_ID,
    },
    {
      apiKey: SERVER_API_KEY,
      composeProject: 'menorah-arbitrary-staging',
      environmentId: SERVER_STAGING_MAIL_CAPTURE_ENVIRONMENT_ID,
    },
    {
      apiKey: SERVER_API_KEY,
      composeProject: SERVER_STAGING_MAIL_CAPTURE_PROJECTS[0],
      environmentId: LOCAL_MAIL_CAPTURE_ENVIRONMENT_ID,
    },
  ]) {
    assert.throws(
      () => createMailCaptureServer(options),
      /strong mail-capture key for an exact isolated environment/,
    );
  }
});
