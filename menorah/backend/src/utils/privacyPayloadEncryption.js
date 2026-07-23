const crypto = require('crypto');

const getEncryptionKey = () => {
  const raw = String(process.env.DATA_ENCRYPTION_KEY || '').trim();
  if (raw.length < 32 || /^REPLACE/i.test(raw)) {
    const error = new Error('Privacy request encryption is not configured');
    error.code = 'PRIVACY_ENCRYPTION_NOT_CONFIGURED';
    throw error;
  }
  return crypto
    .createHash('sha256')
    .update('menorah:privacy-request-payload:v1\0')
    .update(raw)
    .digest();
};

const normalizeContext = (context) => {
  const normalized = String(context || '').trim();
  if (!/^[a-zA-Z0-9:_-]{1,256}$/.test(normalized)) {
    const error = new Error('Privacy payload encryption context is invalid');
    error.code = 'PRIVACY_ENCRYPTION_CONTEXT_INVALID';
    throw error;
  }
  return normalized;
};

const encryptPrivacyPayload = (payload, { context }) => {
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, 'utf8') > 16 * 1024) {
    const error = new Error('Privacy request payload is too large');
    error.code = 'PRIVACY_PAYLOAD_TOO_LARGE';
    throw error;
  }

  const aad = normalizeContext(context);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv, {
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

const decryptPrivacyPayload = (encryptedValue, { context }) => {
  const [version, ivRaw, tagRaw, ciphertextRaw] = String(encryptedValue || '').split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
    const error = new Error('Stored privacy request payload is invalid');
    error.code = 'PRIVACY_PAYLOAD_INVALID';
    throw error;
  }

  const iv = Buffer.from(ivRaw, 'base64');
  const tag = Buffer.from(tagRaw, 'base64');
  const ciphertext = Buffer.from(ciphertextRaw, 'base64');
  if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) {
    const error = new Error('Stored privacy request payload is invalid');
    error.code = 'PRIVACY_PAYLOAD_INVALID';
    throw error;
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv, {
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
    const error = new Error('Stored privacy request payload failed authentication');
    error.code = 'PRIVACY_PAYLOAD_INVALID';
    throw error;
  }
};

module.exports = {
  decryptPrivacyPayload,
  encryptPrivacyPayload,
};
