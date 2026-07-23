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
3. it preflights all existing managed identities;
4. it creates only missing managed identities; and
5. it verifies exact roles afterward.

It contains no `updateUser` path. Existing role drift or an unsafe partial
state stops bootstrap without modifying existing users.

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
