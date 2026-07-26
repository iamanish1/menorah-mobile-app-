#!/usr/bin/env node
'use strict';

/*
 * The backup artifacts deliberately remain outside of this namespace.  This
 * program is the sole writer for the authenticated control plane under
 * metadata/integrity-epochs, so a key rotation never needs to mutate legacy
 * backup artifacts or their root-level convenience markers.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const command = process.argv[2];
const epochId = process.env.BACKUP_INTEGRITY_EPOCH_ID || '';
const hmacKey = process.env.BACKUP_INTEGRITY_HMAC_KEY || '';
const backupRootInput = process.env.MENORAH_BACKUP_ROOT || '/opt/menorah/backups';
const epochIdPattern = /^[a-z0-9][a-z0-9-]{2,63}$/;
const hmacPattern = /^[0-9a-f]{64}$/;
const cadencePattern = /^(manual|six-hourly|daily|weekly|monthly)$/;

function fail(message) {
  process.stderr.write(`backup integrity epoch: ${message}\n`);
  process.exit(1);
}

function invariant(condition, message) {
  if (!condition) fail(message);
}

function hasControlCharacters(value) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function requireKey() {
  invariant(Buffer.byteLength(hmacKey, 'utf8') >= 32, 'BACKUP_INTEGRITY_HMAC_KEY must contain at least 32 characters');
}

function requireEpochId(value = epochId) {
  invariant(epochIdPattern.test(value), 'BACKUP_INTEGRITY_EPOCH_ID must be 3-64 lowercase letters, digits, or hyphens');
  return value;
}

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  invariant(value && typeof value === 'object', 'record contains an unsupported value');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function hmac(value) {
  return crypto.createHmac('sha256', hmacKey).update(value).digest('hex');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function assertRegularFile(file, parent, label) {
  invariant(typeof file === 'string' && path.isAbsolute(file) && !hasControlCharacters(file), `${label} path is malformed`);
  const normalized = path.resolve(file);
  invariant(normalized === file, `${label} path is not canonical`);
  const resolved = fs.realpathSync(normalized);
  const stat = fs.lstatSync(normalized);
  invariant(!stat.isSymbolicLink() && stat.isFile(), `${label} is not a regular non-symlink file`);
  invariant(resolved === normalized && isWithin(resolved, parent), `${label} escaped its expected directory`);
  return resolved;
}

function assertDirectory(directory, parent, label) {
  const resolved = fs.realpathSync(directory);
  const stat = fs.lstatSync(directory);
  invariant(!stat.isSymbolicLink() && stat.isDirectory(), `${label} is not a directory`);
  invariant(resolved === directory && (!parent || isWithin(resolved, parent)), `${label} escaped its expected directory`);
  return resolved;
}

function isWithin(candidate, parent) {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function ensureDirectory(directory, mode = 0o700) {
  fs.mkdirSync(directory, { recursive: true, mode });
  const resolved = fs.realpathSync(directory);
  const stat = fs.lstatSync(directory);
  invariant(!stat.isSymbolicLink() && stat.isDirectory() && resolved === directory, `unsafe directory: ${directory}`);
  fs.chmodSync(directory, mode);
}

function existingNode(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertAbsent(target, label) {
  invariant(!existingNode(target), `refusing to overwrite an existing ${label}`);
}

function assertReplaceableAtomicTarget(target, label) {
  const current = existingNode(target);
  invariant(!current || !current.isSymbolicLink(), `refusing to replace a symbolic-link ${label}`);
}

function paths() {
  invariant(path.isAbsolute(backupRootInput) && !hasControlCharacters(backupRootInput), 'MENORAH_BACKUP_ROOT is malformed');
  const root = fs.realpathSync(backupRootInput);
  const rootStat = fs.lstatSync(backupRootInput);
  invariant(rootStat.isDirectory() && !rootStat.isSymbolicLink() && root === backupRootInput, 'MENORAH_BACKUP_ROOT must be a canonical non-symlink directory');
  const metadata = path.join(root, 'metadata');
  const epochs = path.join(metadata, 'integrity-epochs');
  const epoch = path.join(epochs, requireEpochId());
  return { root, metadata, epochs, epoch };
}

function readJson(file, label) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} is not an object`);
    return value;
  } catch (error) {
    fail(`${label} is malformed`);
  }
}

function signFile(file) {
  requireKey();
  const parent = path.dirname(file);
  const target = `${file}.hmac-sha256`;
  assertAbsent(target, 'signature sidecar');
  const tmp = path.join(parent, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(tmp, `${hmac(fs.readFileSync(file))}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, target);
    fs.chmodSync(target, 0o600);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function verifyFile(file, parent, label) {
  requireKey();
  const checked = assertRegularFile(file, parent, label);
  const sidecar = assertRegularFile(`${checked}.hmac-sha256`, parent, `${label} signature`);
  const expected = fs.readFileSync(sidecar, 'utf8').trim();
  invariant(hmacPattern.test(expected), `${label} signature is malformed`);
  const actual = hmac(fs.readFileSync(checked));
  invariant(crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex')), `${label} HMAC verification failed`);
  return checked;
}

function signedRecord(record) {
  const payload = { ...record };
  delete payload.signature;
  return {
    ...payload,
    signature: {
      algorithm: 'hmac-sha256',
      value: hmac(canonical(payload)),
    },
  };
}

function verifyEmbeddedSignature(record, label) {
  requireKey();
  invariant(record.signature && typeof record.signature === 'object', `${label} signature is missing`);
  invariant(record.signature.algorithm === 'hmac-sha256' && hmacPattern.test(record.signature.value || ''), `${label} signature is malformed`);
  const payload = { ...record };
  delete payload.signature;
  const actual = hmac(canonical(payload));
  invariant(crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(record.signature.value, 'hex')), `${label} HMAC verification failed`);
  return payload;
}

function writeImmutableSignedJson(target, value, parent, label) {
  assertAbsent(target, `immutable ${label}`);
  assertAbsent(`${target}.hmac-sha256`, `${label} signature sidecar`);
  const directory = path.dirname(target);
  ensureDirectory(directory, 0o700);
  assertDirectory(directory, parent, `${label} directory`);
  const tmp = path.join(directory, `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, target);
    signFile(target);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function writeAtomicJson(target, value, parent, label) {
  assertReplaceableAtomicTarget(target, label);
  const directory = path.dirname(target);
  ensureDirectory(directory, 0o700);
  assertDirectory(directory, parent, `${label} directory`);
  const tmp = path.join(directory, `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, target);
    fs.chmodSync(target, 0o600);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function compactTimestamp(value, label) {
  invariant(/^\d{8}T\d{6}Z$/.test(value || ''), `${label} timestamp is malformed`);
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(9, 11));
  const minute = Number(value.slice(11, 13));
  const second = Number(value.slice(13, 15));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  invariant(date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === second, `${label} timestamp is invalid`);
}

function recordTypeForKind(kind) {
  return kind === 'backup'
    ? 'menorah-backup-evidence'
    : 'menorah-backup-restore-evidence';
}

function validateEpoch({ requireActive = true } = {}) {
  requireKey();
  const value = requireEpochId();
  const { root, metadata, epochs, epoch } = paths();
  assertDirectory(metadata, root, 'backup metadata directory');
  assertDirectory(epochs, metadata, 'integrity epoch root');
  assertDirectory(epoch, epochs, 'configured integrity epoch');
  const manifest = path.join(epoch, 'epoch-start.json');
  const completed = path.join(epoch, 'epoch-complete.json');
  verifyFile(manifest, epoch, 'epoch start manifest');
  verifyFile(completed, epoch, 'epoch completion manifest');
  const start = readJson(manifest, 'epoch start manifest');
  invariant(start.schemaVersion === 1 && start.recordType === 'menorah-backup-integrity-epoch-start' && start.epochId === value && start.algorithm === 'hmac-sha256' && start.keyFingerprintSha256 === crypto.createHash('sha256').update(hmacKey).digest('hex') && start.legacyEvidenceDisposition === 'legacy evidence retained but cryptographically unverifiable' && typeof start.createdAt === 'string', 'epoch start manifest does not match the configured authority');
  const complete = readJson(completed, 'epoch completion manifest');
  invariant(complete.schemaVersion === 1 && complete.recordType === 'menorah-backup-integrity-epoch-complete' && complete.epochId === value && complete.epochStartSha256 === sha256File(manifest) && typeof complete.completedAt === 'string', 'epoch initialization is incomplete or inconsistent');
  let active = null;
  if (requireActive) {
    const activeFile = path.join(epochs, 'active.json');
    assertRegularFile(activeFile, epochs, 'active integrity epoch selection');
    active = verifyEmbeddedSignature(readJson(activeFile, 'active integrity epoch selection'), 'active integrity epoch selection');
    invariant(active.schemaVersion === 1 && active.recordType === 'menorah-backup-integrity-active-epoch' && active.epochId === value && active.activationRecord === path.join(epoch, 'activation.json'), 'active integrity epoch selection does not match the configured epoch');
    verifyFile(active.activationRecord, epoch, 'epoch activation record');
    invariant(active.activationSha256 === sha256File(active.activationRecord), 'active integrity epoch activation digest verification failed');
    const activation = readJson(active.activationRecord, 'epoch activation record');
    invariant(activation.schemaVersion === 1 && activation.recordType === 'menorah-backup-integrity-epoch-activation' && activation.epochId === value && activation.keyFingerprintSha256 === start.keyFingerprintSha256, 'epoch activation record does not match the configured authority');
  }
  return { root, metadata, epochs, epoch, start, active };
}

function readStdinJson(label) {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
    const value = JSON.parse(raw);
    invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} is not an object`);
    return value;
  } catch (error) {
    fail(`${label} is malformed`);
  }
}

function initialize() {
  requireKey();
  const id = requireEpochId();
  const reason = process.argv[3] || '';
  invariant(['initial-establishment', 'key-rotation'].includes(reason), 'initialization reason must be initial-establishment or key-rotation');
  const { root, metadata, epochs, epoch } = paths();
  ensureDirectory(metadata, 0o700);
  ensureDirectory(epochs, 0o700);
  assertDirectory(metadata, root, 'backup metadata directory');
  assertDirectory(epochs, metadata, 'integrity epoch root');
  assertAbsent(epoch, 'configured epoch');
  const temp = fs.mkdtempSync(path.join(epochs, `.${id}.initializing.`));
  fs.chmodSync(temp, 0o700);
  try {
    const createdAt = isoNow();
    const start = {
      schemaVersion: 1,
      recordType: 'menorah-backup-integrity-epoch-start',
      epochId: id,
      createdAt,
      algorithm: 'hmac-sha256',
      keyFingerprintSha256: crypto.createHash('sha256').update(hmacKey).digest('hex'),
      reason,
      evidenceFormatVersion: 1,
      legacyEvidenceDisposition: 'legacy evidence retained but cryptographically unverifiable',
    };
    const startFile = path.join(temp, 'epoch-start.json');
    writeImmutableSignedJson(startFile, start, temp, 'epoch start manifest');
    const complete = {
      schemaVersion: 1,
      recordType: 'menorah-backup-integrity-epoch-complete',
      epochId: id,
      completedAt: isoNow(),
      epochStartSha256: sha256File(startFile),
    };
    writeImmutableSignedJson(path.join(temp, 'epoch-complete.json'), complete, temp, 'epoch completion manifest');
    fs.renameSync(temp, epoch);
    fs.chmodSync(epoch, 0o700);
  } catch (error) {
    // The uniquely named incomplete directory is intentionally retained for
    // audit. It is never selected by ID and a retry creates a fresh directory.
    throw error;
  }
}

function activate() {
  const previousEpochId = process.argv[3] || '';
  if (previousEpochId) {
    requireEpochId(previousEpochId);
    invariant(previousEpochId !== epochId, 'previous epoch must differ from the configured epoch');
  }
  const context = validateEpoch({ requireActive: false });
  const activationFile = path.join(context.epoch, 'activation.json');
  const activation = {
    schemaVersion: 1,
    recordType: 'menorah-backup-integrity-epoch-activation',
    epochId,
    activatedAt: isoNow(),
    previousEpochId: previousEpochId || null,
    keyFingerprintSha256: context.start.keyFingerprintSha256,
    disposition: previousEpochId ? 'supersedes-previous-epoch' : 'initial-active-epoch',
  };
  writeImmutableSignedJson(activationFile, activation, context.epoch, 'epoch activation record');
  const active = signedRecord({
    schemaVersion: 1,
    recordType: 'menorah-backup-integrity-active-epoch',
    epochId,
    selectedAt: isoNow(),
    previousEpochId: previousEpochId || null,
    activationRecord: activationFile,
    activationSha256: sha256File(activationFile),
  });
  writeAtomicJson(path.join(context.epochs, 'active.json'), active, context.epochs, 'active integrity epoch selection');
}

function writeEvidence(kind) {
  const context = validateEpoch();
  const evidence = readStdinJson(`${kind} evidence`);
  invariant(evidence.schemaVersion === 1 && evidence.recordType === recordTypeForKind(kind) && evidence.epochId === epochId, `${kind} evidence does not match the configured epoch`);
  let target;
  if (kind === 'backup') {
    invariant(cadencePattern.test(evidence.backupType), 'backup evidence cadence is invalid');
    compactTimestamp(evidence.timestamp, 'backup evidence');
    target = path.join(context.epoch, 'evidence', 'backups', evidence.backupType, `${evidence.timestamp}.json`);
  } else {
    invariant(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(evidence.timestamp || ''), 'restore evidence timestamp is invalid');
    target = path.join(context.epoch, 'evidence', 'restore-tests', `${evidence.timestamp.replace(/[-:]/g, '').replace('T', 'T')}.json`);
  }
  writeImmutableSignedJson(target, evidence, context.epoch, `${kind} evidence`);
  process.stdout.write(target);
}

function evidenceFile(context, kind, cadence) {
  const pointer = path.join(context.epoch, 'pointers', kind === 'backup' ? `latest-success-${cadence}.json` : 'latest-restore-test.json');
  assertRegularFile(pointer, context.epoch, `${kind} pointer`);
  const payload = verifyEmbeddedSignature(readJson(pointer, `${kind} pointer`), `${kind} pointer`);
  invariant(payload.schemaVersion === 1 && payload.recordType === (kind === 'backup' ? 'menorah-backup-latest-pointer' : 'menorah-restore-test-latest-pointer') && payload.epochId === epochId, `${kind} pointer does not match the configured epoch`);
  if (kind === 'backup') invariant(payload.backupType === cadence, `${kind} pointer cadence is inconsistent`);
  const expectedPrefix = kind === 'backup'
    ? path.join(context.epoch, 'evidence', 'backups', cadence) + path.sep
    : path.join(context.epoch, 'evidence', 'restore-tests') + path.sep;
  invariant(typeof payload.evidenceFile === 'string' && payload.evidenceFile.startsWith(expectedPrefix), `${kind} pointer references evidence outside its epoch`);
  const evidencePath = verifyFile(payload.evidenceFile, context.epoch, `${kind} evidence`);
  invariant(sha256File(evidencePath) === payload.evidenceSha256, `${kind} pointer evidence digest verification failed`);
  const evidence = readJson(evidencePath, `${kind} evidence`);
  invariant(evidence.epochId === epochId && evidence.recordType === recordTypeForKind(kind), `${kind} evidence does not match its epoch`);
  return { pointer, payload, evidencePath, evidence };
}

function publishPointer(kind) {
  const context = validateEpoch();
  const cadence = kind === 'backup' ? process.argv[3] : '';
  const evidencePathInput = kind === 'backup' ? process.argv[4] : process.argv[3];
  if (kind === 'backup') invariant(cadencePattern.test(cadence), 'backup pointer cadence is invalid');
  const expectedPrefix = kind === 'backup'
    ? path.join(context.epoch, 'evidence', 'backups', cadence) + path.sep
    : path.join(context.epoch, 'evidence', 'restore-tests') + path.sep;
  invariant(typeof evidencePathInput === 'string' && path.isAbsolute(evidencePathInput) && evidencePathInput.startsWith(expectedPrefix), 'pointer evidence path is outside the active epoch');
  const evidencePath = verifyFile(evidencePathInput, context.epoch, `${kind} evidence`);
  const evidence = readJson(evidencePath, `${kind} evidence`);
  invariant(evidence.epochId === epochId && evidence.recordType === recordTypeForKind(kind), `${kind} evidence does not match its epoch`);
  if (kind === 'backup') invariant(evidence.backupType === cadence, 'backup evidence cadence does not match pointer cadence');
  const unsignedPointer = {
    schemaVersion: 1,
    recordType: kind === 'backup' ? 'menorah-backup-latest-pointer' : 'menorah-restore-test-latest-pointer',
    epochId,
    timestamp: evidence.timestamp,
    evidenceFile: evidencePath,
    evidenceSha256: sha256File(evidencePath),
    updatedAt: isoNow(),
  };
  if (kind === 'backup') unsignedPointer.backupType = cadence;
  const payload = signedRecord(unsignedPointer);
  const pointer = path.join(context.epoch, 'pointers', kind === 'backup' ? `latest-success-${cadence}.json` : 'latest-restore-test.json');
  writeAtomicJson(pointer, payload, context.epoch, `${kind} pointer`);
}

function getEvidence(kind) {
  const context = validateEpoch();
  const cadence = kind === 'backup' ? process.argv[3] : '';
  if (kind === 'backup') invariant(cadencePattern.test(cadence), 'backup evidence cadence is invalid');
  const value = evidenceFile(context, kind, cadence);
  process.stdout.write(JSON.stringify({ evidenceFile: value.evidencePath, evidence: value.evidence }));
}

function latestBackup() {
  const context = validateEpoch();
  const pointers = path.join(context.epoch, 'pointers');
  assertDirectory(pointers, context.epoch, 'epoch pointer directory');
  const values = [];
  for (const name of fs.readdirSync(pointers)) {
    const match = /^latest-success-(manual|six-hourly|daily|weekly|monthly)\.json$/.exec(name);
    if (!match) continue;
    const value = evidenceFile(context, 'backup', match[1]);
    values.push(value);
  }
  invariant(values.length > 0, 'active epoch has no backup pointers');
  values.sort((left, right) => right.evidence.timestamp.localeCompare(left.evidence.timestamp));
  process.stdout.write(JSON.stringify({ evidenceFile: values[0].evidencePath, evidence: values[0].evidence }));
}

function findBackupEvidence() {
  const archive = process.argv[3] || '';
  const context = validateEpoch();
  invariant(path.isAbsolute(archive) && !hasControlCharacters(archive), 'backup archive path is malformed');
  const evidenceRoot = path.join(context.epoch, 'evidence', 'backups');
  assertDirectory(evidenceRoot, context.epoch, 'backup evidence directory');
  for (const cadence of fs.readdirSync(evidenceRoot)) {
    if (!cadencePattern.test(cadence)) continue;
    const directory = path.join(evidenceRoot, cadence);
    if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) continue;
    for (const name of fs.readdirSync(directory)) {
      if (!/^\d{8}T\d{6}Z\.json$/.test(name)) continue;
      const file = path.join(directory, name);
      verifyFile(file, context.epoch, 'backup evidence');
      const evidence = readJson(file, 'backup evidence');
      if (evidence.recordType === recordTypeForKind('backup') && evidence.epochId === epochId && evidence.mongoArchive === archive) {
        process.stdout.write(JSON.stringify({ evidenceFile: file, evidence }));
        return;
      }
    }
  }
  fail('no signed active-epoch evidence matches the requested archive');
}

try {
  switch (command) {
    case 'validate-id':
      requireEpochId();
      break;
    case 'initialize':
      initialize();
      break;
    case 'activate':
      activate();
      break;
    case 'validate':
      validateEpoch();
      break;
    case 'write-backup-evidence':
      writeEvidence('backup');
      break;
    case 'write-restore-evidence':
      writeEvidence('restore');
      break;
    case 'publish-backup-pointer':
      publishPointer('backup');
      break;
    case 'publish-restore-pointer':
      publishPointer('restore');
      break;
    case 'get-backup-evidence':
      getEvidence('backup');
      break;
    case 'get-restore-evidence':
      getEvidence('restore');
      break;
    case 'get-latest-backup-evidence':
      latestBackup();
      break;
    case 'find-backup-evidence':
      findBackupEvidence();
      break;
    default:
      fail('unsupported command');
  }
} catch (error) {
  fail(error && error.message ? error.message : 'unexpected failure');
}
