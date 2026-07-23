# Production Update And Rollback Runbook

Production updates are performed from the Ubuntu host checkout on:

```text
architecture/self-host-cloudrun-failover
```

## Update From Git

```bash
cd /opt/menorah/menorah-mobile-app-
bash menorah/deploy/ubuntu/update-from-git.sh
```

The script:

- Fails if tracked local files are modified.
- Fetches origin.
- Checks out the configured branch.
- Pulls with `--ff-only`.
- Records previous and new commit SHAs.
- Creates and restore-tests a fresh backup before maintenance.
- Builds images, stops application writers, and runs backend migrations using
  the configured production environment.
- Writes migration state markers atomically and clears
  `migration-in-progress-sha` only after the full migration command succeeds.
- Refuses a new deployment while a partial-migration marker remains.
- Restarts Docker services without rebuilding after the maintenance boundary.
- Runs health checks.
- Leaves writers stopped for operator review if migration fails; it does not
  attempt an unsafe automatic code-only rollback after migration starts.

Security migrations are run before services are rebuilt and restarted.

Deploy state:

```text
/opt/menorah/deploy-state/last-good-sha
/opt/menorah/deploy-state/current-sha
/opt/menorah/deploy-state/migration-in-progress-sha
/opt/menorah/deploy-state/migration-applied-sha
/opt/menorah/deploy-state/deploy.log
```

## Manual Rollback

```bash
cd /opt/menorah/menorah-mobile-app-
bash menorah/deploy/ubuntu/rollback-last-deploy.sh
```

The rollback script:

- refuses code-only rollback whenever `migration-in-progress-sha` exists,
  including when an earlier migration succeeded but a later migration failed;
- refuses code-only rollback when the applied-migration SHA is incompatible
  with the rollback target;
- Reads `/opt/menorah/deploy-state/last-good-sha`.
- Checks out that SHA.
- Rebuilds and restarts the stack.
- Runs health checks.
- Updates `current-sha` only when health checks pass.

## Pre-Update Checklist

- [ ] Latest backup completed.
- [ ] Restore-test is passing.
- [ ] Current public health checks are passing.
- [ ] No active incident is in progress.
- [ ] Branch has the intended commit.
- [ ] No production env files are changed by git.
- [ ] `ADMIN_MFA_REQUIRED=true`, `ADMIN_JWT_EXPIRES_IN=30m`, `JWT_ISSUER=menorah-api`, and `TRUST_PROXY=1` are present in production env.
- [ ] If LiveKit config changed, `deploy/livekit/livekit.yaml` was updated on the Hostinger VPS outside git.
- [ ] Hostinger firewall still allows LiveKit media ports `7881/tcp` and `50000-50100/udp`.
- [ ] Hybrid calling policy is reviewed: non-blocked countries use LiveKit, countries in `LIVEKIT_BLOCKED_COUNTRIES` use approved external links.

## Post-Update Checklist

- [ ] `api-ios /health/ready` returns 200.
- [ ] `api-android /health/ready` returns 200.
- [ ] `api-web /health/ready` returns 200.
- [ ] `api-admin /health/ready` returns 200.
- [ ] Worker health returns 200.
- [ ] `api-web /health/deep` reports LiveKit configured without secret values.
- [ ] `livekit` container is running.
- [ ] iOS subscription payment routes still return 404.
- [ ] Admin auth is still protected.
- [ ] User login works and cannot mint an admin token.
- [ ] Admin login requires the `/auth/admin/login` MFA flow and receives an admin-purpose token.
- [ ] Email verification requires both email and code; code-only legacy verification fails.
- [ ] Article list loads.
- [ ] Booking flow smoke test passes.
- [ ] Video session smoke test joins from counsellor and user clients.
- [ ] UAE video session smoke test opens the configured external-provider link and does not expose a LiveKit token.
- [ ] Non-blocked-country video session smoke test receives an in-app LiveKit call token.

## Emergency Notes

Do not run `git reset --hard` on the host unless you have confirmed there are no local operational changes needed for recovery. Env files are ignored by git and should not be affected by normal checkout/pull operations.
Cloudflare HTTP proxying and tunnels do not replace LiveKit media reachability. If audio/video fails while signaling works, check Hostinger firewall/NAT and LiveKit TCP/UDP port exposure first.
