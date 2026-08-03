const crypto = require('crypto');

const ADMIN_MFA_TTL_SECONDS = 10 * 60;
const MAX_ADMIN_MFA_ATTEMPTS = 5;

const adminMfaKey = (challengeId) => `pending:admin-mfa:${challengeId}`;

const hashAdminMfaOtp = (otp) =>
  crypto.createHash('sha256').update(otp).digest('hex');

// Verification, attempt accounting, and successful consumption must be one
// Redis operation. Redis executes Lua scripts atomically, so parallel requests
// cannot overwrite each other's counters or redeem the same challenge twice.
const CONSUME_ADMIN_MFA_CHALLENGE_SCRIPT = `
local key = KEYS[1]
local submitted_hash = ARGV[1]
local max_attempts = tonumber(ARGV[2])
local max_ttl_ms = tonumber(ARGV[3])

if not max_attempts or max_attempts < 1 or
   not max_ttl_ms or max_ttl_ms < 1 then
  return {0}
end

local raw = redis.call('GET', key)
if not raw then
  return {0}
end

local decode_ok, challenge = pcall(cjson.decode, raw)
if not decode_ok or type(challenge) ~= 'table' or
   type(challenge.userId) ~= 'string' or challenge.userId == '' or
   type(challenge.otp) ~= 'string' or challenge.otp == '' then
  redis.call('DEL', key)
  return {0}
end

local attempts = tonumber(challenge.attempts)
if not attempts or attempts < 0 or attempts ~= math.floor(attempts) or
   attempts >= max_attempts then
  redis.call('DEL', key)
  return {0}
end

local remaining_ttl_ms = redis.call('PTTL', key)
if remaining_ttl_ms <= 0 then
  redis.call('DEL', key)
  return {0}
end

if challenge.otp == submitted_hash then
  redis.call('DEL', key)
  return {1, challenge.userId}
end

attempts = attempts + 1
if attempts >= max_attempts then
  redis.call('DEL', key)
  return {0}
end

challenge.attempts = attempts
redis.call(
  'SET',
  key,
  cjson.encode(challenge),
  'PX',
  math.min(remaining_ttl_ms, max_ttl_ms)
)
return {0}
`;

const createAdminMfaChallengeRecord = async ({
  redis,
  challengeId,
  userId,
  otp,
}) => {
  await redis.setEx(
    adminMfaKey(challengeId),
    ADMIN_MFA_TTL_SECONDS,
    JSON.stringify({
      userId,
      otp: hashAdminMfaOtp(otp),
      attempts: 0,
    })
  );
};

const consumeAdminMfaChallenge = async ({
  redis,
  challengeId,
  otp,
}) => {
  const result = await redis.eval(CONSUME_ADMIN_MFA_CHALLENGE_SCRIPT, {
    keys: [adminMfaKey(challengeId)],
    arguments: [
      hashAdminMfaOtp(otp),
      String(MAX_ADMIN_MFA_ATTEMPTS),
      String(ADMIN_MFA_TTL_SECONDS * 1000),
    ],
  });

  if (!Array.isArray(result) || Number(result[0]) !== 1) {
    return null;
  }

  const userId = result[1];
  return typeof userId === 'string' && userId ? { userId } : null;
};

module.exports = {
  ADMIN_MFA_TTL_SECONDS,
  MAX_ADMIN_MFA_ATTEMPTS,
  adminMfaKey,
  createAdminMfaChallengeRecord,
  consumeAdminMfaChallenge,
};
