# Security Remediation Deployment Record

This change set implements application controls for payout approvals, password resets, bank-account encryption, KYC consent evidence, account-deletion requests, mobile notification minimization, diagnostics exposure, Android CI signing hygiene, and container restrictions.

## Required deployment preparation

1. Put new, distinct, high-entropy `DATA_ENCRYPTION_KEY` and `AUDIT_LOG_SIGNING_KEY` values in the approved encrypted production secret store, then add their references to the host-only `production.env`. Do not commit or print either value. A missing value deliberately prevents production API startup.
2. Run the deployment only through `deploy/ubuntu/update-from-git.sh`. The script creates and restore-tests a fresh backup, builds the release, stops every API and worker, and then runs the migration once with the new backend image. This maintenance boundary prevents an old API from reading or overwriting bank records after their plaintext fields are removed.
3. Resolve any migration failure before starting the new build. In particular, the active-payout uniqueness index will refuse to deploy if historic data has more than one active payout for a counsellor. Reconcile the ledger under finance approval; do not delete records to bypass the index.
4. Set `MAX_PAYOUT_AMOUNT_PAISE=5000000`, the approved INR 50,000 per-transaction payout limit. Larger balances must be paid through sequential payout requests; each prior request must finish before the next is created.
5. Set `KYC_RETENTION_DAYS=365` and `KYC_CONSENT_VERSION=ordinary-face-check-v1-2026-07-22`. The ordinary-user flow is an optional face-detection trust check, not government-ID verification or full eKYC. The approved notice must remain visible before consent and must match the published privacy policy and Luxand processor agreement.

## Migration and rollback boundary

- The update script must stop before Git, backup, build, or service changes if any required cryptographic, finance, or privacy setting is absent or invalid.
- A fresh manual backup and an exact restore test are mandatory before maintenance begins. A stale restore-test marker is not sufficient.
- Once the API and worker services are stopped, do not start an old backend until migration state has been reviewed. The migration can remove plaintext bank fields and create indexes that old code does not understand.
- After the migration starts, a code-only automatic rollback is prohibited. A failed migration or failed post-migration health check leaves an explicit operator-review condition. Recovery requires an approved coordinated application and database procedure based on the recorded pre-migration backup and migration marker.
- The deployment SHA is recorded as current only after local and public health checks pass.

## Controls that need an owner outside the codebase

- Send signed security audit events to a protected, off-host append-only log destination with restricted delete permissions and retention monitoring. Local HMAC chaining is tamper-evident, not immutable storage.
- Define and operate the deletion-review workflow: legal hold checks, data map, retention schedule, processor deletion requests, evidence of completion, and response deadlines. The application disables access and records a request; it intentionally does not claim immediate erasure.
- Maintain a KYC retention-review job that checks `retentionExpiresAt` before any purge and preserves records under legal hold. Do not enable automatic deletion without legal approval and a tested restore/audit process.
- Configure Android App Links by publishing the production signing certificate fingerprint at `https://app.menorah.me/.well-known/assetlinks.json`. Test the password-reset link on a signed release build.
- In Cloudflare Tunnel, map every hostname in `deploy/cloudflare/tunnel-config.yml.example` to `http://reverse-proxy:80`, including all Mentle hostnames. Keep diagnostics private and do not use `https://reverse-proxy:443` for the tunnel origin hop.
- Confirm the new Cloudflare tunnel connector does not expose its token through a command line or container environment inspection, then revoke the old connector token.
- Complete the repository-wide Android credential incident response in `docs/security-incident-remediation.md`; this deployment does not rewrite Git history.
- Review the remaining Expo transitive dependency exception before its documented expiry and complete a native regression pass for any SDK upgrade.

## Production acceptance checks

1. Run the deployment script and its migration, then the local and public health checks.
2. Verify a payout request requires an idempotency key, reserves only completed paid earnings, cannot exceed the configured cap, and requires a second administrator with fresh MFA to submit it.
3. Verify bank-account numbers are absent from normal API responses and are stored only in encrypted form after migration.
4. Verify password-reset URLs carry their token in the URL fragment, not the query string, and Caddy access logs omit the legacy reset endpoint.
5. Verify public `/health/deep` and `/metrics/security` return `404`, while private monitoring continues to reach the internal API services.
6. Verify mobile account deletion requests require a password, disable access, and create a reviewable retention request.
