const crypto = require('crypto');

const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;
const SIGNATURE_PATTERN = /^v1,([A-Za-z0-9+/]+={0,2})$/;
const SVIX_ID_PATTERN = /^msg_[A-Za-z0-9_-]{8,128}$/;

const singleHeader = (value) => {
  if (Array.isArray(value) || typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const decodeSigningSecret = (secret) => {
  const normalized = String(secret || '').trim();
  if (!normalized.startsWith('whsec_')) {
    throw new Error('Resend webhook signing secret is invalid');
  }
  const decoded = Buffer.from(normalized.slice('whsec_'.length), 'base64');
  if (decoded.length < 16) throw new Error('Resend webhook signing secret is invalid');
  return decoded;
};

const timingSafeBase64Equal = (left, right) => {
  try {
    const leftBytes = Buffer.from(left, 'base64');
    const rightBytes = Buffer.from(right, 'base64');
    return leftBytes.length === rightBytes.length
      && crypto.timingSafeEqual(leftBytes, rightBytes);
  } catch {
    return false;
  }
};

const verifyResendWebhook = ({
  rawBody,
  id,
  timestamp,
  signature,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
}) => {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    throw new Error('A raw Resend webhook body is required');
  }
  const normalizedId = singleHeader(id);
  const normalizedTimestamp = singleHeader(timestamp);
  const normalizedSignature = singleHeader(signature);
  if (!SVIX_ID_PATTERN.test(normalizedId || '')) {
    throw new Error('Resend webhook identity is invalid');
  }
  if (!/^\d{10}$/.test(normalizedTimestamp || '')) {
    throw new Error('Resend webhook timestamp is invalid');
  }
  const timestampSeconds = Number(normalizedTimestamp);
  if (
    !Number.isSafeInteger(timestampSeconds)
    || Math.abs(nowSeconds - timestampSeconds) > MAX_TIMESTAMP_SKEW_SECONDS
  ) {
    throw new Error('Resend webhook timestamp is outside the accepted window');
  }

  const expected = crypto
    .createHmac('sha256', decodeSigningSecret(secret))
    .update(`${normalizedId}.${normalizedTimestamp}.${rawBody.toString('utf8')}`)
    .digest('base64');
  const signatures = (normalizedSignature || '')
    .split(/\s+/)
    .map((candidate) => candidate.match(SIGNATURE_PATTERN)?.[1])
    .filter(Boolean);
  if (!signatures.some((candidate) => timingSafeBase64Equal(candidate, expected))) {
    throw new Error('Resend webhook signature is invalid');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new Error('Resend webhook payload is invalid');
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('Resend webhook payload is invalid');
  }
  return { event, id: normalizedId };
};

const getResendDeliveryOutcome = (eventType) => ({
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delayed',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
}[eventType] || (String(eventType || '').startsWith('email.') ? 'other' : null));

const getResendReplayKey = (eventId) =>
  `email:webhook:${crypto.createHash('sha256').update(eventId).digest('hex')}`;

module.exports = {
  MAX_TIMESTAMP_SKEW_SECONDS,
  getResendDeliveryOutcome,
  getResendReplayKey,
  verifyResendWebhook,
};
