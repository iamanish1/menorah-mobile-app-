const revokeAllSessions = (user, { passwordChanged = false } = {}) => {
  const revokedAt = new Date();
  user.sessionVersion = (user.sessionVersion || 0) + 1;
  user.lastSessionRevokedAt = revokedAt;
  if (passwordChanged) user.lastPasswordChangeAt = revokedAt;
  return revokedAt;
};

/**
 * Disconnect every realtime socket authenticated as this user. Socket.IO's
 * Redis adapter fan-outs `disconnectSockets` to peer API processes, so this
 * also closes sessions held by a different worker.
 */
const disconnectUserSockets = (io, userId, reason = 'session_revoked') => {
  const id = userId?._id?.toString?.() || userId?.toString?.();
  if (!io || !id) return false;

  try {
    io.to(`user_${id}`).emit('session_revoked', { reason });
    io.in(`user_${id}`).disconnectSockets(true);
    return true;
  } catch (error) {
    console.error('Socket session revocation error:', error.message);
    return false;
  }
};

module.exports = {
  revokeAllSessions,
  disconnectUserSockets,
};
