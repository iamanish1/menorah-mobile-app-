const crypto = require('crypto');

const getRootKey = () => {
  const raw = String(process.env.DATA_ENCRYPTION_KEY || '').trim();
  if (raw.length < 32 || /^REPLACE/i.test(raw)) {
    const error = new Error('Assessment data protection is not configured');
    error.code = 'ASSESSMENT_DATA_PROTECTION_UNAVAILABLE';
    error.statusCode = 503;
    throw error;
  }
  return raw;
};

const deriveKey = (purpose) => crypto
  .createHash('sha256')
  .update(`menorah:psychometric-assessment:${purpose}:v1\0`)
  .update(getRootKey())
  .digest();

const normalizeContext = (context) => {
  const normalized = String(context || '').trim();
  if (!/^[a-zA-Z0-9:_-]{1,256}$/.test(normalized)) {
    const error = new Error('Assessment encryption context is invalid');
    error.code = 'ASSESSMENT_DATA_INVALID';
    error.statusCode = 500;
    throw error;
  }
  return normalized;
};

const encryptAssessmentAnswers = (answers, { context }) => {
  const serialized = JSON.stringify(answers);
  if (Buffer.byteLength(serialized, 'utf8') > 4096) {
    const error = new Error('Assessment answer payload is invalid');
    error.code = 'ASSESSMENT_DATA_INVALID';
    error.statusCode = 400;
    throw error;
  }

  const aad = normalizeContext(context);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('answers'), iv, {
    authTagLength: 16,
  });
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(serialized, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
};

const decryptAssessmentAnswers = (encryptedValue, { context }) => {
  const [version, ivRaw, tagRaw, ciphertextRaw] = String(encryptedValue || '').split(':');
  const iv = Buffer.from(ivRaw || '', 'base64');
  const tag = Buffer.from(tagRaw || '', 'base64');
  const ciphertext = Buffer.from(ciphertextRaw || '', 'base64');
  if (version !== 'v1' || iv.length !== 12 || tag.length !== 16 || !ciphertext.length) {
    const error = new Error('Stored assessment answers are invalid');
    error.code = 'ASSESSMENT_DATA_INVALID';
    throw error;
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('answers'), iv, {
    authTagLength: 16,
  });
  decipher.setAAD(Buffer.from(normalizeContext(context), 'utf8'));
  decipher.setAuthTag(tag);
  try {
    return JSON.parse(Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8'));
  } catch {
    const error = new Error('Stored assessment answers failed authentication');
    error.code = 'ASSESSMENT_DATA_INVALID';
    throw error;
  }
};

const hashAssessmentIdempotencyKey = ({ userId, idempotencyKey }) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedKey = String(idempotencyKey || '').trim();
  if (
    !/^[a-zA-Z0-9_-]{1,128}$/.test(normalizedUserId)
    || !/^[a-zA-Z0-9._:-]{16,128}$/.test(normalizedKey)
  ) {
    const error = new Error('A valid Idempotency-Key is required');
    error.code = 'ASSESSMENT_IDEMPOTENCY_REQUIRED';
    error.statusCode = 400;
    throw error;
  }
  return crypto
    .createHmac('sha256', deriveKey('idempotency'))
    .update(`${normalizedUserId}\0${normalizedKey}`)
    .digest('hex');
};

const fingerprintAssessmentPayload = (payload) => crypto
  .createHmac('sha256', deriveKey('request-fingerprint'))
  .update(JSON.stringify(payload))
  .digest('hex');

module.exports = {
  decryptAssessmentAnswers,
  encryptAssessmentAnswers,
  fingerprintAssessmentPayload,
  hashAssessmentIdempotencyKey,
};
