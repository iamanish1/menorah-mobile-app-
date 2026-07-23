import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  DEFAULT_CADDY_PATH,
  DEFAULT_MANIFEST_PATH,
  validateCaddySource,
  validateConfigSource,
} from './validate-cloudflare-tunnel-config.mjs';

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/cloudflare-tunnel',
);

async function validateFixture(name) {
  const source = await readFile(path.join(FIXTURE_DIR, name), 'utf8');
  return validateConfigSource(source, { configLabel: name });
}

test('accepts a complete locally managed YAML configuration', async () => {
  const result = await validateFixture('complete-local.yml');
  assert.deepEqual(result.errors, []);
  assert.equal(result.routeCount, 22);
});

test('accepts a sanitized remotely managed API JSON export', async () => {
  const result = await validateFixture('complete-remote.json');
  assert.deepEqual(result.errors, []);
  assert.equal(result.routeCount, 22);
});

test('rejects a missing expected hostname', async () => {
  const result = await validateFixture('missing.yml');
  assert.match(
    result.errors.join('\n'),
    /missing expected hostname api-admin\.menorah\.me/,
  );
});

test('rejects duplicate hostnames after DNS normalization', async () => {
  const result = await validateFixture('duplicate.yml');
  assert.match(
    result.errors.join('\n'),
    /duplicates normalized hostname menorah\.me/,
  );
});

test('rejects an unexpected hostname', async () => {
  const result = await validateFixture('unexpected.yml');
  assert.match(
    result.errors.join('\n'),
    /contains unexpected hostname internal\.menorah\.me/,
  );
});

test('rejects malformed YAML without echoing source content', async () => {
  const result = await validateFixture('malformed.yml');
  assert.match(result.errors.join('\n'), /is not valid YAML or JSON/);
  assert.doesNotMatch(result.errors.join('\n'), /do-not-echo/);
});

test('rejects a catch-all before the final rule', async () => {
  const result = await validateFixture('early-catch-all.yml');
  assert.match(result.errors.join('\n'), /catch-all rule must be final/);
});

test('requires an exact final 404 service', async () => {
  const result = await validateFixture('non-404-final.yml');
  assert.match(
    result.errors.join('\n'),
    /hostname-free, path-free final http_status:404 catch-all/,
  );
});

test('rejects an origin outside the private Docker service', async () => {
  const result = await validateFixture('unsafe-service.yml');
  assert.match(
    result.errors.join('\n'),
    /must target http:\/\/reverse-proxy:80/,
  );
});

test('rejects HTTPS for Caddy because the production origin has TLS disabled', async () => {
  const source = await readFile(
    path.join(FIXTURE_DIR, 'complete-local.yml'),
    'utf8',
  );
  const result = await validateConfigSource(
    source.replace(
      'service: http://reverse-proxy:80',
      'service: https://reverse-proxy:443',
    ),
    { configLabel: 'HTTPS origin fixture' },
  );
  assert.match(
    result.errors.join('\n'),
    /must use HTTP for the private cloudflared-to-Caddy Docker hop/,
  );
});

test('rejects disabling origin TLS verification', async () => {
  const source = await readFile(
    path.join(FIXTURE_DIR, 'complete-local.yml'),
    'utf8',
  );
  const result = await validateConfigSource(
    `originRequest:\n  noTLSVerify: true\n${source}`,
    { configLabel: 'noTLSVerify fixture' },
  );
  assert.match(
    result.errors.join('\n'),
    /noTLSVerify must not disable TLS verification/,
  );
});

test('rejects path-restricted public hostname rules', async () => {
  const result = await validateFixture('path-restricted.yml');
  assert.match(
    result.errors.join('\n'),
    /must not restrict an expected public hostname with a path matcher/,
  );
});

test('source-controlled example and Caddy production config stay in parity', async () => {
  const examplePath = path.resolve(
    path.dirname(DEFAULT_MANIFEST_PATH),
    'tunnel-config.yml.example',
  );
  const source = await readFile(examplePath, 'utf8');
  const result = await validateConfigSource(source, {
    configLabel: 'source-controlled tunnel example',
  });
  assert.deepEqual(result.errors, []);
});

test('detects Caddy site drift from the manifest', async () => {
  const [manifest, caddySource] = await Promise.all([
    readFile(DEFAULT_MANIFEST_PATH, 'utf8').then(JSON.parse),
    readFile(DEFAULT_CADDY_PATH, 'utf8'),
  ]);
  const drifted = caddySource.replace('http://calls.mentle.org {', '');
  assert.match(
    validateCaddySource(drifted, manifest).join('\n'),
    /missing manifest site calls\.mentle\.org/,
  );
});
