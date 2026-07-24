#!/usr/bin/env node

import {
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const DEFAULT_PORT = 8025;
const DEFAULT_MAX_MESSAGES = 100;
const DEFAULT_TTL_MILLISECONDS = 15 * 60 * 1000;
const MAX_REQUEST_BYTES = 256 * 1024;
const LOCAL_KEY_PATTERN = /^re_local_[A-Za-z0-9_-]{32,}$/;
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const secureEqual = (actual, expected) => {
  const actualBuffer = Buffer.from(String(actual || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return (
    actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

const writeJson = (response, statusCode, payload) => {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'Content-Security-Policy': "default-src 'none'",
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
};

const writeEmpty = (response, statusCode) => {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': '0',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end();
};

const readJsonBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  let received = 0;
  let tooLarge = false;

  request.on('data', (chunk) => {
    received += chunk.length;
    if (received > MAX_REQUEST_BYTES) {
      tooLarge = true;
      chunks.length = 0;
      return;
    }
    if (!tooLarge) chunks.push(chunk);
  });
  request.on('end', () => {
    if (tooLarge) {
      reject(Object.assign(new Error('request_too_large'), {
        statusCode: 413,
      }));
      return;
    }
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      reject(Object.assign(new Error('invalid_json'), {
        statusCode: 400,
      }));
    }
  });
  request.on('error', () => {
    reject(Object.assign(new Error('request_error'), {
      statusCode: 400,
    }));
  });
});

const isHeaderSafeText = (value, maximumLength) => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= maximumLength
  && !/[\r\n\0]/.test(value)
);

const normalizeEmailRequest = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (
    !isHeaderSafeText(body.from, 320)
    || !isHeaderSafeText(body.subject, 998)
    || !Array.isArray(body.to)
    || body.to.length !== 1
    || !EMAIL_PATTERN.test(body.to[0])
  ) return null;

  const html = typeof body.html === 'string' ? body.html : '';
  const text = typeof body.text === 'string' ? body.text : '';
  if (
    (!html && !text)
    || Buffer.byteLength(html) + Buffer.byteLength(text)
      > MAX_REQUEST_BYTES
  ) return null;

  return {
    from: body.from,
    to: [body.to[0]],
    subject: body.subject,
    html,
    text,
  };
};

const bearerToken = (request) => {
  const match = String(request.headers.authorization || '')
    .match(/^Bearer ([A-Za-z0-9_-]+)$/);
  return match?.[1] || '';
};

export const createMailCaptureServer = ({
  apiKey,
  maxMessages = DEFAULT_MAX_MESSAGES,
  ttlMilliseconds = DEFAULT_TTL_MILLISECONDS,
  now = Date.now,
  randomBytesFunction = randomBytes,
} = {}) => {
  if (!LOCAL_KEY_PATTERN.test(String(apiKey || ''))) {
    throw new Error('A strong local mail-capture API key is required');
  }
  if (!Number.isSafeInteger(maxMessages) || maxMessages < 1 || maxMessages > 1000) {
    throw new Error('maxMessages must be an integer from 1 through 1000');
  }
  if (
    !Number.isSafeInteger(ttlMilliseconds)
    || ttlMilliseconds < 1000
    || ttlMilliseconds > 24 * 60 * 60 * 1000
  ) {
    throw new Error('ttlMilliseconds must be from one second through 24 hours');
  }

  let messages = [];
  const removeExpiredMessages = () => {
    const cutoff = now() - ttlMilliseconds;
    messages = messages.filter(({ capturedAtEpochMs }) =>
      capturedAtEpochMs >= cutoff
    );
  };
  const isAuthorized = (request) =>
    secureEqual(bearerToken(request), apiKey);

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(
      request.url || '/',
      'http://mail-capture:8025'
    );

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      writeJson(response, 200, { status: 'ok' });
      return;
    }

    if (
      requestUrl.pathname !== '/emails'
      && requestUrl.pathname !== '/control/messages'
    ) {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }

    if (!isAuthorized(request)) {
      writeJson(response, 401, { error: 'unauthorized' });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/emails') {
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          String(request.headers['content-type'] || '')
        )
      ) {
        writeJson(response, 415, { error: 'unsupported_media_type' });
        return;
      }
      let requestBody;
      try {
        requestBody = await readJsonBody(request);
      } catch (error) {
        if (!response.headersSent && !response.destroyed) {
          writeJson(response, error.statusCode || 400, {
            error: 'invalid_request',
          });
        }
        return;
      }

      const normalized = normalizeEmailRequest(requestBody);
      if (!normalized) {
        writeJson(response, 422, { error: 'invalid_email_request' });
        return;
      }

      removeExpiredMessages();
      const id = `local_${randomBytesFunction(16).toString('hex')}`;
      messages.push({
        id,
        capturedAt: new Date(now()).toISOString(),
        capturedAtEpochMs: now(),
        ...normalized,
      });
      if (messages.length > maxMessages) {
        messages = messages.slice(-maxMessages);
      }
      writeJson(response, 200, { id });
      return;
    }

    if (
      request.method === 'GET'
      && requestUrl.pathname === '/control/messages'
    ) {
      removeExpiredMessages();
      const recipient = requestUrl.searchParams.get('recipient');
      if (
        recipient !== null
        && (!EMAIL_PATTERN.test(recipient) || recipient.length > 320)
      ) {
        writeJson(response, 400, { error: 'invalid_recipient_filter' });
        return;
      }
      const selected = messages
        .filter(({ to }) => recipient === null || to[0] === recipient)
        .map(({ capturedAtEpochMs: _privateTimestamp, ...message }) => message);
      writeJson(response, 200, { data: selected });
      return;
    }

    if (
      request.method === 'DELETE'
      && requestUrl.pathname === '/control/messages'
    ) {
      messages = [];
      writeEmpty(response, 204);
      return;
    }

    writeJson(response, 405, { error: 'method_not_allowed' });
  });

  server.on('clientError', (_error, socket) => {
    socket.end(
      'HTTP/1.1 400 Bad Request\r\n'
      + 'Connection: close\r\n'
      + 'Content-Length: 0\r\n\r\n'
    );
  });

  return server;
};

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const apiKey = process.env.MAIL_CAPTURE_API_KEY;
  const rawPort = String(process.env.MAIL_CAPTURE_PORT || DEFAULT_PORT);
  const port = /^\d+$/.test(rawPort) ? Number(rawPort) : NaN;
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    process.exit(1);
  }

  try {
    const server = createMailCaptureServer({ apiKey });
    server.on('error', () => process.exit(1));
    server.listen(port, '0.0.0.0');
  } catch {
    process.exit(1);
  }
}
