/**
 * Dry-run audit for legacy counsellor approvals that may have converted an
 * existing patient account into a counsellor account.
 *
 * Default behaviour is read-only. It identifies approved counsellors whose
 * linked User predates the approval by more than a small clock tolerance—the
 * characteristic left by the legacy reuse/overwrite approval path. The broad
 * default intentionally favors review over silently missing a takeover.
 *
 * Usage:
 *   npm run audit:unsafe-counsellor-approvals
 *   npm run audit:unsafe-counsellor-approvals -- --minimum-age-minutes=60
 *   npm run audit:unsafe-counsellor-approvals -- --quarantine-candidate-ids=<counsellorId,...> --confirm-quarantine
 *
 * Quarantine rotates to an unrecoverable random password, deactivates the
 * account, revokes every session, and takes the counsellor profile out of
 * availability. It intentionally does not send a reset email: a support/admin
 * operator must verify the real person's identity first, then initiate the
 * canonical reset flow for that verified person.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Counsellor = require('../src/models/Counsellor');
const User = require('../src/models/User');
const { recordSecurityEvent } = require('../src/utils/securityAudit');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/menorah';
const DEFAULT_CLOCK_TOLERANCE_MINUTES = 5;

const argumentValue = (name) => {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : '';
};

const getMinimumAgeMinutes = () => {
  const suppliedMinutes = argumentValue('minimum-age-minutes');
  const suppliedHours = argumentValue('minimum-age-hours');
  if (!suppliedMinutes && !suppliedHours) return DEFAULT_CLOCK_TOLERANCE_MINUTES;
  const supplied = suppliedMinutes || suppliedHours;
  const value = Number(supplied);
  const minutes = suppliedMinutes ? value : value * 60;
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 60 * 24 * 3650) {
    throw new Error('--minimum-age-minutes must be a number between 0 and 5256000');
  }
  return minutes;
};

const requestedQuarantines = () => new Set(
  argumentValue('quarantine-candidate-ids')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const isQuarantineConfirmed = () => process.argv.includes('--confirm-quarantine');

const getCandidates = async (minimumAgeMinutes) => {
  const counsellors = await Counsellor.find({
    status: 'approved',
    approvedAt: { $type: 'date' },
  })
    .select('_id user approvedAt licenseNumber')
    .populate('user', '_id createdAt role isActive sessionVersion')
    .lean();

  const minimumAgeMs = minimumAgeMinutes * 60 * 1000;
  return counsellors
    .filter((counsellor) => counsellor.user?.createdAt && counsellor.approvedAt)
    .map((counsellor) => {
      const accountAgeMs = new Date(counsellor.approvedAt) - new Date(counsellor.user.createdAt);
      return {
        counsellorId: counsellor._id.toString(),
        userId: counsellor.user._id.toString(),
        approvedAt: new Date(counsellor.approvedAt).toISOString(),
        userCreatedAt: new Date(counsellor.user.createdAt).toISOString(),
        accountAgeMs,
        accountAgeMinutes: Math.floor(accountAgeMs / (60 * 1000)),
        currentRole: counsellor.user.role,
        isActive: Boolean(counsellor.user.isActive),
      };
    })
    .filter((candidate) => candidate.accountAgeMs >= minimumAgeMs)
    .sort((left, right) => right.accountAgeMinutes - left.accountAgeMinutes);
};

const printCandidates = (candidates, minimumAgeMinutes) => {
  console.log(`Found ${candidates.length} candidate(s) with a User account at least ${minimumAgeMinutes} minute(s) older than approval.`);
  if (!candidates.length) return;

  console.table(candidates.map((candidate) => ({
    counsellorId: candidate.counsellorId,
    userId: candidate.userId,
    accountAgeMinutes: candidate.accountAgeMinutes,
    currentRole: candidate.currentRole,
    isActive: candidate.isActive,
    approvedAt: candidate.approvedAt,
  })));
  console.log('Dry-run only. Verify identity with the affected person before any credential recovery or password reset.');
};

const quarantineReviewedCandidates = async (candidates, requestedIds) => {
  if (!requestedIds.size) return;
  if (!isQuarantineConfirmed()) {
    throw new Error('Refusing to quarantine accounts without --confirm-quarantine');
  }

  const candidateByCounsellorId = new Map(candidates.map((candidate) => [candidate.counsellorId, candidate]));
  const unknownIds = [...requestedIds].filter((id) => !candidateByCounsellorId.has(id));
  if (unknownIds.length) {
    throw new Error(`Refusing to quarantine non-candidate counsellor IDs: ${unknownIds.join(', ')}`);
  }

  const selectedCandidates = [...requestedIds].map((id) => candidateByCounsellorId.get(id));
  const users = selectedCandidates.map((candidate) => candidate.userId);
  const revokedAt = new Date();
  // Update directly (rather than through a Mongoose document), so hash the
  // random replacement explicitly. Its plaintext is deliberately discarded.
  const quarantinePassword = crypto.randomBytes(48).toString('base64url');
  const passwordHash = await bcrypt.hash(quarantinePassword, parseInt(process.env.BCRYPT_ROUNDS, 10) || 12);
  const userResult = await User.updateMany(
    { _id: { $in: users } },
    {
      $inc: { sessionVersion: 1 },
      $set: {
        password: passwordHash,
        isActive: false,
        lastSessionRevokedAt: revokedAt,
      },
    }
  );
  const counsellorResult = await Counsellor.updateMany(
    { _id: { $in: selectedCandidates.map((candidate) => candidate.counsellorId) } },
    {
      $set: {
        isActive: false,
        isAvailable: false,
        blockedAt: revokedAt,
        blockedReason: 'Legacy approval identity review',
      },
    }
  );
  selectedCandidates.forEach((candidate) => {
    recordSecurityEvent('unsafe_counsellor_approval_quarantined', {
      user: { _id: candidate.userId, role: candidate.currentRole },
      details: { action: 'legacy_approval_quarantine', targetId: candidate.counsellorId },
    });
  });
  console.log(`Quarantined ${userResult.modifiedCount} user account(s) and ${counsellorResult.modifiedCount} counsellor profile(s). Passwords were rotated without disclosure; no reset email was sent. Verify identity through support before initiating canonical recovery.`);
};

async function main() {
  const minimumAgeMinutes = getMinimumAgeMinutes();
  const requestedIds = requestedQuarantines();

  await mongoose.connect(MONGO_URI);
  try {
    const candidates = await getCandidates(minimumAgeMinutes);
    printCandidates(candidates, minimumAgeMinutes);
    await quarantineReviewedCandidates(candidates, requestedIds);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Unsafe counsellor approval audit failed:', error.message);
    mongoose.disconnect().finally(() => process.exit(1));
  });
}

module.exports = {
  DEFAULT_CLOCK_TOLERANCE_MINUTES,
  getCandidates,
  getMinimumAgeMinutes,
  requestedQuarantines,
  quarantineReviewedCandidates,
};
