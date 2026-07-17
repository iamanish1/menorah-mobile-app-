const revokeAllSessions = (user, { passwordChanged = false } = {}) => {
  const revokedAt = new Date();
  user.sessionVersion = (user.sessionVersion || 0) + 1;
  user.lastSessionRevokedAt = revokedAt;
  if (passwordChanged) user.lastPasswordChangeAt = revokedAt;
  return revokedAt;
};

module.exports = {
  revokeAllSessions,
};
