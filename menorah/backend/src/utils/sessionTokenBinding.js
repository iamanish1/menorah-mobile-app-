const resolveId = (value) => {
  const candidate = value?._id || value?.id || value;
  return candidate?.toString?.() || '';
};

const isCurrentSessionToken = (decoded, account) => (
  Boolean(decoded && account)
  && resolveId(decoded.userId) === resolveId(account)
  && decoded.role === account.role
  && Number.isSafeInteger(decoded.sessionVersion)
  && decoded.sessionVersion >= 0
  && Number.isSafeInteger(account.sessionVersion)
  && account.sessionVersion >= 0
  && decoded.sessionVersion === account.sessionVersion
);

module.exports = {
  isCurrentSessionToken,
};
