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
- Rebuilds and restarts Docker services.
- Runs health checks.
- Rolls back automatically if health checks fail.

Deploy state:

```text
/opt/menorah/deploy-state/last-good-sha
/opt/menorah/deploy-state/current-sha
/opt/menorah/deploy-state/deploy.log
```

## Manual Rollback

```bash
cd /opt/menorah/menorah-mobile-app-
bash menorah/deploy/ubuntu/rollback-last-deploy.sh
```

The rollback script:

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

## Post-Update Checklist

- [ ] `api-ios /health/ready` returns 200.
- [ ] `api-android /health/ready` returns 200.
- [ ] `api-web /health/ready` returns 200.
- [ ] `api-admin /health/ready` returns 200.
- [ ] Worker health returns 200.
- [ ] iOS subscription payment routes still return 404.
- [ ] Admin auth is still protected.
- [ ] User login works.
- [ ] Admin login works.
- [ ] Article list loads.
- [ ] Booking flow smoke test passes.

## Emergency Notes

Do not run `git reset --hard` on the host unless you have confirmed there are no local operational changes needed for recovery. Env files are ignored by git and should not be affected by normal checkout/pull operations.
