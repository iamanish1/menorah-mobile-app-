const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const MANIFEST_SCHEMA_VERSION = 1;

const toPosixPath = (value) => value.split(path.sep).join('/');

const sha256File = (file) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(file);
  stream.on('error', reject);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolve(hash.digest('hex')));
});

const assertSafeRelativePath = (value) => {
  if (
    typeof value !== 'string'
    || !value
    || value.includes('\\')
    || value.startsWith('/')
    || value.split('/').some((segment) => (
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)
      || segment === '.'
      || segment === '..'
    ))
  ) {
    throw new Error(`Unsafe media manifest path: ${String(value)}`);
  }
};

const walkRegularFiles = async (root, relativeDirectory = '') => {
  const directory = path.join(root, relativeDirectory);
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    const absolutePath = path.join(root, relativePath);
    const stats = await fsp.lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`Media tree contains a forbidden symbolic link: ${toPosixPath(relativePath)}`);
    }
    if (stats.isDirectory()) {
      files.push(...await walkRegularFiles(root, relativePath));
      continue;
    }
    if (!stats.isFile()) {
      throw new Error(`Media tree contains a non-regular entry: ${toPosixPath(relativePath)}`);
    }
    files.push(toPosixPath(relativePath));
  }

  return files;
};

const inspectStableFile = async (root, relativePath) => {
  assertSafeRelativePath(relativePath);
  const absolutePath = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Media path escaped the root: ${relativePath}`);
  }

  const before = await fsp.lstat(absolutePath);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`Media manifest entry is not a regular file: ${relativePath}`);
  }
  const sha256 = await sha256File(absolutePath);
  const after = await fsp.lstat(absolutePath);
  if (
    before.size !== after.size
    || before.mtimeMs !== after.mtimeMs
    || (before.ino && after.ino && before.ino !== after.ino)
  ) {
    throw new Error(`Media file changed while it was being hashed: ${relativePath}`);
  }

  return {
    path: relativePath,
    sizeBytes: after.size,
    sha256,
  };
};

const entriesDigest = (entries) => crypto
  .createHash('sha256')
  .update(JSON.stringify(entries))
  .digest('hex');

const createMediaManifest = async (
  root,
  { createdAt = new Date().toISOString() } = {}
) => {
  const resolvedRoot = await fsp.realpath(root);
  const stats = await fsp.stat(resolvedRoot);
  if (!stats.isDirectory()) {
    throw new Error('Media manifest root must be a directory');
  }
  const paths = await walkRegularFiles(resolvedRoot);
  const entries = [];
  for (const relativePath of paths) {
    entries.push(await inspectStableFile(resolvedRoot, relativePath));
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    artifactType: 'menorah-immutable-media-manifest',
    rootName: 'uploads',
    createdAt,
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    entriesSha256: entriesDigest(entries),
    entries,
  };
};

const validateMediaManifest = (manifest) => {
  if (
    !manifest
    || manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION
    || manifest.artifactType !== 'menorah-immutable-media-manifest'
    || manifest.rootName !== 'uploads'
    || !Array.isArray(manifest.entries)
    || !Number.isSafeInteger(manifest.fileCount)
    || !Number.isSafeInteger(manifest.totalBytes)
    || !/^[0-9a-f]{64}$/.test(manifest.entriesSha256 || '')
  ) {
    throw new Error('Media manifest safety contract is invalid');
  }

  let previous = '';
  let totalBytes = 0;
  for (const entry of manifest.entries) {
    assertSafeRelativePath(entry.path);
    if (
      entry.path <= previous
      || !Number.isSafeInteger(entry.sizeBytes)
      || entry.sizeBytes < 0
      || !/^[0-9a-f]{64}$/.test(entry.sha256 || '')
    ) {
      throw new Error(`Media manifest entry is invalid: ${entry.path || '<unknown>'}`);
    }
    previous = entry.path;
    totalBytes += entry.sizeBytes;
  }

  if (
    manifest.fileCount !== manifest.entries.length
    || manifest.totalBytes !== totalBytes
    || manifest.entriesSha256 !== entriesDigest(manifest.entries)
  ) {
    throw new Error('Media manifest aggregate values do not match its entries');
  }
  return manifest;
};

const verifyMediaManifest = async (
  root,
  manifest,
  { allowUnexpected = false } = {}
) => {
  validateMediaManifest(manifest);
  const resolvedRoot = await fsp.realpath(root);
  const actualPaths = await walkRegularFiles(resolvedRoot);
  const expectedPaths = new Set(manifest.entries.map((entry) => entry.path));
  const unexpected = actualPaths.filter((entry) => !expectedPaths.has(entry));
  if (!allowUnexpected && unexpected.length > 0) {
    throw new Error(`Media root contains files absent from the manifest: ${unexpected[0]}`);
  }

  for (const expected of manifest.entries) {
    let actual;
    try {
      actual = await inspectStableFile(resolvedRoot, expected.path);
    } catch (error) {
      throw new Error(`Media manifest verification failed for ${expected.path}: ${error.message}`);
    }
    if (
      actual.sizeBytes !== expected.sizeBytes
      || actual.sha256 !== expected.sha256
    ) {
      throw new Error(`Media manifest verification failed for ${expected.path}: bytes differ`);
    }
  }

  return {
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    entriesSha256: manifest.entriesSha256,
    unexpectedFileCount: unexpected.length,
  };
};

module.exports = {
  MANIFEST_SCHEMA_VERSION,
  createMediaManifest,
  sha256File,
  validateMediaManifest,
  verifyMediaManifest,
};
