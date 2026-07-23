# Managed MongoDB identities

These scripts manage the self-hosted MongoDB identities without printing
usernames, passwords, connection strings, or database error details.

## Identity contract

Both scripts require the same root, application, backup, production-restore,
and monitoring username/password variables. Values must be non-placeholder,
free of control characters, and distinct; passwords must contain 32–1,024
characters.

The exact direct roles are:

- application: `readWrite@menorah`;
- backup: `backup@admin`;
- production restore: `readWrite@menorah` and `dbAdmin@menorah`;
- monitoring: `clusterMonitor@admin` and `read@local`.

MongoDB documents that `backup@admin` is sufficient for full-instance
`mongodump`, so a separate `readAnyDatabase` grant is intentionally absent:
https://www.mongodb.com/docs/manual/reference/built-in-roles/?deployment-type=self

The scoped restore roles match this repository's restore procedure, which
drops and restores only the `menorah` database without oplog replay. MongoDB's
restore access guidance is:
https://www.mongodb.com/docs/database-tools/mongorestore/mongorestore-behavior-access-usage/

## Empty-host bootstrap

`create-users.js` is create-only:

1. it validates every input before accessing MongoDB;
2. it requires Docker's root bootstrap to have already created the exact root
   identity;
3. it authenticates every existing managed identity with the configured
   credential and preflights its exact roles;
4. it creates only missing managed identities; and
5. it authenticates every newly created identity and verifies exact roles
   afterward.

It contains no `updateUser` path. Existing role drift or an unsafe partial
state stops bootstrap without modifying existing users.

With `MONGO_BOOTSTRAP_DRY_RUN=true`, the script validates root and every
existing managed identity, reports how many identities are missing, and makes
no changes. The guarded updater controls this flag and rejects an externally
supplied value during a routine release.

`MONGO_BOOTSTRAP_SCOPE=backup-only` is an internal guarded-updater channel. It
can create at most the one backup identity needed by the mandatory release
backup; a user creation is atomic and the script immediately proves the
configured credential by authenticating. The updater rejects operator-supplied
scope values. Full provisioning remains the default candidate/recovery scope.

## Existing-host adoption

Do not create users with an ad hoc shell command. The guarded updater performs
the bootstrap dry-run before maintenance, allowing missing candidate-managed
identities but rejecting role or configured-credential drift. It then
atomically creates only a missing backup identity and authenticates it before
the mandatory backup. After all writers are stopped and verified and the
durable identity-recovery marker exists, it runs the full create-only bootstrap
to fill any other missing identities, reconciles exact roles, and validates the
monitoring login. An interrupted full boundary is resumed only with
`recover-managed-mongo-identities.sh`, which repeats those idempotent steps,
fails closed if configured credentials changed, and leaves writers stopped.

Root authentication is supplied to `mongosh` from environment variables via
`connect(...)`, not password arguments. Candidate programs are written to an
ephemeral mode-0600 file inside the MongoDB container and invoked with
`mongosh --file`; this makes parse errors and uncaught exceptions return
nonzero instead of being swallowed by stdin REPL mode. Backup/restore tools use
an ephemeral mode-0600 `--config` file that is removed on exit. Never enable
command tracing or capture environment values during either path.

## Routine role reconciliation

`reconcile-managed-users.js` normally supplies only `roles` to `updateUser`.
It verifies that the complete identity set exists, removes extra direct roles,
and leaves every password unchanged. It never creates a missing identity.

Routine releases must leave `MONGO_ROTATE_CREDENTIALS_CONFIRM` unset. The
release wrapper should explicitly reject a non-empty value so a general
deployment can never become a credential-rotation workflow through environment
drift.

## Credential-rotation maintenance

Password rotation is enabled only by the exact confirmation:

```text
MONGO_ROTATE_CREDENTIALS_CONFIRM=rotate-managed-credentials
```

**INFRASTRUCTURE ACTION:** perform this only during an approved maintenance
window with the managed secret stores and service connection strings ready to
change as one coordinated operation.

This switch is for an approved maintenance procedure, not `update-from-git.sh`.
Before using it:

1. stop all API and worker writers;
2. capture and verify the required backup using the currently valid backup
   credential;
3. stage all five new, distinct passwords and their corresponding application,
   backup, restore, and monitoring URIs together;
4. run reconciliation through the root-authenticated maintenance channel;
5. authenticate each managed identity and verify its exact direct roles; and
6. start services only with the newly staged URIs.

MongoDB user updates are not transactional across identities. A failure can
therefore leave a partially rotated set; the script exits nonzero with a fixed,
credential-safe message. Keep writers stopped and rerun the same confirmed
reconciliation using the root maintenance identity until every verification
passes. Never restore an old password selectively or place credentials on a
command line.

Run the repository contract test with:

```bash
node --test menorah/scripts/qa/mongo-managed-identities.test.mjs
```
