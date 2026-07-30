const MAX_PASSWORD_BYTES = 72;
const PASSWORD_POLICY_MESSAGE = 'Password must be at least 8 characters, no more than 72 UTF-8 bytes, and include uppercase, lowercase, and a number';

const isStrongPassword = (value) => {
  const password = String(value || '');
  return password.length >= 8
    && Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password);
};

const passwordValidator = (value) => {
  if (!isStrongPassword(value)) {
    throw new Error(PASSWORD_POLICY_MESSAGE);
  }
  return true;
};

module.exports = {
  MAX_PASSWORD_BYTES,
  PASSWORD_POLICY_MESSAGE,
  isStrongPassword,
  passwordValidator,
};
