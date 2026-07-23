function createSecureTokenStorage(adapter) {
  let storageQueue = Promise.resolve();
  let accessBlocked = false;

  const serialize = (operation) => {
    const result = storageQueue.then(operation, operation);
    storageQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  const finishPendingClear = async () => {
    if ((await adapter.getClearPending()) !== true) return false;

    accessBlocked = true;
    await adapter.deleteSecureToken();
    await adapter.deleteClearPending();
    accessBlocked = false;
    return true;
  };

  const recoverBlockedAccess = async () => {
    if (!accessBlocked) return;
    try {
      if (await finishPendingClear()) return;

      // A prior attempt could not persist its marker. Physical deletion is the
      // only safe way to unblock this process.
      await adapter.deleteSecureToken();
      accessBlocked = false;
    } catch (error) {
      // Marker storage can itself be temporarily unavailable. Make a best-
      // effort physical deletion, but keep this process blocked until a later
      // serialized operation can prove cleanup completed.
      try {
        await adapter.deleteSecureToken();
      } catch {
        // Preserve the original failure and the fail-closed process state.
      }
      throw error;
    }
  };

  const forceSignedOutAfterFailure = async () => {
    accessBlocked = true;
    let tombstoneWritten = false;
    try {
      await adapter.setClearPending();
      tombstoneWritten = true;
    } catch {
      // Continue and attempt physical deletion of any prior credential.
    }

    let tokenDeleted = false;
    try {
      await adapter.deleteSecureToken();
      tokenDeleted = true;
    } catch {
      if (tombstoneWritten) {
        return 'pending';
      }
      return 'uncertain';
    }

    if (tokenDeleted && tombstoneWritten) {
      try {
        await adapter.deleteClearPending();
      } catch {
        return 'pending';
      }
    }

    // Keep reads blocked after every failed replacement. A later read must
    // perform another physical deletion before the process can unblock.
    return 'deleted';
  };

  const replaceSecureToken = async (token) => {
    // Block before *any* storage preflight. The durable tombstone is written
    // first, and the old Keychain item is deleted before recreation so an iOS
    // SecItemUpdate cannot preserve a legacy accessibility class.
    accessBlocked = true;
    try {
      await adapter.setClearPending();
      await adapter.deleteSecureToken();
      await adapter.writeSecureToken(token);
      await adapter.deleteClearPending();
      accessBlocked = false;
    } catch {
      const cleanup = await forceSignedOutAfterFailure();
      if (cleanup === 'pending') {
        throw new Error('Secure credential replacement cleanup is pending.');
      }
      if (cleanup === 'uncertain') {
        throw new Error('Secure credential replacement could not be guaranteed.');
      }
      throw new Error('Secure credential could not be stored.');
    }
  };

  const migrateSecureTokenPolicy = async (token) => {
    await replaceSecureToken(token);
  };

  return {
    getToken() {
      return serialize(async () => {
        if (accessBlocked) {
          try {
            await recoverBlockedAccess();
          } catch {
            // A blocked process never returns a bearer token.
          }
          return null;
        }

        try {
          if (await finishPendingClear()) return null;

          const token = await adapter.readSecureToken();
          if (!token) return null;

          await migrateSecureTokenPolicy(token);
          return token;
        } catch {
          // Unavailable local storage is never permission to return a bearer.
          accessBlocked = true;
          try {
            await adapter.deleteSecureToken();
          } catch {
            // A later serialized operation will retry while access stays blocked.
          }
          return null;
        }
      });
    },

    setToken(token) {
      return serialize(async () => {
        await replaceSecureToken(token);
      });
    },

    clearToken() {
      return serialize(async () => {
        accessBlocked = true;
        let tombstoneWritten = false;
        try {
          await adapter.setClearPending();
          tombstoneWritten = true;
        } catch {
          // A successful secure deletion does not need a tombstone.
        }

        try {
          await adapter.deleteSecureToken();
        } catch {
          if (tombstoneWritten) {
            throw new Error('Secure credential deletion is pending.');
          }
          throw new Error('Secure credential deletion could not be guaranteed.');
        }

        if (tombstoneWritten) {
          try {
            await adapter.deleteClearPending();
          } catch {
            // The credential is physically absent. The retained marker blocks
            // reads and new writes until its cleanup succeeds.
            throw new Error('Secure credential cleanup is pending.');
          }
        }
        accessBlocked = false;
      });
    },
  };
}

module.exports = { createSecureTokenStorage };
