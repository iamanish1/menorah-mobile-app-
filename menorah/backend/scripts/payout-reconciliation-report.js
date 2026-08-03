require('dotenv').config();
const mongoose = require('mongoose');
const { buildMongooseOptions } = require('../src/config/database');
const Payout = require('../src/models/Payout');
const PayoutWebhookEvent = require('../src/models/PayoutWebhookEvent');
const {
  MAX_REPORT_ROWS,
  buildPayoutReconciliationReport,
} = require('../src/services/payoutReconciliationReport');

const CURSOR_FLAGS = Object.freeze({
  '--webhook-events-after-id': 'webhookEvents',
  '--payouts-after-id': 'payouts',
});
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const parseLimit = (rawValue) => {
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_REPORT_ROWS) {
    throw new Error(`--limit must be an integer from 1 to ${MAX_REPORT_ROWS}`);
  }
  return value;
};

const parseObjectId = (flag, rawValue) => {
  if (!OBJECT_ID_PATTERN.test(rawValue)) {
    throw new Error(`${flag} must be exactly 24 hexadecimal characters`);
  }
  return new mongoose.Types.ObjectId(rawValue);
};

const parseArguments = (argv) => {
  const parsed = { limit: 100, cursors: {} };
  const seenFlags = new Set();

  for (const argument of argv) {
    const separatorIndex = argument.indexOf('=');
    const flag = separatorIndex === -1
      ? argument
      : argument.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1
      ? ''
      : argument.slice(separatorIndex + 1);

    if (flag !== '--limit' && !Object.hasOwn(CURSOR_FLAGS, flag)) {
      throw new Error(`Unknown report argument: ${flag}`);
    }
    if (seenFlags.has(flag)) {
      throw new Error(`${flag} may only be provided once`);
    }
    seenFlags.add(flag);

    if (flag === '--limit') {
      parsed.limit = parseLimit(rawValue);
    } else {
      parsed.cursors[CURSOR_FLAGS[flag]] = parseObjectId(flag, rawValue);
    }
  }
  return parsed;
};

const run = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required; use an approved read-only credential');
  }
  const { limit, cursors } = parseArguments(process.argv.slice(2));
  await mongoose.connect(process.env.MONGODB_URI, {
    ...buildMongooseOptions(process.env.MONGODB_URI),
    maxPoolSize: 2,
    readPreference: 'secondaryPreferred',
    readConcernLevel: 'majority',
    autoCreate: false,
    autoIndex: false,
  });
  const report = await buildPayoutReconciliationReport({
    PayoutModel: Payout,
    PayoutWebhookEventModel: PayoutWebhookEvent,
    limit,
    cursors,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

if (require.main === module) {
  run()
    .catch((error) => {
      process.stderr.write(`Payout reconciliation report failed: ${error.message}\n`);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
}

module.exports = {
  CURSOR_FLAGS,
  parseArguments,
  run,
};
