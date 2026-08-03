#!/usr/bin/env node
'use strict';

// Fail-closed validator for the immutable backup-integrity epoch namespace.
// It intentionally has no fallback to root-level legacy latest-success files.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootInput = process.env.BACKUP_HEALTH_ROOT || '';
const epochId = process.env.BACKUP_INTEGRITY_EPOCH_ID || '';
const key = process.env.BACKUP_INTEGRITY_HMAC_KEY || '';
const minSize = Number(process.env.BACKUP_HEALTH_MIN_SIZE_BYTES || 0);
const dailyMaxMs = Number(process.env.BACKUP_HEALTH_DAILY_MAX_AGE_HOURS || 0) * 60 * 60 * 1000;
const weeklyMaxMs = Number(process.env.BACKUP_HEALTH_WEEKLY_MAX_AGE_HOURS || 0) * 60 * 60 * 1000;
const restoreMaxMs = Number(process.env.BACKUP_HEALTH_RESTORE_MAX_AGE_HOURS || 0) * 60 * 60 * 1000;
const requireEncryption = process.env.BACKUP_HEALTH_REQUIRE_ENCRYPTION === 'true';
const requireRestore = process.env.BACKUP_HEALTH_CHECK_RESTORE === 'true';
const production = process.env.BACKUP_HEALTH_PRODUCTION === 'true';
const epochPattern = /^[a-z0-9][a-z0-9-]{2,63}$/;
const shaPattern = /^[0-9a-f]{64}$/;
const cadencePattern = /^(manual|six-hourly|daily|weekly|monthly)$/;
const skewMs = 5 * 60 * 1000;
const hashCache = new Map();

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function canonical(value) {
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  invariant(value && typeof value === 'object', 'signature payload contains an unsupported value');
  return `{${Object.keys(value).sort().map((name) => `${JSON.stringify(name)}:${canonical(value[name])}`).join(',')}}`;
}

function hmac(value) {
  return crypto.createHmac('sha256', key).update(value).digest('hex');
}

function hasControlCharacters(value) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function isWithin(candidate, parent) {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function checkedPath(candidate, parent, kind, label) {
  invariant(typeof candidate === 'string' && path.isAbsolute(candidate) && !hasControlCharacters(candidate), `${label} path is malformed`);
  const normalized = path.resolve(candidate);
  invariant(normalized === candidate, `${label} path is not canonical`);
  const resolved = fs.realpathSync(normalized);
  const stat = fs.lstatSync(normalized);
  invariant(!stat.isSymbolicLink() && resolved === normalized && isWithin(resolved, parent), `${label} escaped its expected root`);
  if (kind === 'file') invariant(stat.isFile(), `${label} is not a regular file`);
  if (kind === 'directory') invariant(stat.isDirectory(), `${label} is not a directory`);
  return resolved;
}

function readJson(file, label) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} is not an object`);
  return value;
}

function sha256(file) {
  if (!hashCache.has(file)) {
    hashCache.set(file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  }
  return hashCache.get(file);
}

function verifySidecar(file, parent, label) {
  const checked = checkedPath(file, parent, 'file', label);
  const sidecar = checkedPath(`${checked}.hmac-sha256`, parent, 'file', `${label} signature`);
  const expected = fs.readFileSync(sidecar, 'utf8').trim();
  invariant(shaPattern.test(expected), `${label} signature is malformed`);
  const actual = hmac(fs.readFileSync(checked));
  invariant(crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex')), `${label} HMAC verification failed`);
  return checked;
}

function verifyPointer(file, parent, label) {
  const checked = checkedPath(file, parent, 'file', label);
  const record = readJson(checked, label);
  invariant(record.signature && record.signature.algorithm === 'hmac-sha256' && shaPattern.test(record.signature.value || ''), `${label} signature is malformed`);
  const payload = { ...record };
  delete payload.signature;
  const actual = hmac(canonical(payload));
  invariant(crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(record.signature.value, 'hex')), `${label} HMAC verification failed`);
  return payload;
}

function compactEpoch(value, label) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value || '');
  invariant(match, `${label} timestamp is malformed`);
  const parts = match.slice(1).map(Number);
  const at = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  const date = new Date(at);
  invariant(date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2] && date.getUTCHours() === parts[3] && date.getUTCMinutes() === parts[4] && date.getUTCSeconds() === parts[5], `${label} timestamp is invalid`);
  return at;
}

function isoEpoch(value, label) {
  invariant(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value || ''), `${label} timestamp is malformed`);
  const at = Date.parse(value);
  invariant(Number.isFinite(at), `${label} timestamp is invalid`);
  return at;
}

function requireFresh(at, maximumAgeMs, label) {
  const age = Date.now() - at;
  invariant(age >= -skewMs, `${label} timestamp is in the future`);
  invariant(age <= maximumAgeMs, `${label} is stale`);
}

function verifyArtifact(file, expectedSha, label, enforceSize = true) {
  const artifact = checkedPath(file, root, 'file', label);
  invariant(shaPattern.test(expectedSha || ''), `${label} digest is malformed`);
  if (enforceSize) invariant(fs.statSync(artifact).size >= minSize, `${label} is smaller than the configured minimum`);
  const checksumFile = checkedPath(`${artifact}.sha256`, root, 'file', `${label} checksum`);
  const checksum = fs.readFileSync(checksumFile, 'utf8').trim();
  const match = /^([0-9a-f]{64})[ \t]+(.+)$/.exec(checksum);
  invariant(match && match[1] === expectedSha && (match[2] === artifact || match[2] === path.basename(artifact)), `${label} checksum verification failed`);
  invariant(sha256(artifact) === expectedSha, `${label} digest verification failed`);
  return artifact;
}

function validateEpochAuthority() {
  invariant(Buffer.byteLength(key, 'utf8') >= 32, 'backup integrity HMAC key is too short');
  invariant(epochPattern.test(epochId), 'BACKUP_INTEGRITY_EPOCH_ID is malformed');
  invariant(path.isAbsolute(rootInput) && !hasControlCharacters(rootInput), 'backup root is malformed');
  root = fs.realpathSync(rootInput);
  invariant(root === rootInput && !fs.lstatSync(root).isSymbolicLink(), 'backup root must be a canonical non-symlink directory');
  const metadata = checkedPath(path.join(root, 'metadata'), root, 'directory', 'backup metadata directory');
  epochs = checkedPath(path.join(metadata, 'integrity-epochs'), metadata, 'directory', 'integrity epoch root');
  epochRoot = checkedPath(path.join(epochs, epochId), epochs, 'directory', 'configured integrity epoch');
  const startFile = verifySidecar(path.join(epochRoot, 'epoch-start.json'), epochRoot, 'epoch start manifest');
  const completeFile = verifySidecar(path.join(epochRoot, 'epoch-complete.json'), epochRoot, 'epoch completion manifest');
  const start = readJson(startFile, 'epoch start manifest');
  invariant(start.schemaVersion === 1 && start.recordType === 'menorah-backup-integrity-epoch-start' && start.epochId === epochId && start.algorithm === 'hmac-sha256' && start.keyFingerprintSha256 === crypto.createHash('sha256').update(key).digest('hex') && start.legacyEvidenceDisposition === 'legacy evidence retained but cryptographically unverifiable', 'epoch start manifest does not match the configured authority');
  const complete = readJson(completeFile, 'epoch completion manifest');
  invariant(complete.schemaVersion === 1 && complete.recordType === 'menorah-backup-integrity-epoch-complete' && complete.epochId === epochId && complete.epochStartSha256 === sha256(startFile), 'epoch initialization is incomplete or inconsistent');
  const active = verifyPointer(path.join(epochs, 'active.json'), epochs, 'active integrity epoch selection');
  invariant(active.schemaVersion === 1 && active.recordType === 'menorah-backup-integrity-active-epoch' && active.epochId === epochId && active.activationRecord === path.join(epochRoot, 'activation.json'), 'active integrity epoch selection does not match the configured epoch');
  const activationFile = verifySidecar(active.activationRecord, epochRoot, 'epoch activation record');
  invariant(active.activationSha256 === sha256(activationFile), 'active integrity epoch activation digest verification failed');
  const activation = readJson(activationFile, 'epoch activation record');
  invariant(activation.schemaVersion === 1 && activation.recordType === 'menorah-backup-integrity-epoch-activation' && activation.epochId === epochId && activation.keyFingerprintSha256 === start.keyFingerprintSha256, 'epoch activation record does not match the configured authority');
}

function evidenceFromPointer(kind, cadence) {
  const pointerFile = path.join(epochRoot, 'pointers', kind === 'backup' ? `latest-success-${cadence}.json` : 'latest-restore-test.json');
  const pointer = verifyPointer(pointerFile, epochRoot, `${kind} pointer`);
  const expectedType = kind === 'backup' ? 'menorah-backup-latest-pointer' : 'menorah-restore-test-latest-pointer';
  invariant(pointer.schemaVersion === 1 && pointer.recordType === expectedType && pointer.epochId === epochId, `${kind} pointer does not match the configured epoch`);
  if (kind === 'backup') invariant(pointer.backupType === cadence, `${kind} pointer cadence is inconsistent`);
  const prefix = kind === 'backup' ? path.join(epochRoot, 'evidence', 'backups', cadence) + path.sep : path.join(epochRoot, 'evidence', 'restore-tests') + path.sep;
  invariant(typeof pointer.evidenceFile === 'string' && pointer.evidenceFile.startsWith(prefix), `${kind} pointer references evidence outside the active epoch`);
  const evidenceFile = verifySidecar(pointer.evidenceFile, epochRoot, `${kind} evidence`);
  invariant(pointer.evidenceSha256 === sha256(evidenceFile), `${kind} pointer evidence digest verification failed`);
  const evidence = readJson(evidenceFile, `${kind} evidence`);
  const expectedRecord = kind === 'backup' ? 'menorah-backup-evidence' : 'menorah-backup-restore-evidence';
  invariant(evidence.schemaVersion === 1 && evidence.recordType === expectedRecord && evidence.epochId === epochId, `${kind} evidence does not match the configured epoch`);
  return evidence;
}

function validateSource(evidence, cadence, maximumAgeMs) {
  invariant(cadencePattern.test(cadence) && evidence.backupType === cadence, `${cadence} evidence cadence is inconsistent`);
  requireFresh(compactEpoch(evidence.timestamp, `${cadence} evidence`), maximumAgeMs, `${cadence} backup`);
  const metadataFile = checkedPath(evidence.metadataFile, root, 'file', `${cadence} metadata`);
  invariant(sha256(metadataFile) === evidence.metadataSha256, `${cadence} metadata digest verification failed`);
  const metadata = readJson(metadataFile, `${cadence} metadata`);
  const archive = verifyArtifact(evidence.mongoArchive, evidence.mongoArchiveSha256, `${cadence} MongoDB archive`);
  invariant(Number.isSafeInteger(evidence.mongoArchiveSize) && evidence.mongoArchiveSize === fs.statSync(archive).size, `${cadence} archive size is inconsistent`);
  const setDir = path.dirname(path.dirname(archive));
  const relative = path.relative(root, setDir).split(path.sep);
  invariant(relative.length === 2 && relative[0] === cadence && /^\d{8}T\d{6}Z$/.test(relative[1]) && relative[1] === evidence.timestamp, `${cadence} backup set path is malformed`);
  invariant(metadata.schemaVersion === 3 && metadata.artifactType === 'mongodb-full-instance-oplog' && metadata.scope === 'full-instance' && metadata.timestamp === evidence.timestamp && metadata.backupType === cadence && metadata.mongoArchive === archive && metadata.mongoArchiveSha256 === evidence.mongoArchiveSha256 && metadata.backupRoot === root && metadata.oplog === true && metadata.containsSystemIdentityData === true && metadata.directProductionRestoreAllowed === false && metadata.requiredSanitizationNamespace === 'menorah.*' && metadata.mediaStorageBackend === 'local' && metadata.mediaConsistencyContract === 'immutable-write-before-reference' && metadata.uploadsRequired === true && metadata.encrypted === evidence.encrypted, `${cadence} metadata safety contract is invalid`);
  if (requireEncryption) invariant(evidence.encrypted === true && archive.endsWith('.enc'), `${cadence} backup is not encrypted`);
  if (production) invariant(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(metadata.databaseToolsVersion || '') && /^7\.[0-9]+\.[0-9]+$/.test(metadata.mongoServerVersion || '') && metadata.mongoFeatureCompatibilityVersion === '7.0' && /^[0-9a-f]{40}$/i.test(metadata.deployedReleaseSha || ''), `${cadence} runtime provenance is invalid`);
  const uploads = verifyArtifact(evidence.uploadsArchive, evidence.uploadsArchiveSha256, `${cadence} uploads archive`, false);
  invariant(Number.isSafeInteger(evidence.uploadsArchiveSize) && evidence.uploadsArchiveSize === fs.statSync(uploads).size && metadata.uploadsArchive === uploads && metadata.uploadsArchiveSha256 === evidence.uploadsArchiveSha256, `${cadence} uploads evidence is inconsistent`);
  const manifestFile = verifyArtifact(evidence.uploadsManifest, evidence.uploadsManifestSha256, `${cadence} uploads manifest`, false);
  invariant(metadata.uploadsManifest === manifestFile && metadata.uploadsManifestSha256 === evidence.uploadsManifestSha256, `${cadence} uploads manifest evidence is inconsistent`);
  const manifest = readJson(manifestFile, `${cadence} uploads manifest`);
  invariant(manifest.schemaVersion === 1 && manifest.artifactType === 'menorah-immutable-media-manifest' && manifest.rootName === 'uploads' && Array.isArray(manifest.entries) && manifest.entries.length === manifest.fileCount && Number.isSafeInteger(manifest.totalBytes) && shaPattern.test(manifest.entriesSha256 || ''), `${cadence} uploads manifest safety contract is invalid`);
  const reportFile = verifyArtifact(evidence.mediaReferenceVerification, evidence.mediaReferenceVerificationSha256, `${cadence} media reference verification`, false);
  invariant(metadata.mediaReferenceVerification === reportFile && metadata.mediaReferenceVerificationSha256 === evidence.mediaReferenceVerificationSha256, `${cadence} media reference evidence is inconsistent`);
  const report = readJson(reportFile, `${cadence} media reference verification`);
  invariant(report.schemaVersion === 1 && report.verificationType === 'menorah-media-database-references' && report.manifestEntriesSha256 === manifest.entriesSha256, `${cadence} media reference verification is invalid`);
  if (production) invariant(report.valid === true && report.cloudinaryReferenceCount === 0 && Array.isArray(report.violations) && report.violations.length === 0, `${cadence} media database references were not verified`);
  return { evidence, metadata, archive, setDir };
}

function validateRestore(sources) {
  if (!requireRestore) return null;
  const evidence = evidenceFromPointer('restore');
  const testedAt = isoEpoch(evidence.timestamp, 'restore-test evidence');
  requireFresh(testedAt, restoreMaxMs, 'restore-test evidence');
  const source = sources.find((candidate) => (
    evidence.sourceArchive === candidate.archive
    && evidence.sourceArchiveSha256 === candidate.evidence.mongoArchiveSha256
  ));
  invariant(source && evidence.mode === 'restore-test' && evidence.sanitizedNamespace === 'menorah.*' && evidence.mediaReferencesVerified === true && evidence.uploadsArchive === source.evidence.uploadsArchive && evidence.uploadsArchiveSha256 === source.evidence.uploadsArchiveSha256 && evidence.mediaManifest === source.evidence.uploadsManifest && evidence.mediaManifestSha256 === source.evidence.uploadsManifestSha256, 'restore-test evidence is not linked to an active daily or weekly backup');
  const sanitized = verifyArtifact(evidence.sanitizedArchive, evidence.sanitizedArchiveSha256, 'sanitized restore archive');
  const metadataFile = checkedPath(evidence.sanitizedMetadataFile, root, 'file', 'sanitized restore metadata');
  invariant(sha256(metadataFile) === evidence.sanitizedMetadataSha256, 'sanitized restore metadata digest verification failed');
  const metadata = readJson(metadataFile, 'sanitized restore metadata');
  invariant(metadata.schemaVersion === 1 && metadata.artifactType === 'menorah-sanitized-restore' && metadata.sourceArtifactType === 'mongodb-full-instance-oplog' && metadata.sourceArchive === source.archive && metadata.sourceArchiveSha256 === source.evidence.mongoArchiveSha256 && metadata.sourceBackupGitSha === source.metadata.deployedReleaseSha && metadata.derivedArchive === sanitized && metadata.derivedArchiveSha256 === evidence.sanitizedArchiveSha256 && JSON.stringify(metadata.namespaceAllowlist) === JSON.stringify(['menorah.*']) && metadata.oplogReplayVerified === true && metadata.productionOplogReplayAllowed === false && metadata.encrypted === true, 'sanitized restore metadata safety contract is invalid');
  const createdAt = isoEpoch(metadata.createdAt, 'sanitized restore metadata');
  invariant(createdAt >= compactEpoch(source.evidence.timestamp, 'daily evidence') - skewMs && Math.abs(testedAt - createdAt) <= 10 * 60 * 1000, 'sanitized restore timestamps are not coherent with the daily source');
  return sanitized;
}

let root;
let epochs;
let epochRoot;

try {
  invariant(Number.isSafeInteger(minSize) && minSize > 0, 'backup minimum size is invalid');
  invariant(Number.isFinite(dailyMaxMs) && dailyMaxMs > 0 && Number.isFinite(weeklyMaxMs) && weeklyMaxMs > 0 && Number.isFinite(restoreMaxMs) && restoreMaxMs > 0, 'backup freshness configuration is invalid');
  validateEpochAuthority();
  const daily = validateSource(evidenceFromPointer('backup', 'daily'), 'daily', dailyMaxMs);
  const weekly = validateSource(evidenceFromPointer('backup', 'weekly'), 'weekly', weeklyMaxMs);
  const sanitized = validateRestore([daily, weekly]);
  process.stdout.write(`signed epoch ${epochId} backup chain OK: ${daily.archive}${sanitized ? `; sanitized restore artifact ${sanitized}` : ''}`);
} catch (error) {
  process.stderr.write(`signed epoch backup chain validation failed: ${error.message}\n`);
  process.exit(1);
}
