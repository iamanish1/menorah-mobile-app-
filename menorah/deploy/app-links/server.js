'use strict';

const http = require('http');

const port = Number.parseInt(process.env.PORT || '8080', 10);

const APPLE_TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;
const ANDROID_PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const SHA256_FINGERPRINT_PATTERN = /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildAppleAssociation(environment = process.env) {
  const teamId = text(environment.APPLE_APP_LINK_TEAM_ID);
  const bundleId = text(environment.APPLE_APP_LINK_BUNDLE_ID);

  if (!APPLE_TEAM_ID_PATTERN.test(teamId) || !BUNDLE_ID_PATTERN.test(bundleId)) {
    return null;
  }

  return {
    applinks: {
      details: [
        {
          appID: `${teamId}.${bundleId}`,
          components: [
            { '/': '/reset-password' },
            { '/': '/reset-password/*' },
            { '/': '/api/auth/reset-password' },
            { '/': '/api/auth/reset-password/*' },
          ],
        },
      ],
    },
  };
}

function buildAndroidAssociation(environment = process.env) {
  const packageName = text(environment.ANDROID_APP_LINK_PACKAGE_NAME);
  const fingerprints = text(environment.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS)
    .split(',')
    .map((fingerprint) => fingerprint.trim().toUpperCase())
    .filter(Boolean);

  if (
    !ANDROID_PACKAGE_PATTERN.test(packageName)
    || fingerprints.length === 0
    || fingerprints.some((fingerprint) => !SHA256_FINGERPRINT_PATTERN.test(fingerprint))
  ) {
    return null;
  }

  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

function createServer(environment = process.env) {
  const appleAssociation = buildAppleAssociation(environment);
  const androidAssociation = buildAndroidAssociation(environment);
  const associations = new Map([
    ['/.well-known/apple-app-site-association', appleAssociation],
    ['/.well-known/assetlinks.json', androidAssociation],
  ]);

  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');

    if (requestUrl.pathname === '/health/live') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }

    const association = associations.get(requestUrl.pathname);
    if (!association) {
      response.writeHead(404, { 'Cache-Control': 'no-store' });
      response.end();
      return;
    }

    const body = JSON.stringify(association);
    response.writeHead(200, {
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'Content-Length': Buffer.byteLength(body),
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  });
}

if (require.main === module) {
  createServer().listen(port, '0.0.0.0', () => {
    console.info(`App-link association service listening on ${port}`);
  });
}

module.exports = {
  buildAndroidAssociation,
  buildAppleAssociation,
  createServer,
};
