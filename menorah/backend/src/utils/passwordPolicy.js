const PASSWORD_POLICY_MESSAGE = 'Password must be at least 8 characters and include uppercase, lowercase, and a number';

const isStrongPassword = (value) => {
  const password = String(value || '');
  return password.length >= 8
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
  PASSWORD_POLICY_MESSAGE,
  isStrongPassword,
  passwordValidator,
};
