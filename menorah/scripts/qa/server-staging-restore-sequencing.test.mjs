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
    /mv -- "\$\{RESTORE_MARKER_TEMP\}" "\$\{RESTORE_MARKER\}"/,
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
    /mv -- "\$\{RESTORE_REVIEW_TEMP\}" "\$\{RESTORE_REVIEW\}"/,
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
  assert.ok(configCleanup < lockCleanup);
  assert.ok(lockCleanup < markerCleanup);
  assert.ok(markerCleanup < success);

  const successTail = source.slice(finalDatabaseComparison);
  assert.doesNotMatch(successTail, /^trap - EXIT HUP INT TERM$/m);
});
