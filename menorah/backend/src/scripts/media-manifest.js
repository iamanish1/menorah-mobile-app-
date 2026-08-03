#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const {
  createMediaManifest,
  verifyMediaManifest,
} = require('../services/mediaManifest');

const parseArgs = (argv) => {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Usage: media-manifest.js <create|verify> --root <path> --manifest <path>');
    }
    values[key.slice(2)] = value;
  }
  return { command, values };
};

const main = async () => {
  const { command, values } = parseArgs(process.argv.slice(2));
  const root = path.resolve(values.root || '');
  const manifestFile = path.resolve(values.manifest || '');
  if (!values.root || !values.manifest) {
    throw new Error('Both --root and --manifest are required');
  }

  if (command === 'create') {
    const manifest = await createMediaManifest(root);
    const temporary = `${manifestFile}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await fs.rename(temporary, manifestFile);
    process.stdout.write(
      `${JSON.stringify({
        fileCount: manifest.fileCount,
        totalBytes: manifest.totalBytes,
        entriesSha256: manifest.entriesSha256,
      })}\n`
    );
    return;
  }

  if (command === 'verify') {
    const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
    const result = await verifyMediaManifest(root, manifest);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  throw new Error('Command must be create or verify');
};

main().catch((error) => {
  process.stderr.write(`Media manifest error: ${error.message}\n`);
  process.exitCode = 1;
});
