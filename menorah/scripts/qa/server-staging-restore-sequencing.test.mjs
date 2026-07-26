import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL(
    '../../deploy/server-staging/restore-staging.sh',
    import.meta.url,
  ),
  'utf8',
);

const position = (pattern, label) => {
  const match = source.match(pattern);
  assert.ok(match, `missing ${label}`);
  return match.index;
};

test('restore publishes its durable marker before destructive operations', () => {
  const marker = position(
    /ln -- "\$\{RESTORE_MARKER_TEMP\}" "\$\{RESTORE_MARKER\}"/,
    'durable restore marker publication',
  );
  for (const [pattern, label] of [
    [/dropDatabase\(\)/, 'disposable database reset'],
    [/^mongorestore \\/m, 'database restore'],
    [
      /find "\$\{RESTORE_MEDIA_ROOT\}"[\s\S]*-exec rm -rf/,
      'restore-media cleanup',
    ],
  ]) {
    assert.ok(
      marker < position(pattern, label),
      `${label} must follow durable marker publication`,
    );
  }
});

test('restore preserves failure evidence with an atomic review marker', () => {
  assert.match(
    source,
    /readonly RESTORE_REVIEW_TEMP="\/opt\/menorah-staging\/deploy-state\/recovery\/\.restore-requires-review\.\$\$\.tmp"/,
  );
  assert.match(
    source,
    /cp -- "\$\{RESTORE_MARKER\}" "\$\{RESTORE_REVIEW_TEMP\}"/,
  );
  assert.match(
    source,
    /ln -- "\$\{RESTORE_REVIEW_TEMP\}" "\$\{RESTORE_REVIEW\}"/,
  );
  assert.doesNotMatch(
    source,
    /mv\s+[^\n]*"\$\{RESTORE_(?:MARKER|REVIEW)_TEMP\}"/,
  );
  assert.doesNotMatch(source, /2>\/dev\/null\s*\|\|\s*:/);

  const cleanup = source.match(
    /cleanup\(\) \{[\s\S]*?^}\ntrap cleanup EXIT/m,
  )?.[0] || '';
  assert.match(cleanup, /if \[ "\$\{status\}" -ne 0 \]/);
  assert.doesNotMatch(
    cleanup,
    /rm -f --[^\n]*"\$\{RESTORE_MARKER\}"/,
  );
});

test('restore authenticates and inspects archives before database reset', () => {
  const marker = position(
    /ln -- "\$\{RESTORE_MARKER_TEMP\}" "\$\{RESTORE_MARKER\}"/,
    'durable restore marker publication',
  );
  const signature = source.indexOf(
    'perl -MDigest::SHA=hmac_sha256_hex',
    marker,
  );
  const exactChecksums = source.indexOf(
    '\nassert_exact_checksum_manifest\n',
    signature,
  );
  const checksumVerification = source.indexOf(
    'sha256sum --strict -c SHA256SUMS',
    exactChecksums,
  );
  const decrypt = source.indexOf(
    'openssl enc -d -aes-256-cbc',
    checksumVerification,
  );
  const archiveInspection = source.indexOf(
    'validate_regular_directory_archive \\\n'
      + '  "${WORK_DIR}/uploads.tar.gz"',
    decrypt,
  );
  const databaseReset = source.indexOf('dropDatabase()', archiveInspection);

  assert.ok(signature > marker);
  assert.ok(exactChecksums > signature);
  assert.ok(checksumVerification > exactChecksums);
  assert.ok(decrypt > checksumVerification);
  assert.ok(archiveInspection > decrypt);
  assert.ok(databaseReset > archiveInspection);
  assert.match(source, /"\\"createdAt\\": \\"\$\{STAMP\}\\""/);
  assert.match(source, /--stopOnError/);
});

test('restore keeps its trap armed through ordered success cleanup', () => {
  const finalDatabaseComparison = position(
    /cmp -s \\\n  "\$\{BUNDLE\}\/database-manifest\.json"/,
    'final database-manifest comparison',
  );
  const workCleanup = source.lastIndexOf('rm -rf -- "${WORK_DIR}"');
  const configCleanup = source.lastIndexOf(
    'rm -f -- "${MONGO_CONFIG}" "${RESTORE_MARKER_TEMP}"',
  );
  const lockCleanup = source.lastIndexOf('rm -f -- "${RESTORE_LOCK}"');
  const markerCleanup = source.lastIndexOf('rm -f -- "${RESTORE_MARKER}"');
  const success = source.lastIndexOf(
    'Server-staging restore verified: ${STAMP}',
  );

  assert.ok(finalDatabaseComparison < workCleanup);
  assert.ok(workCleanup < configCleanup);
  assert.ok(configCleanup < markerCleanup);
  assert.ok(markerCleanup < lockCleanup);
  assert.ok(markerCleanup < success);

  const successTail = source.slice(finalDatabaseComparison);
  assert.doesNotMatch(successTail, /^trap - EXIT HUP INT TERM$/m);
});
