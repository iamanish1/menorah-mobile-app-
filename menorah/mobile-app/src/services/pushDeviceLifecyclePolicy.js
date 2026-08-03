'use strict';

const DEFAULT_MAX_PENDING_DETACHMENTS = 8;

const sameRegistration = (left, right) => Boolean(
  left
  && right
  && left.expoPushToken === right.expoPushToken
  && (left.userId || null) === (right.userId || null)
);

const sameDetachment = (left, right) => Boolean(
  sameRegistration(left, right)
  && left.authToken === right.authToken
);

const addPendingDetachment = (pending, detachment, maxPending) => {
  const remaining = pending.filter(candidate => !sameDetachment(candidate, detachment));
  if (remaining.length >= maxPending) {
    // Dropping the oldest item would discard the only bearer/token pair able
    // to detach that device. Refuse the transition instead.
    throw new Error('Pending push-detachment capacity reached.');
  }
  return [detachment, ...remaining];
};

const removePendingDetachment = (pending, detachment) =>
  pending.filter(candidate => !sameDetachment(candidate, detachment));

/**
 * Coordinates remote push registration with durable local state.
 *
 * The adapter keeps platform/network details outside this policy. Every
 * lifecycle mutation is serialized so logout cannot race an in-flight token
 * registration and leave a device attached to the account that just signed
 * out.
 */
function createPushDeviceLifecycle(adapter, options = {}) {
  const maxPending = options.maxPending || DEFAULT_MAX_PENDING_DETACHMENTS;
  let operationTail = Promise.resolve();
  let accountTransitionInProgress = false;

  const serialize = (operation) => {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(() => undefined, () => undefined);
    return result;
  };

  const persistPending = async (pending) => {
    await adapter.writePendingDetachments(pending.slice(0, maxPending));
  };

  const queueDetachment = async (
    registration,
    authToken,
    logoutAfterDetach,
    claimBeforeDetach = false,
  ) => {
    const detachment = {
      expoPushToken: registration.expoPushToken,
      userId: registration.userId || null,
      authToken,
      logoutAfterDetach,
      claimBeforeDetach,
    };
    const pending = await adapter.readPendingDetachments();
    await persistPending(addPendingDetachment(pending, detachment, maxPending));
    return detachment;
  };

  const removeDurableDetachment = async (detachment) => {
    const pending = await adapter.readPendingDetachments();
    await persistPending(removePendingDetachment(pending, detachment));
  };

  const registrationHasDurableDetachment = async (registration) => {
    const pending = await adapter.readPendingDetachments();
    return pending.some(detachment => (
      detachment.expoPushToken === registration.expoPushToken
      && (!registration.userId || detachment.userId === registration.userId)
    ));
  };

  const deleteDetachedRegistration = async (registration) => {
    try {
      await adapter.deleteRegistrationIfMatches(registration);
    } catch (error) {
      // Remote detachment already succeeded. Retaining this local record is
      // safe and lets a later reconciliation clean it up idempotently.
      adapter.reportError('push.registration_cleanup_pending', error);
    }
  };

  return {
    beginAccountTransition() {
      accountTransitionInProgress = true;
      return serialize(async () => undefined);
    },

    endAccountTransition() {
      accountTransitionInProgress = false;
    },

    async registerCurrent(registration, authToken) {
      if (accountTransitionInProgress) {
        return { enabled: false, reason: 'account_transition' };
      }

      return serialize(async () => {
        const activeAuthToken = await adapter.getCurrentAuthToken();
        if (!authToken || activeAuthToken !== authToken) {
          return { enabled: false, reason: 'session_changed' };
        }

        const stored = await adapter.readRegistration();
        const ownerChanged = Boolean(
          stored?.userId
          && stored.userId !== registration.userId
        );
        // The backend owns a unique tokenHash and atomically reassigns the same
        // physical Expo token to the newly authenticated user. Permit that
        // same-token handoff even when an expired prior session could not
        // create a detachment tombstone; refusing it would leave the device
        // attached to the previous user. A different old token still needs
        // its prior owner's durable bearer before the transition is safe.
        if (
          ownerChanged
          && stored.expoPushToken !== registration.expoPushToken
          && !(await registrationHasDurableDetachment(stored))
        ) {
          adapter.reportError('push.previous_owner_detachment_missing');
          return { enabled: false, reason: 'unsafe_previous_owner' };
        }

        let oldDetachment = null;
        if (
          stored
          && stored.expoPushToken !== registration.expoPushToken
          && !ownerChanged
        ) {
          // Preserve the old token and the exact bearer that owns it before
          // replacing the current registration record. A process death at any
          // later point can therefore resume the server detachment safely.
          oldDetachment = await queueDetachment({
            ...stored,
            userId: stored.userId || registration.userId,
          }, authToken, false, !stored.userId);
        }

        // Persist before the request. A timeout can hide a successful server
        // registration, so removing this record on an ambiguous failure would
        // make the active remote device impossible to detach later.
        await adapter.writeRegistration(registration);

        const registrationResponse = await adapter.registerRemote(
          registration,
          authToken,
        );
        if (!registrationResponse?.success) {
          return { enabled: false, reason: 'registration_failed' };
        }

        if (oldDetachment) {
          if (oldDetachment.claimBeforeDetach) {
            const claimResponse = await adapter.registerRemote(
              oldDetachment,
              authToken,
            );
            if (!claimResponse?.success) {
              return { enabled: true, reason: 'old_detachment_queued' };
            }
          }
          const detachmentResponse = await adapter.unregisterRemote(
            oldDetachment,
            authToken,
          );
          if (detachmentResponse?.success) {
            await removeDurableDetachment(oldDetachment);
          }
        }

        return { enabled: true };
      });
    },

    async prepareAccountTransition(authToken, expectedUserId) {
      return serialize(async () => {
        const stored = await adapter.readRegistration();
        if (!stored) return { status: 'no_registration' };

        if (stored.userId && expectedUserId && stored.userId !== expectedUserId) {
          // This record belongs to an older account and must be handled by its
          // already-durable detachment entry, never with the current bearer.
          return { status: 'no_registration' };
        }

        const ownedRegistration = {
          ...stored,
          userId: stored.userId || expectedUserId || null,
        };
        const detachment = await queueDetachment(
          ownedRegistration,
          authToken,
          true,
          !stored.userId,
        );
        if (detachment.claimBeforeDetach) {
          const claimResponse = await adapter.registerRemote(detachment, authToken);
          if (!claimResponse?.success) return { status: 'queued' };
        }
        const response = await adapter.unregisterRemote(detachment, authToken);
        if (!response?.success) return { status: 'queued' };

        await deleteDetachedRegistration(ownedRegistration);
        await removeDurableDetachment(detachment);
        return { status: 'detached' };
      });
    },

    async unregisterCurrent(authToken, expectedUserId) {
      const beganTransition = !accountTransitionInProgress;
      if (beganTransition) accountTransitionInProgress = true;
      try {
        return await serialize(async () => {
          const stored = await adapter.readRegistration();
          if (!stored) return { status: 'no_registration' };
          if (stored.userId && expectedUserId && stored.userId !== expectedUserId) {
            return { status: 'no_registration' };
          }

          const ownedRegistration = {
            ...stored,
            userId: stored.userId || expectedUserId || null,
          };
          const detachment = await queueDetachment(
            ownedRegistration,
            authToken,
            false,
            !stored.userId,
          );
          if (detachment.claimBeforeDetach) {
            const claimResponse = await adapter.registerRemote(detachment, authToken);
            if (!claimResponse?.success) return { status: 'queued' };
          }
          const response = await adapter.unregisterRemote(detachment, authToken);
          if (!response?.success) return { status: 'queued' };

          await deleteDetachedRegistration(ownedRegistration);
          await removeDurableDetachment(detachment);
          return { status: 'detached' };
        });
      } finally {
        if (beganTransition) accountTransitionInProgress = false;
      }
    },

    async retryPendingDetachments() {
      return serialize(async () => {
        const pending = await adapter.readPendingDetachments();
        const retained = [];

        for (const detachment of pending) {
          if (detachment.claimBeforeDetach) {
            const claimResponse = await adapter.registerRemote(
              detachment,
              detachment.authToken,
            );
            if (!claimResponse?.success) {
              retained.push(detachment);
              continue;
            }
          }
          const response = await adapter.unregisterRemote(
            detachment,
            detachment.authToken,
          );
          if (!response?.success) {
            retained.push(detachment);
            continue;
          }

          await deleteDetachedRegistration(detachment);

          if (!detachment.logoutAfterDetach) continue;

          const logoutResponse = await adapter.logoutRemote(detachment.authToken);
          const logoutComplete = Boolean(
            logoutResponse?.success || logoutResponse?.httpStatus === 401
          );
          if (logoutComplete) continue;

          try {
            await adapter.queuePendingLogoutToken(detachment.authToken);
          } catch (error) {
            adapter.reportError('push.pending_logout_queue_failed', error);
            retained.push(detachment);
          }
        }

        await persistPending(retained);
        return { remaining: retained.length };
      });
    },
  };
}

module.exports = {
  addPendingDetachment,
  createPushDeviceLifecycle,
  removePendingDetachment,
  sameDetachment,
  sameRegistration,
};
