const crypto = require('crypto');

const getEncryptionKey = () => {
  const raw = String(process.env.DATA_ENCRYPTION_KEY || '').trim();
  if (raw.length < 32 || raw.startsWith('REPLACE_')) {
    throw new Error('DATA_ENCRYPTION_KEY must contain at least 32 non-placeholder characters');
  }
  return crypto.createHash('sha256').update(raw).digest();
};

const encryptBankAccountNumber = (accountNumber) => {
  const normalized = String(accountNumber || '').trim();
  if (!normalized) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
};

const decryptBankAccountNumber = (encryptedValue) => {
  const [version, ivRaw, tagRaw, ciphertextRaw] = String(encryptedValue || '').split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Stored bank account number is invalid');
  }

  const iv = Buffer.from(ivRaw, 'base64');
  const tag = Buffer.from(tagRaw, 'base64');
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Stored bank account number is invalid');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const ciphertext = Buffer.from(ciphertextRaw, 'base64');
  if (!ciphertext.length) {
    throw new Error('Stored bank account number is invalid');
  }
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
};

const getMaskedBankAccountNumber = (bankDetails = {}) => {
  const last4 = String(bankDetails.accountNumberLast4 || '').trim();
  return last4 ? `****${last4}` : null;
};

module.exports = {
  decryptBankAccountNumber,
  encryptBankAccountNumber,
  getMaskedBankAccountNumber,
};
