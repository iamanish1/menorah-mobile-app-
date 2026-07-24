# Production Update And Recovery Runbook

The current public-production verdict is **NOT READY**. This runbook describes
a controlled method only; it does not authorize deployment, migration, traffic,
provider changes, or production-data access.

## Authoritative Method

The sole production deployment method is an operator invoking
`menorah/deploy/ubuntu/update-from-git.sh` from the Ubuntu production host.
It releases the guarded Docker Compose stack in
`menorah/deploy/docker-compose.production.yml` and
`menorah/deploy/docker-compose.tunnel.yml`.

`first-run.sh` is a one-time, pre-traffic empty-host data-service bootstrap. It
requires a separate literal confirmation, a clean exact reviewed remote-tip
SHA, empty MongoDB and Redis storage, and no existing Compose containers or
deployment markers. It starts only MongoDB and Redis, initializes and verifies
the replica set, and records `current-sha` plus `bootstrap-complete-sha`; it
does not start an API, web app, worker, proxy, LiveKit, monitoring service, or
Cloudflare Tunnel. It cannot be
reused as an update shortcut. Bootstrap does not authorize traffic: invoke the
guarded updater for that same reviewed SHA with explicit migration approval so
the first backup, restore test, migration marker, artifact manifest, and
release record exist.

GitHub Actions does not deploy. The stable `Production release readiness`
check in `.github/workflows/deploy.yml` is read-only: it validates the exact
candidate checkout, workflow safety invariants, Compose rendering, and release
scripts. Pull request and push checks bind to the immutable event SHA. A manual
readiness rerun requires `candidate_sha` to be an explicitly entered,
lowercase, full 40-character reviewed commit SHA; it does not accept a branch
name as release identity.

The stable `Required functional release gates` check aggregates the exact-SHA
backend, disposable integration, web, mobile, and release-infrastructure jobs.
The stable `Required security gates` check aggregates the secret-history,
SAST, dependency, container, and mobile diagnostics jobs. Recommended external
branch rules and evidence templates live in `.github/BRANCH_PROTECTION.md`,
`.github/pull_request_template.md`, and
`.github/RELEASE_EVIDENCE_TEMPLATE.md`.

`menorah/backend/cloudbuild.yaml` and `gcp/cloudrun.yaml` are fail-closed
tombstones at the former Cloud Run deployment paths. They are intentionally not
valid Cloud Build or Knative Service definitions. The retired definitions are
preserved only as disabled audit history at
`menorah/backend/legacy/cloudbuild.cloudrun.yaml.disabled` and
`gcp/legacy/cloudrun.yaml.disabled`. None of these files is an approved
production release path; they must not be invoked, attached to a trigger, or
treated as failover automation.

> OWNER ACTION: approve one exact 40-character release commit, its database
> migrations, the maintenance window, and a non-secret change reference.

> INFRASTRUCTURE ACTION: disable any Cloud Build trigger that references
> `menorah/backend/cloudbuild.yaml`, remove its automatic production invocation,
> and remove Cloud Run deployment authority from trigger service accounts after
> confirming no other approved workload needs it. Do not delete live services
> as part of this repository change.

> INFRASTRUCTURE ACTION: verify Cloudflare, DNS, load balancers, and mobile/web
> API configuration do not route production traffic to a `run.app` service.
> Quarantine or decommission remaining legacy Cloud Run services only through a
> separately approved change with retention and recovery evidence.

> INFRASTRUCTURE ACTION: require the stable `Production release readiness`,
> `Required functional release gates`, and `Required security gates` checks in
> branch protection for `main` and protected `release/**` branches. Repository
> files cannot create or verify those external settings.

> INFRASTRUCTURE ACTION: install operator-controlled LiveKit, Cloudflare Tunnel,
> and Alertmanager files outside the checkout with no permissions for other
> users. The Alertmanager file must contain approved delivery destinations and
> must be readable by the non-root Alertmanager container. Provision a distinct
> least-privilege MongoDB monitoring identity. The guarded updater refuses the
> committed non-delivering Alertmanager placeholder and reused database
> identities.

## Pre-Release Evidence

Before opening the maintenance window:

- The exact commit passed review and the `Production release readiness`,
  `Required functional release gates`, and `Required security gates` checks.
- The release SHA is the current tip of the reviewed remote branch and a
  fast-forward descendant of the recorded deployed commit. A moving branch
  name by itself is not release approval.
- The owner approved migrations for that same SHA.
- The production checkout is clean and its `current-sha` recovery marker, when
  present, matches the checked-out commit.
- No incident or another maintenance operation is active.
- Required production environment and host-only secret files are present.
- Public traffic owners know the maintenance boundary and recovery contact.
- `rollback-last-deploy.sh` and the backup/restore runbook are available to the
  operator.

Set the reviewed values without placing secrets in shell history:

```bash
cd /opt/menorah/menorah-mobile-app-
export DEPLOY_BRANCH='release/reviewed-release-name'
export DEPLOY_RELEASE_SHA='<reviewed-full-40-character-sha>'
export DEPLOY_MIGRATION_APPROVED_SHA="${DEPLOY_RELEASE_SHA}"
export DEPLOY_CHANGE_REFERENCE='change-YYYY-NNN'
```

Confirm the two SHA variables are identical and that the remote branch tip is
still the reviewed commit:

```bash
git fetch --prune origin \
  "+refs/heads/${DEPLOY_BRANCH}:refs/remotes/origin/${DEPLOY_BRANCH}"
git rev-parse "refs/remotes/origin/${DEPLOY_BRANCH}"
printf '%s\n' "${DEPLOY_RELEASE_SHA}"
```

If the branch moved, stop and review the new tip. Do not substitute the new SHA
merely to make the script pass.

### Existing-host transition preflight

This section is an `INFRASTRUCTURE ACTION` before the first guarded-tooling
adoption. Do not delete or recreate a Docker network, and do not make these
changes while application writers are active.

1. Inspect the existing application network and record its Compose labels,
   IPv4 subnet, and assigned endpoints:

   ```bash
   cd /opt/menorah/menorah-mobile-app-/menorah
   project_name="$(docker compose \
     --env-file deploy/env/production.env \
     --env-file deploy/env/cloudflare.env \
     -f deploy/docker-compose.production.yml \
     -f deploy/docker-compose.tunnel.yml config --format json |
     node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).name))')"
   docker network inspect "${project_name}_app_net"
   ```

   Set `APP_NETWORK_SUBNET` to that exact safe, non-overlapping subnet and
   choose an unused `CADDY_APP_IP` inside it. The updater verifies Compose
   labels, subnet membership, and address availability read-only. If the
   existing subnet overlaps another approved network or has no stable free
   address, stop: use a separate approved outage/network-migration plan. The
   updater never deletes a network.

2. Retain rollback-compatible, loopback-only host endpoints. Every
   `*_LOCAL_PORT` and `CADDY_HTTP_PORT` value must be exactly
   `127.0.0.1:PORT`; remove the retired `CADDY_HTTPS_PORT`. In particular,
   replace the old example `CADDY_HTTP_PORT=80` with a reviewed loopback value.
   Set `MENORAH_MEDIA_GROUP_ID` to the output of `id -g`. These full loopback
   values remain safe if the predecessor Compose file is restored.

3. In a separate short change window, stop and verify the five writers, then
   prepare the shared media root and new non-root monitoring directories. Do
   not recurse ownership through existing media objects:

   ```bash
   set -euo pipefail
   cd /opt/menorah/menorah-mobile-app-/menorah
   compose=(docker compose --env-file deploy/env/production.env \
     --env-file deploy/env/cloudflare.env \
     -f deploy/docker-compose.production.yml \
     -f deploy/docker-compose.tunnel.yml)
   writers=(api-ios api-android api-web api-admin worker)
   "${compose[@]}" stop -t 60 "${writers[@]}"
   for service in "${writers[@]}"; do
     container_id="$("${compose[@]}" ps -q "${service}")"
     test -z "${container_id}" || \
       test "$(docker inspect --format '{{.State.Running}}' "${container_id}")" = false
   done
   set -a; . deploy/env/production.env; set +a
   operator_gid="$(id -g)"
   test "${MENORAH_MEDIA_GROUP_ID}" = "${operator_gid}"
   sudo chown 100:"${operator_gid}" "${MENORAH_DATA_ROOT}/uploads"
   sudo chmod 2770 "${MENORAH_DATA_ROOT}/uploads"
   sudo install -d -m 0770 -o 65534 -g "${operator_gid}" \
     "${MENORAH_DATA_ROOT}/prometheus" \
     "${MENORAH_DATA_ROOT}/alertmanager" \
     "${MENORAH_DATA_ROOT}/monitoring-textfile"
   sudo install -d -m 0770 -o 472 -g "${operator_gid}" \
     "${MENORAH_DATA_ROOT}/grafana"
   sudo install -d -m 0770 -o 0 -g "${operator_gid}" \
     "${MENORAH_DATA_ROOT}/alloy"
   sudo install -d -m 0770 -o 10001 -g "${operator_gid}" \
     "${MENORAH_DATA_ROOT}/loki"
   stat -c '%n|%u:%g|%a' \
     "${MENORAH_DATA_ROOT}/uploads" \
     "${MENORAH_DATA_ROOT}/prometheus" \
     "${MENORAH_DATA_ROOT}/alertmanager" \
     "${MENORAH_DATA_ROOT}/monitoring-textfile" \
     "${MENORAH_DATA_ROOT}/grafana" \
     "${MENORAH_DATA_ROOT}/alloy" \
     "${MENORAH_DATA_ROOT}/loki"
   "${compose[@]}" start "${writers[@]}"
   CHECK_PUBLIC=false deploy/ubuntu/health-check.sh
   CHECK_PUBLIC=true deploy/ubuntu/health-check.sh
   ```

   Preserve the redacted `stat` and health output with the change record. The
   guarded release later copies legacy per-service objects into the canonical
   namespace only after writers stop, rejects byte-different collisions before
   copying, keeps all predecessor copies, and records a checksummed manifest.
   Do not manually move or delete legacy upload directories.

4. Configure all ten managed MongoDB identity variables and the dedicated
   monitoring URI as documented in `monitoring-alert-runbook.md`; do not run an
   ad hoc creation command. The updater's pre-maintenance bootstrap dry-run is
   read-only: it rejects unsafe existing-role or configured-credential drift
   and reports missing candidate-managed identities. Before the mandatory
   backup, the guarded updater may atomically create and authenticate only the
   missing backup identity. Every other missing identity is created only at the
   guarded, writer-stopped maintenance boundary after durable recovery state
   exists.

### One-time guarded-tooling adoption

An existing host may still have the retired updater at its recorded current
SHA. Do not use that old script to deploy this remediation, and do not pull or
checkout the new branch merely to obtain the new script. For the first adoption
only, export the updater blob from the already fetched, exact reviewed commit,
verify its Git blob identity, and run that reviewed updater against the still
unchanged checkout:

```bash
set -euo pipefail
umask 077
[[ "${DEPLOY_RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]
reviewed_script="/opt/menorah/deploy-state/reviewed-update-${DEPLOY_RELEASE_SHA}.sh"
reviewed_script_tmp="$(mktemp /opt/menorah/deploy-state/.reviewed-update.XXXXXX)"
git cat-file blob \
  "${DEPLOY_RELEASE_SHA}:menorah/deploy/ubuntu/update-from-git.sh" \
  > "${reviewed_script_tmp}"
test "$(git hash-object "${reviewed_script_tmp}")" = \
  "$(git rev-parse "${DEPLOY_RELEASE_SHA}:menorah/deploy/ubuntu/update-from-git.sh")"
chmod 0500 "${reviewed_script_tmp}"
mv -f -- "${reviewed_script_tmp}" "${reviewed_script}"
MENORAH_RELEASE_REPO_ROOT="$(pwd)" bash "${reviewed_script}"
```

This is an `INFRASTRUCTURE ACTION` for the first transition to the guarded
tooling. It still executes the exact reviewed `update-from-git.sh`; it is not a
second deployment method. Preserve the exported script with the release
evidence. After a successful adoption, invoke the updater from the checkout for
later releases. That predecessor checkout script verifies the remote candidate
and atomically transfers control, with the deployment lock held, to the exact
candidate updater Git blob before candidate artifact or maintenance work. If
the updater blob is unchanged, its Git object identity is still verified.

## Release

Run exactly:

```bash
bash menorah/deploy/ubuntu/update-from-git.sh
```

If the one-time adoption command above was required, it already performed this
release; do not invoke the checkout copy a second time for the same attempt.

The guarded script:

1. Acquires `/opt/menorah/deploy-state/.deploy.lock`; a concurrent deployment,
   rollback, restore, or recovery fails. It verifies and, when needed, re-execs
   the exact reviewed candidate updater blob without releasing the lock.
2. Validates loopback endpoint values, candidate runtime directory ownership,
   operator-controlled files, clean checkout, reviewed branch/tip/SHA,
   fast-forward ancestry, and explicit migration approval.
3. On first existing-host adoption, health-checks and records the still-running
   predecessor image IDs before any candidate build can replace mutable tags.
   A data-only empty-host bootstrap is explicitly distinguished because it has
   no public predecessor. The updater then checks out the candidate detached.
4. Validates the existing `app_net` labels/subnet/address and preflights
   existing managed MongoDB identities read-only before maintenance, rejecting
   role or configured-credential drift while safely identifying identities the
   candidate must add. It atomically creates and authenticates only a missing
   backup identity so first adoption cannot deadlock before the backup.
5. Creates a fresh manual backup, restores that exact archive into the isolated
   restore-test database, verifies backup health and checksum, then records the
   archive identity.
6. Validates that every host-owned backup/restore timer is enabled and active,
   removes any retired continuous `backup-runner` container, and validates
   Compose configuration.
7. Builds application images; pulls digest-pinned proxy, tunnel, calling, and
   monitoring images; validates Caddy in a networkless one-shot service and
   validates backend startup configuration
   and the external Alertmanager delivery configuration before maintenance; then
   records every release service's content-addressed Docker image ID in a
   checksum-protected manifest.
8. Stops and verifies every API/worker writer. It collision-checks and copies
   legacy media without deleting predecessor files, records checksummed media
   evidence, then writes the identity marker, creates any remaining
   candidate-managed identities idempotently, authenticates the configured
   credentials, and reconciles exact MongoDB roles. The marker remains if any
   non-transactional create/update is incomplete or credential verification
   fails. Candidate MongoDB programs execute from a cleaned mode-0600 file so
   parse errors and uncaught exceptions propagate as release failures.
9. Writes `migration-in-progress-sha`, verifies the checksum-recorded `api-web`
   image ID and refuses mutable-tag drift, then runs the approved migration once
   with an image-ID Compose override and `--pull never`. After the command
   succeeds it establishes `post-migration-recovery-sha` before atomically
   recording `migration-applied-sha` or removing the in-progress marker, so a
   reboot at that boundary retains a guarded path. Routine same-SHA release
   replay is refused; recovery never reruns an already-applied migration.
10. Starts without rebuilding or pulling, then confirms every running release
   container uses the recorded content-addressed image.
11. Requires local and public health, then label-verifies and removes the
    predecessor-only Promtail and cAdvisor containers so the old raw Docker
    socket mount cannot survive adoption.
12. Only then writes successful `current-sha`/`last-good-sha` state and removes
    the data-only bootstrap marker.

Do not run the migration command separately. Do not start stopped writers while
`migration-in-progress-sha` exists.

The routine release deliberately does not replace the persistent MongoDB or
Redis containers. A version change to either data service requires a separate
owner-approved infrastructure maintenance and restore plan; it must not be
smuggled into an application release.

## Recovery Metadata

The release writes:

```text
/opt/menorah/deploy-state/deploy.log
/opt/menorah/deploy-state/current-sha
/opt/menorah/deploy-state/last-good-sha
/opt/menorah/deploy-state/bootstrap-in-progress-sha
/opt/menorah/deploy-state/bootstrap-complete-sha
/opt/menorah/deploy-state/mongo-identity-reconciliation-in-progress-sha
/opt/menorah/deploy-state/migration-in-progress-sha
/opt/menorah/deploy-state/migration-applied-sha
/opt/menorah/deploy-state/post-migration-recovery-sha
/opt/menorah/deploy-state/rollback-in-progress-sha
/opt/menorah/deploy-state/releases/<release-sha>.json
/opt/menorah/deploy-state/releases/<release-sha>.images
/opt/menorah/deploy-state/releases/<release-sha>.images.sha256
/opt/menorah/deploy-state/releases/<release-sha>.media-transition.manifest
/opt/menorah/deploy-state/releases/<release-sha>.media-transition.manifest.sha256
```

The JSON record includes the reviewed branch, commit and source-tree SHA,
previous SHA, change reference, phase, migration and health status, exact
backup archive/checksum, and the checksum of the image identity manifest.
Preserve these files with incident evidence. They contain paths and
identifiers, not application secrets.

## Failure Rules

- Before writers stop: the script restores the checkout to the recorded
  previous SHA. Resolve the validation/build/backup problem and rerun only
  after the same exact SHA remains approved. If restoration itself reports a
  failure, reconcile `HEAD` with `current-sha` before retrying.
- If `bootstrap-in-progress-sha` exists: no public service was intentionally
  started, but bootstrap did not complete. Keep public services stopped and
  perform an operator-reviewed empty-host recovery; do not delete the data
  directory merely to make the marker disappear.
- While `migration-in-progress-sha` exists: keep writers stopped. The only
  bounded resume case is a crash after migration returned success where
  `migration-in-progress-sha`, `migration-applied-sha` and
  `post-migration-recovery-sha` are strict markers for the same candidate. The
  guarded resume validates that three-marker state, the exact checkout,
  metadata, media evidence and recorded images before starting anything; it
  never reruns migration. Every other in-progress state is potentially partial
  and requires coordinated database/application recovery review. Do not edit a
  marker to manufacture the exception.
- While `mongo-identity-reconciliation-in-progress-sha` exists: keep writers
  stopped. From the exact clean candidate checkout, run only the guarded
  identity recovery after approval:

  ```bash
  MENORAH_MONGO_IDENTITY_RECOVERY_CONFIRM=RECOVER_RECORDED_MONGO_IDENTITIES \
    bash menorah/deploy/ubuntu/recover-managed-mongo-identities.sh
  ```

  It holds the shared lock, verifies its candidate Git blob and marker, stops
  and verifies all writers, completes idempotent creation of any missing
  candidate-managed identities, reconciles the exact roles with all ten
  explicitly forwarded identity variables, then proves every exact role in
  read-only mode before clearing the marker. It never rotates credentials,
  migrates, or starts writers. Code rollback remains blocked until it succeeds.
- After `migration-applied-sha` is written: do not perform an automatic
  code-only rollback to an older SHA.
- After startup, artifact identity, Caddy, or health failure: keep the evidence
  and obtain operator review. The updater writes
  `post-migration-recovery-sha`, stops writers, and intentionally does not hide
  the failure with an unsafe code-only rollback. If the failure was operational
  and the exact recorded candidate artifacts remain appropriate, resume only
  after approval:

  ```bash
  cd /opt/menorah/menorah-mobile-app-
  export MENORAH_POST_MIGRATION_RECOVERY_CONFIRM=RESUME_RECORDED_RELEASE
  bash menorah/deploy/ubuntu/resume-post-migration-release.sh
  ```

  The resume script verifies the exact checkout/tree, failed release metadata,
  applied-migration SHA, image manifest/path/digest and every local image, plus
  the media-transition manifest/path/digest, before local/public health. It
  neither rebuilds, pulls, nor reruns a migration. It is retry-safe and keeps
  writers stopped on failure. If the candidate code itself is defective, do
  not bypass this gate to deploy a descendant: use the coordinated database
  restore/schema-review path or another approved recovery plan first.

## Manual Rollback

Only when no incompatible or partial migration marker blocks it:

```bash
cd /opt/menorah/menorah-mobile-app-
bash menorah/deploy/ubuntu/rollback-last-deploy.sh
```

The rollback script shares the deployment lock and selects the recorded
`current-sha` when recovering an interrupted candidate checkout; after a
completed release it selects `last-good-sha`. Before changing tags or the
checkout it records that exact target in `rollback-in-progress-sha`; a retry
must reuse it, and the marker is cleared only after `current-sha`, artifact
identity and local/public health pass. It requires checksum-bound healthy
artifact metadata, refuses dirty worktrees, blocks identity/migration/restore
recovery states, and starts without rebuilding or pulling.

## Post-Release Checks

- [ ] The release JSON phase is `complete`, migration status is `applied` or
      `already-applied`, and health status is `passed`.
- [ ] The image manifest checksum matches the JSON recovery record.
- [ ] All four API `/health/ready` endpoints and worker readiness return 200.
- [ ] Public deep-health and metrics endpoints remain unavailable.
- [ ] Admin authentication, MFA, and route isolation pass.
- [ ] iOS subscription routes remain disabled.
- [ ] User login, booking, article list, and approved payment smoke tests pass.
- [ ] Counsellor and user calling smoke tests pass for in-app and
      blocked-country external-provider paths.
- [ ] Backup health monitoring remains green after the release.

Do not use `git reset --hard` on the host. Host-only environment and secret
files must remain outside version control.
