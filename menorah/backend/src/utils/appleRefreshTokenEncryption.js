const crypto = require('crypto');

const getEncryptionKey = () => {
  const raw = String(process.env.DATA_ENCRYPTION_KEY || '').trim();
  if (raw.length < 32 || /^replace/i.test(raw)) {
    throw new Error('Apple refresh-token encryption is not configured');
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
};

const getContext = ({ userId, clientId }) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedClientId = String(clientId || '').trim();
  if (!normalizedUserId || !normalizedClientId) {
    throw new Error('Apple refresh-token encryption context is invalid');
  }
  return Buffer.from(`menorah:apple-refresh:v1:${normalizedUserId}:${normalizedClientId}`, 'utf8');
};

const encryptAppleRefreshToken = (token, context) => {
  const normalized = String(token || '').trim();
  if (!normalized) throw new Error('Apple refresh token is empty');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv, {
    authTagLength: 16,
  });
  cipher.setAAD(getContext(context));
  const ciphertext = Buffer.concat([
    cipher.update(normalized, 'utf8'),
    cipher.final(),
  ]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
};

const decryptAppleRefreshToken = (encryptedValue, context) => {
  const [version, ivRaw, tagRaw, ciphertextRaw] = String(encryptedValue || '').split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Apple refresh-token envelope is invalid');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivRaw, 'base64'),
    { authTagLength: 16 }
  );
  decipher.setAAD(getContext(context));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

module.exports = {
  decryptAppleRefreshToken,
  encryptAppleRefreshToken,
};
