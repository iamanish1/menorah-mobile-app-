/**
 * reset-db.js — Deletes all documents from every collection while keeping
 *               the collections, indexes, and schema intact.
 *
 * Usage:
 *   node scripts/reset-db.js           — prompts for confirmation
 *   node scripts/reset-db.js --force   — skips prompt (CI / automation)
 *
 * WARNING: This is irreversible. All data will be permanently deleted.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const readline = require('readline');

// Import all models so Mongoose registers their schemas (needed for ensureIndexes)
require('../src/models/User');
require('../src/models/Counsellor');
require('../src/models/Booking');
require('../src/models/ChatRoom');
require('../src/models/Message');

const COLLECTIONS = ['users', 'counsellors', 'bookings', 'chatrooms', 'messages'];

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function run() {
  const force = process.argv.includes('--force');

  if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is not set in .env');
    process.exit(1);
  }

  if (!force) {
    console.log('\n⚠️  DATABASE RESET');
    console.log('─────────────────────────────────────────────────');
    console.log(`  URI  : ${process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@')}`);
    console.log(`  Collections to clear: ${COLLECTIONS.join(', ')}`);
    console.log('─────────────────────────────────────────────────');
    const answer = await confirm('\nType "yes" to confirm, anything else to cancel: ');
    if (answer !== 'yes') {
      console.log('Cancelled. No changes made.');
      process.exit(0);
    }
  }

  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  const db = mongoose.connection.db;

  // Delete all documents from each collection; collections and indexes stay intact
  for (const name of COLLECTIONS) {
    const result = await db.collection(name).deleteMany({});
    console.log(`  ✓ Cleared: ${name} (${result.deletedCount} documents removed)`);
  }

  console.log('\nDone. All collections are empty; schema and indexes are untouched.\n');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
