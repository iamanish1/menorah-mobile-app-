#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const {
  verifyMediaReferences,
} = require('../services/mediaReferenceVerifier');

const parseArgs = (argv) => {
  const result = {
    requireLocalManaged: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--require-local-managed') {
      result.requireLocalManaged = true;
      continue;
    }
    if (!argument.startsWith('--') || argv[index + 1] === undefined) {
      throw new Error(
        'Usage: verify-media-references.js --mongo-uri <uri> --root <uploads> --manifest <json> [--output <json>] [--require-local-managed]'
      );
    }
    result[argument.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
};

const readCollection = async (database, name, projection) => {
  const existing = await database.listCollections({ name }, { nameOnly: true }).hasNext();
  if (!existing) return [];
  return database.collection(name).find({}, { projection }).toArray();
};

const loadDocuments = async (database) => ({
  users: await readCollection(database, 'users', {
    profileImage: 1,
    profileImageStorage: 1,
  }),
  counsellors: await readCollection(database, 'counsellors', {
    profileImage: 1,
    profileImageStorage: 1,
    voiceIntroUrl: 1,
    voiceIntroStorage: 1,
    gallery: 1,
    verificationDocuments: 1,
  }),
  brandAssets: await readCollection(database, 'brandassets', {
    url: 1,
    storage: 1,
  }),
  socialPosts: await readCollection(database, 'socialposts', {
    imageUrl: 1,
    sourceImageStorage: 1,
    finalImageUrl: 1,
    finalImageStorage: 1,
    thumbnailUrl: 1,
    thumbnailStorage: 1,
  }),
  articles: await readCollection(database, 'articles', {
    coverImageUrl: 1,
    coverImageStorage: 1,
    contentBlocks: 1,
  }),
  messages: await readCollection(database, 'messages', {
    attachment: 1,
  }),
  pendingApplications: await readCollection(database, 'pendingapplications', {
    credentialEvidence: 1,
  }),
  bookings: await readCollection(database, 'bookings', {
    'videoCall.recordingUrl': 1,
  }),
});

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const mongoUri = args['mongo-uri'] || process.env.MEDIA_VERIFY_MONGODB_URI;
  if (!mongoUri || !args.root || !args.manifest) {
    throw new Error(
      'MEDIA_VERIFY_MONGODB_URI (or --mongo-uri), --root, and --manifest are required'
    );
  }
  const root = path.resolve(args.root);
  const manifest = JSON.parse(await fs.readFile(path.resolve(args.manifest), 'utf8'));

  const connection = await mongoose.createConnection(mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  }).asPromise();
  let report;
  try {
    report = await verifyMediaReferences({
      root,
      manifest,
      documents: await loadDocuments(
        connection.client.db(args.database || process.env.MEDIA_VERIFY_DATABASE || 'menorah')
      ),
      requireLocalManaged: args.requireLocalManaged,
    });
  } finally {
    await connection.close();
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) {
    const output = path.resolve(args.output);
    const temporary = `${output}.${process.pid}.tmp`;
    await fs.writeFile(temporary, serialized, { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, output);
  }
  process.stdout.write(serialized);
  if (!report.valid) process.exitCode = 1;
};

main().catch((error) => {
  process.stderr.write(`Media reference verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
