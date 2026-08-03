const crypto = require('crypto');

const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

// Atomically verify a JSON-backed OTP challenge, increment failures, and
// consume a successful challenge. Returning the original JSON only on success
// lets the caller finish its database action without a TOCTOU window.
const CONSUME_OTP_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {0, ''} end
local value = cjson.decode(raw)
local attempts = tonumber(value.attempts or 0)
local maxAttempts = tonumber(ARGV[2])
if attempts >= maxAttempts then
  redis.call('DEL', KEYS[1])
  return {2, ''}
end
if value.otp == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return {1, raw}
end
attempts = attempts + 1
if attempts >= maxAttempts then
  redis.call('DEL', KEYS[1])
  return {3, ''}
end
value.attempts = attempts
local ttl = redis.call('TTL', KEYS[1])
if ttl > 0 then redis.call('SETEX', KEYS[1], ttl, cjson.encode(value)) end
return {4, tostring(maxAttempts - attempts)}
`;

const REPLACE_OTP_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local value = cjson.decode(raw)
value.otp = ARGV[1]
value.attempts = 0
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then return 0 end
redis.call('SETEX', KEYS[1], ttl, cjson.encode(value))
return 1
`;

const consumeOtp = async (redis, key, otp, maxAttempts) => {
  const result = await redis.eval(CONSUME_OTP_SCRIPT, {
    keys: [key],
    arguments: [hashOtp(otp), String(maxAttempts)],
  });
  const status = Number(Array.isArray(result) ? result[0] : result);
  const raw = Array.isArray(result) ? result[1] : '';
  let value = null;
  if (status === 1 && raw) {
    try { value = JSON.parse(raw); } catch { value = null; }
  }
  return {
    status,
    value,
    remaining: status === 4 ? Number(raw) : 0,
  };
};

const replaceOtp = async (redis, key, otp) => Number(await redis.eval(REPLACE_OTP_SCRIPT, {
  keys: [key],
  arguments: [hashOtp(otp)],
})) === 1;

module.exports = {
  hashOtp,
  consumeOtp,
  replaceOtp,
};
