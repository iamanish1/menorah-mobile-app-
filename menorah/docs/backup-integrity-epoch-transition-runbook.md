# Backup-Integrity Epoch Transition Runbook

This is the future production procedure for runtime candidate
4df2a45319c35d05fd9b054252f0546c9f4d0c3a. It is not authorization to deploy,
generate a key, change production, start a service, or merge draft PR #2.

Do not use set -x, print a key, paste the production environment into a ticket,
or manually rewrite backup metadata. These root-level historical files must
remain byte-for-byte unchanged and never receive HMAC sidecars:

~~~
/mnt/menorah-backups/metadata/latest-success-daily.json
/mnt/menorah-backups/metadata/latest-success-weekly.json
~~~

## Preconditions

Record an approved change reference and use the full candidate SHA:

~~~
readonly REPO_ROOT=/opt/menorah/menorah
readonly ENV_FILE=/opt/menorah/menorah/deploy/env/production.env
readonly BRANCH=release/final-production-readiness
readonly RUNTIME_SHA=4df2a45319c35d05fd9b054252f0546c9f4d0c3a
readonly CHANGE_REFERENCE='<approved-change-reference>'
~~~

All commands are future instructions. Stop on any failed check. Do not replace a
failed guard with a manual git pull, root-pointer edit, or legacy fallback.

## A. Confirm candidate and preserve legacy evidence

Run these read-only checks before any approved transition:

~~~
git -C "$REPO_ROOT" fetch --no-tags origin "$BRANCH"
git -C "$REPO_ROOT" cat-file -e "$RUNTIME_SHA^{commit}"
DEPLOY_SHA="$(git -C "$REPO_ROOT" rev-parse "origin/$BRANCH")"
git -C "$REPO_ROOT" merge-base --is-ancestor "$RUNTIME_SHA" "$DEPLOY_SHA"
unexpected_paths="$(git -C "$REPO_ROOT" diff --name-only "$RUNTIME_SHA..$DEPLOY_SHA" \
  | grep -Ev '^(docs|menorah/docs)/' || true)"
test -z "$unexpected_paths"
sudo sha256sum \
  /mnt/menorah-backups/metadata/latest-success-daily.json \
  /mnt/menorah-backups/metadata/latest-success-weekly.json
sudo test ! -e /mnt/menorah-backups/metadata/latest-success-daily.json.hmac-sha256
sudo test ! -e /mnt/menorah-backups/metadata/latest-success-weekly.json.hmac-sha256
~~~

Record the two hashes in the approved change record. They are comparison values
only, not authenticated backup authority. `DEPLOY_SHA` may be the
documentation-only successor of `RUNTIME_SHA`; the command above proves that
its application runtime source is unchanged before the updater accepts the
current branch tip.

## B. Controlled exact-SHA deployment

Use the project updater; it binds deployment, migration approval, and the
mandatory backup to one exact SHA:

~~~
sudo -u <approved-deploy-user> env \
  MENORAH_RELEASE_REPO_ROOT=/opt/menorah \
  PRODUCTION_ENV="$ENV_FILE" \
  DEPLOY_BRANCH="$BRANCH" \
  DEPLOY_RELEASE_SHA="$DEPLOY_SHA" \
  DEPLOY_MIGRATION_APPROVED_SHA="$DEPLOY_SHA" \
  DEPLOY_CHANGE_REFERENCE="$CHANGE_REFERENCE" \
  BACKUP_INTEGRITY_BOOTSTRAP=INITIALIZE_NEW_EPOCH \
  "$REPO_ROOT/deploy/ubuntu/update-from-git.sh"
~~~

The updater intentionally refuses to run without a complete selected epoch.
For a first transition, complete Step C before invoking it. If policy requires
deployment before the environment authority changes, stop and obtain a reviewed
bootstrap plan; do not bypass this fail-closed prerequisite with a manual
checkout.

After success, verify exact source and runtime tools:

~~~
test "$(git -C /opt/menorah rev-parse HEAD)" = "$DEPLOY_SHA"
git -C /opt/menorah status --porcelain
sudo test -x "$REPO_ROOT/deploy/ubuntu/backup-integrity-epoch.js"
sudo test -x "$REPO_ROOT/deploy/ubuntu/backup-integrity-health.js"
sudo test -x "$REPO_ROOT/deploy/ubuntu/initialize-backup-integrity-epoch.sh"
sudo test -x "$REPO_ROOT/deploy/ubuntu/activate-backup-integrity-epoch.sh"
~~~

## C. Generate and install a fresh authority

Choose a unique non-secret ID, then use this command to create a fresh 32-byte
HMAC key. It preserves the environment file's owner and mode, refuses to
replace an existing authority, and does not print the key.

~~~
epoch_id="epoch-$(date -u +%Y%m%dt%H%M%sz)-$(openssl rand -hex 4)"
printf '%s\n' "$epoch_id" | grep -Ex '[a-z0-9][a-z0-9-]{2,63}'

sudo /bin/sh -eu -c '
  env_file=$1
  epoch_id=$2
  test -f "$env_file"
  ! grep -Eq "^BACKUP_INTEGRITY_(HMAC_KEY|EPOCH_ID)=" "$env_file"
  owner_uid=$(stat -c "%u" "$env_file")
  owner_gid=$(stat -c "%g" "$env_file")
  file_mode=$(stat -c "%a" "$env_file")
  umask 077
  tmp=$(mktemp "$env_file.integrity.XXXXXX")
  grep -Ev "^BACKUP_INTEGRITY_(HMAC_KEY|EPOCH_ID)=" "$env_file" > "$tmp"
  integrity_key=$(openssl rand -hex 32)
  printf "BACKUP_INTEGRITY_HMAC_KEY=%s\n" "$integrity_key" >> "$tmp"
  printf "BACKUP_INTEGRITY_EPOCH_ID=%s\n" "$epoch_id" >> "$tmp"
  chown "$owner_uid:$owner_gid" "$tmp"
  chmod "$file_mode" "$tmp"
  mv -f -- "$tmp" "$env_file"
  unset integrity_key
' sh "$ENV_FILE" "$epoch_id"
unset epoch_id
~~~

Confirm only the non-secret ID, owner, and permissions:

~~~
sudo stat -c '%U:%G %a %n' "$ENV_FILE"
sudo awk -F= '/^BACKUP_INTEGRITY_EPOCH_ID=/{print $1 "=" $2}' "$ENV_FILE"
sudo awk -F= '/^BACKUP_INTEGRITY_HMAC_KEY=/{print $1 "=[REDACTED]"}' "$ENV_FILE"
~~~

The HMAC must never appear in shell history, logs, command arguments, source
control, an example environment file, a backup name, or an incident record.

## D. Initialize and activate the epoch

The explicit bootstrap mode in Step B runs the reviewed initializer and
activator exactly once after the candidate checkout and before the mandatory
backup. It writes an immutable signed epoch-start manifest and completion
record under metadata/integrity-epochs/<id> with restrictive modes, then
atomically selects it. Neither action alters the legacy root markers. Verify
the result as the backup-service identity:

~~~
backup_user="$(systemctl show --property=User --value menorah-backup@daily.service)"
test -n "$backup_user"
sudo -u "$backup_user" env PRODUCTION_ENV="$ENV_FILE" \
  node "$REPO_ROOT/deploy/ubuntu/backup-integrity-epoch.js" validate
~~~

Recheck legacy hashes, restrictive epoch modes, and absence of legacy sidecars:

~~~
sudo sha256sum \
  /mnt/menorah-backups/metadata/latest-success-daily.json \
  /mnt/menorah-backups/metadata/latest-success-weekly.json
sudo find /mnt/menorah-backups/metadata/integrity-epochs -maxdepth 2 \
  -type f \( -name epoch-start.json -o -name epoch-complete.json -o -name activation.json \) \
  -printf '%m %p\n'
sudo test ! -e /mnt/menorah-backups/metadata/latest-success-daily.json.hmac-sha256
sudo test ! -e /mnt/menorah-backups/metadata/latest-success-weekly.json.hmac-sha256
~~~

A changed legacy hash is a stop-and-investigate condition. Never repair it by
rewriting the root pointer.

## E. Write first active-epoch evidence

Run these one-shot services in order. A manual backup is not a substitute for
the required daily and weekly cadence evidence:

~~~
sudo systemctl start menorah-backup@daily.service
sudo systemctl start menorah-backup@weekly.service
sudo systemctl start menorah-restore-test.service
~~~

New backup and restore evidence is immutable and signed only inside the active
epoch. Pointer replacement is atomic inside that epoch. A restore result may be
linked to the current daily or weekly backup; the health gate still requires
both fresh cadences.

## F. Verify health and collect redacted evidence

Only after the three services complete successfully:

~~~
sudo systemctl start menorah-backup-health.service
sudo systemctl --no-pager --full status \
  menorah-backup@daily.service \
  menorah-backup@weekly.service \
  menorah-restore-test.service \
  menorah-backup-health.service
sudo journalctl --no-pager \
  -u menorah-backup@daily.service \
  -u menorah-backup@weekly.service \
  -u menorah-restore-test.service \
  -u menorah-backup-health.service -n 200 \
  | sed -E 's/(BACKUP_INTEGRITY_HMAC_KEY|BACKUP_ENCRYPTION_PASSWORD)=[^[:space:]]+/\1=[REDACTED]/g'
~~~

Health must fail closed unless it validates a complete configured epoch plus a
fresh signed daily source chain, a fresh signed weekly source chain, and a
fresh signed restore result linked to one active source. It also verifies HMACs,
artifact and metadata digests, checksum sidecars, encryption/provenance
contracts, and safe canonical paths. It has no legacy-root-marker fallback.

## G. Failure and rollback boundary

If initialization, activation, either backup, restore-test, or health fails,
stop. Do not delete an epoch manifest, evidence record, pointer, restore
artifact, HMAC key, or legacy root marker.

If an approved rollback must remove an incomplete authority selection, change
only the environment selection after reviewing the prior complete epoch. Leave
the key and all immutable history in place. Health is expected to fail closed
until the selected environment ID matches a signed active epoch again.

Pruning is preservation-only in this release: it validates the active epoch and
removes no historical epoch or legacy evidence. An operator-approved,
epoch-aware retention design is required before deletion is reintroduced.

## Later key rotation

For a later rotation, install a new key and ID using Step C, then use the
previous ID explicitly during activation:

~~~
sudo -u "$backup_user" env PRODUCTION_ENV="$ENV_FILE" \
  "$REPO_ROOT/deploy/ubuntu/initialize-backup-integrity-epoch.sh" key-rotation
sudo -u "$backup_user" env PRODUCTION_ENV="$ENV_FILE" \
  "$REPO_ROOT/deploy/ubuntu/activate-backup-integrity-epoch.sh" <previous-epoch-id>
~~~

The signed activation record names the superseded epoch. The prior epoch and
all of its evidence remain immutable for audit.

## Status

Server staging discovery is still incomplete. Production is not ready. This
repository runbook is a future operational plan, not evidence that any server
transition occurred.
