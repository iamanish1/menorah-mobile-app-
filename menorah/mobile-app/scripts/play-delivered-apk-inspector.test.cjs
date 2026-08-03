const assert = require('node:assert/strict');
const test = require('node:test');
const { readApkSignerFingerprint } = require('./inspect-play-delivered-apk.cjs');

test('reads and normalizes the Play signer fingerprint from apksigner output', () => {
  assert.equal(
    readApkSignerFingerprint(
      'Signer #1 certificate SHA-256 digest: aa:bb:cc:01\nVerified using v3 scheme: true'
    ),
    'AABBCC01'
  );
});

test('does not accept a differently labelled or absent digest', () => {
  assert.equal(readApkSignerFingerprint('Signer #2 certificate SHA-256 digest: aa'), '');
  assert.equal(readApkSignerFingerprint('Verified'), '');
});
