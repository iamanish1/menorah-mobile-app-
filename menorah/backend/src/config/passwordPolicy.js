const PASSWORD_STRENGTH_OPTIONS = Object.freeze({
  minLength: 8,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 0,
});

const PASSWORD_STRENGTH_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, and a number';

module.exports = {
  PASSWORD_STRENGTH_MESSAGE,
  PASSWORD_STRENGTH_OPTIONS,
};
