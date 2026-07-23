# Environment variable reference

Last reviewed: 2026-07-23.

## Safety and authority

This reference was derived from tracked examples, Compose files and backend
configuration/startup validation. No ignored or live environment file was read,
and this document must never contain values.

Primary sources:

- `menorah/backend/.env.example`
- `menorah/deploy/env/production.env.example`
- `menorah/deploy/env/home.compose.env.example`
- `menorah/deploy/env/home.env.example`
- `menorah/deploy/env/cloudflare.env.example`
- `menorah/deploy/docker-compose.production.yml`
- `menorah/deploy/docker-compose.home.yml`
- `menorah/backend/src/shared/app/startupValidation.js`

Where this document and executable validation differ, stop the release and
review the drift. Do not weaken validation merely to make an environment pass.

Classification:

- `R` — required for the stated production consumer;
- `C` — required only when the stated feature, service or operation is used;
- `O` — optional override with a safe documented default or non-production use;
- `U` — must be unset in production.

Secret classes:

- `Yes` — credential, token, private key, signing/encryption key, credentialed
  URI or secret-bearing callback;
- `Sensitive` — not an authentication secret, but restrict because it exposes
  identifiers, topology, permissions or security evidence;
- `No` — may still require change control.

`NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` values are compiled or delivered to clients
and must never contain secrets.

## Core runtime and authentication

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | R | Backend and builds; exact `production` for production runtime | No | Engineering; startup record |
| `SERVICE_RUNTIME` | R | API/worker topology label; approved runtime mode | No | `INFRASTRUCTURE ACTION`; Compose model |
| `WORKER_MODE` | R for worker | Worker scheduler mode from approved deployment design | No | Engineering/infrastructure; worker readiness |
| `PORT` | O | Per-service internal decimal port; normally supplied by Compose | No | Infrastructure; rendered Compose |
| `SERVER_TZ` | O | IANA/approved time-zone identifier; operational timestamps should remain UTC where required | No | Infrastructure; time check |
| `JWT_SECRET` | R | All authentication consumers; at least 64 characters under startup validation | Yes | Security/infrastructure; secret reference and auth test |
| `JWT_REFRESH_SECRET` | R where refresh tokens are issued | Distinct high-entropy signing secret | Yes | Security/infrastructure; rotation/revocation test |
| `JWT_ISSUER` | O | Exact approved token issuer string shared by issuers/verifiers | No | Security; token test |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | O | Positive duration strings supported by token library/config | No | Security/product; session test |
| `ADMIN_JWT_EXPIRES_IN` | R | Duration; production validation requires 30 minutes or less | No | Security; admin session test |
| `ADMIN_MFA_REQUIRED` | R | Exact `true` in production | No | Security/owner; startup and MFA test |
| `BCRYPT_ROUNDS` | O | Approved positive work-factor integer; benchmark before change | No | Security/infrastructure; performance/security evidence |
| `AUTH_RATE_LIMIT_MAX`, `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS` | O | Positive decimal counts/milliseconds | No | Security/platform; load and abuse tests |
| `TRUST_PROXY` | C | Proxy-hop policy used only with the approved Caddy/Cloudflare provenance model | Sensitive | Security/infrastructure; forwarded-IP tests and topology evidence |
| `REQUIRE_REDIS` | O | Exact boolean; production defaults fail closed when Redis is required | No | Infrastructure; degraded/failure test |
| `ENABLE_SOCKET_IO`, `ENABLE_SOCKET_ADAPTER` | C | Exact booleans; Socket.IO/Redis adapter only on approved services | No | Realtime/infrastructure; room and failover tests |

## Browser trust, URLs and domains

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `ALLOWED_ORIGINS` | R | Backend CORS; comma-separated absolute approved origins | Sensitive | Security/infrastructure; CORS tests |
| `WEB_SESSION_ORIGINS` | R | Comma-separated absolute origin-to-role mappings; must cover user, counsellor and admin | Sensitive | Security; startup/CSRF/session tests |
| `PASSWORD_RESET_BASE_URL` | R | Canonical non-placeholder HTTPS application origin; startup enforces the approved production URL | No | Product/security; reset-link test |
| `CHECKOUT_RETURN_URL` | C | Approved HTTPS browser return URL for checkout; never payment truth | No | Product/payments; staging redirect test |
| `API_BASE_URL`, `API_PUBLIC_URL`, `PUBLIC_WEB_BASE_URL` | C | Absolute URL used by backend/client/tooling where referenced | No | Engineering/infrastructure; smoke test |
| `FRONTEND_API_ADMIN_URL`, `FRONTEND_API_WEB_URL`, `FRONTEND_APP_URL`, `FRONTEND_SOCKET_WEB_URL`, `FRONTEND_WWW_URL` | R for corresponding images | Absolute public URLs compiled/injected into frontends | No | Infrastructure; build manifest and browser test |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ADMIN_API_URL`, `NEXT_PUBLIC_SOCKET_URL` | R for corresponding Next.js app | Public absolute URLs; client-visible | No | Web owner; production build and browser test |
| `APP_DOMAIN`, `WWW_DOMAIN`, `ROOT_DOMAIN`, `COUNSELLOR_DOMAIN`, `ADMIN_DOMAIN`, `CALLS_DOMAIN`, `API_IOS_DOMAIN`, `API_ANDROID_DOMAIN`, `API_WEB_DOMAIN`, `API_ADMIN_DOMAIN` | R for production routing | DNS hostnames only, no scheme/path/credentials | No | `INFRASTRUCTURE ACTION`; tunnel/Caddy/DNS evidence |
| `PUBLIC_EMAIL`, `EMAIL_FROM` | R where displayed/sent | Approved public contact and valid sender identity | Sensitive | `OWNER ACTION`, `LEGAL ACTION`, vendor owner; delivery proof |

## MongoDB and Redis

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `MONGODB_URI` | R | API/worker credentialed MongoDB URI; approved replica set/auth source/options | Yes | DBA/infrastructure; secret reference and connectivity |
| `REDIS_URL` | R | Credentialed Redis URL where auth is used | Yes | Infrastructure; connectivity/fail-closed test |
| `MONGODB_BACKUP_URI` | R for backup | URI for dedicated backup identity | Yes | Backup/DBA; authentication and role check |
| `MONGODB_PRODUCTION_RESTORE_URI` | R for production restore | URI for scoped restore identity; never application runtime | Yes | DBA/infrastructure; maintenance verification |
| `MONGODB_RESTORE_TEST_URI` | R for restore test | URI for isolated restore-test database/instance | Yes | DBA/infrastructure; isolation check |
| `MONGODB_MONITORING_URI`, `REDIS_MONITORING_URL` | R for exporters | Least-privilege monitoring credentials | Yes | Infrastructure; exporter health and permission evidence |
| `MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD` | R for Mongo bootstrap/admin maintenance | Safe username and 32–1,024-character non-placeholder password; root identity | User: Sensitive; password: Yes | DBA/infrastructure; exact-role verification |
| `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD` | R for first empty-volume initialization | Docker Mongo bootstrap aliases; must match `MONGO_ROOT_USER`/`MONGO_ROOT_PASSWORD` when present | User: Sensitive; password: Yes | DBA/infrastructure; name-only consistency check |
| `MONGO_APP_USER`, `MONGO_APP_PASSWORD` | R | Application managed identity; distinct safe username/password | User: Sensitive; password: Yes | DBA/infrastructure; `readWrite@menorah` role proof |
| `MONGO_BACKUP_USER`, `MONGO_BACKUP_PASSWORD` | R | Backup managed identity; distinct safe username/password | User: Sensitive; password: Yes | DBA/infrastructure; `backup@admin` role proof |
| `MONGO_RESTORE_USER`, `MONGO_RESTORE_PASSWORD` | R | Production restore identity; distinct safe username/password | User: Sensitive; password: Yes | DBA/infrastructure; scoped restore-role proof |
| `MONGO_MONITOR_USER`, `MONGO_MONITOR_PASSWORD` | R | Monitoring identity; distinct safe username/password | User: Sensitive; password: Yes | DBA/infrastructure; monitor-role proof |
| `MONGO_KEYFILE_PATH` | R for replica set | Absolute protected path to MongoDB internal-auth keyfile | Sensitive; file contents are Yes | Infrastructure; permissions/name-only evidence |
| `MONGODB_REPLICA_SET_NAME` | R | Safe replica-set identifier matching MongoDB and every URI | No | DBA; replica status |
| `MONGO_PRIMARY_HOST`, `MONGO_REPLICA_SET_MEMBERS` | C internal replica initialization | Approved internal primary hostname and exact member description generated by deployment configuration | Sensitive | DBA/infrastructure; rendered Compose and replica status |
| `MONGODB_READ_PREFERENCE` | O | Approved MongoDB read preference | No | DBA/engineering; consistency review |
| `MONGODB_RETRY_WRITES` | O | Exact boolean consistent with replica-set/transaction requirements | No | DBA; transaction tests |
| `MONGODB_MAX_POOL_SIZE`, `MONGODB_SERVER_SELECTION_TIMEOUT_MS`, `MONGODB_SOCKET_TIMEOUT_MS` | O | Positive decimal tuning values | No | DBA/platform; capacity evidence |
| `MONGO_ROTATE_CREDENTIALS_CONFIRM` | C maintenance only | Must be unset for routine release; exact maintenance confirmation is documented in `menorah/deploy/mongo/README.md` | Sensitive | `INFRASTRUCTURE ACTION`; approved rotation record |
| `MONGO_BOOTSTRAP_DRY_RUN`, `MONGO_BOOTSTRAP_SCOPE`, `MONGO_RECONCILE_DRY_RUN` | C internal release channel only | The guarded updater sets exact read-only/apply and atomic backup-only/full scope modes and rejects operator-supplied values | No | Engineering/infrastructure; release-script evidence |

The root identity plus the four managed identities must use five pairwise
distinct usernames and five pairwise distinct passwords under the
bootstrap/reconciliation contract. The guarded updater may atomically create
and authenticate only a missing backup identity before its mandatory backup.
Under the guarded writer-stop marker, create-only bootstrap may add all other
missing candidate-managed identities; it authenticates configured credentials
before continuing. Routine reconciliation changes roles only and must not
rotate passwords.

## Encryption, audit, privacy and counsellor verification

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `DATA_ENCRYPTION_KEY` | R | API/worker protected-field encryption; at least 32 non-placeholder characters; distinct from audit key | Yes | Security/infrastructure; key custody and decrypt/recovery test |
| `AUDIT_LOG_SIGNING_KEY` | R | Security/privacy audit HMAC; at least 32 non-placeholder characters; same approved reference across service scopes | Yes | Security/infrastructure; chain verification |
| `SECURITY_AUDIT_PENDING_MAX` | O | Integer bounded by code to 128–8,192; capacity-review override | No | Security/platform; outage/load evidence |
| `MAX_PAYOUT_AMOUNT_PAISE` | R | Exact owner-approved decimal integer enforced by source validation | No | Finance/owner; startup and payout tests |
| `KYC_CONSENT_VERSION`, `KYC_RETENTION_DAYS` | R | Exact approved face-check consent version and decimal retention setting enforced by source | No | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`; approval and startup evidence |
| `COUNSELLOR_ONBOARDING_CONSENT_VERSION`, `COUNSELLOR_CREDENTIAL_POLICY_VERSION` | R | Non-placeholder approved bounded version identifiers | No | `CLINICAL ACTION`, `LEGAL ACTION`, owner; versioned consent tests |
| `COUNSELLOR_ONBOARDING_NOTICE_URL` | R | Public non-loopback HTTPS URL; no embedded credentials/reserved example host | No | Clinical/legal/privacy; reachable approved notice |
| `PRIVACY_NOTICE_VERSION` | R | Non-placeholder approved bounded version identifier | No | `LEGAL ACTION`, `PRIVACY ACTION`; published notice |
| `PRIVACY_RETENTION_POLICY_JSON` | R | JSON with exact source-defined categories, version, mode and policy reference; periods only when approved | Sensitive | Legal/privacy/owner; signed retention schedule |
| `PRIVACY_RETENTION_EXECUTION_ENABLED` | R | Exact `true` or `false`; keep `false` until approval and staging evidence | No | Privacy/owner; activation record |
| `PRIVACY_RETENTION_BATCH_SIZE` | O | Positive bounded integer used by retention worker | No | Privacy/platform; worker test |
| `ADMIN_ROLE_GRANTS_JSON` | R for `api-admin` | Explicit mapping of approved active admin IDs to exactly one of `support`, `finance`, `content` or `admin`; must include a full administrator | Sensitive | `OWNER ACTION`; startup/live-assignment tests and access review |
| `PRIVACY_ADMIN_PERMISSION_GRANTS_JSON` | R | Explicit task-permission mapping to approved active admin IDs; no implicit all-admin access | Sensitive | `OWNER ACTION`, `PRIVACY ACTION`; startup/session authority test |

## Payments and payouts

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `RAZORPAY_KEY_ID` | R for payment-capable APIs | Non-placeholder `rzp_test_…` or `rzp_live_…` format accepted by validation | Sensitive | Payment vendor/finance; account and test-mode evidence |
| `RAZORPAY_KEY_SECRET` | R for payment-capable APIs | 16–256 non-placeholder characters, no control/edge whitespace | Yes | Payment vendor/infrastructure; secret reference |
| `RAZORPAY_WEBHOOK_SECRET` | R | Current booking-payment webhook signing secret | Yes | Payment vendor/security; signed/invalid callback tests |
| `RAZORPAY_WEBHOOK_SECRET_PREVIOUS` | O rotation overlap | If set, same validity rules and must differ from current | Yes | Payment owner/security; overlap and removal record |
| `BOOKING_PAYMENTS_ENABLED` | R | Exact boolean; keep `false` until launch gates pass | No | `OWNER ACTION`, payments; go/no-go evidence |
| `BOOKING_SERVICE_CATALOG_JSON` | R | Valid source-defined server-authoritative catalogue JSON | Sensitive | Product/finance; pricing approval and tamper tests |
| `PAYMENT_WEBHOOK_MAX_PROCESSING_ATTEMPTS` | C | Integer 1–1,000; required before booking payments can be enabled | No | Payments/platform; retry/reconciliation tests |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | C | Client-visible key ID only; never the key secret | No | Web/payment owner; compiled build inspection |
| `PAYOUTS_ENABLED` | R | Exact boolean; keep `false` until payout gates pass | No | Finance/owner; dual-control go/no-go |
| `RAZORPAY_X_WEBHOOK_SECRET` | R for `api-admin` | Payout webhook signing secret even while initiation is disabled, for delayed events | Yes | Finance/vendor/security; callback tests |
| `RAZORPAY_X_KEY_ID`, `RAZORPAY_X_KEY_SECRET`, `RAZORPAY_PAYOUT_ACCOUNT_NUMBER` | C when payouts enabled | Valid non-placeholder key ID, 16–256-character secret, and 6–32-digit non-repeating account number | ID/account: Sensitive; secret: Yes | Finance/vendor; execution and reconciliation proof |
| `SUBSCRIPTION_PAYMENTS_ENABLED` | R | Must remain exact `false`; source intentionally disables the flow | No | Product/payments; startup validation |

## Email and identity providers

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `RESEND_API_KEY` | R | Resend credential for production email | Yes | `VENDOR ACTION`; delivery/bounce/incident evidence |
| `RESEND_WEBHOOK_SECRET` | R for `api-web` | Resend/Svix webhook signing secret; at least 24 non-placeholder characters; raw-body signature and replay tests required | Yes | `VENDOR ACTION`, security; signed/invalid/replay callback evidence |
| `APPLE_SIGN_IN_ENABLED` | R for `api-ios`/worker | Exact `true` in production under startup validation | No | `APPLE ACTION`; auth test |
| `APPLE_IOS_BUNDLE_ID` | R | Exact approved iOS bundle identifier | No | `APPLE ACTION`; app/store record |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID` | R | Ten uppercase alphanumeric characters under validation | Sensitive | `APPLE ACTION`; account evidence |
| `APPLE_PRIVATE_KEY` | R | PKCS#8 private key, protected multiline injection | Yes | `APPLE ACTION`, infrastructure; key custody and token test |
| `APPLE_WEB_SERVICE_ID` | C web Apple sign-in | Approved Apple Services ID | Sensitive | `APPLE ACTION`; redirect/auth evidence |
| `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID` | C | OAuth client identifiers for enabled platform flows | Sensitive | `GOOGLE ACTION`; console/redirect and token-audience tests |

## Calls, meetings and regional policy

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_URL` | R | Approved WebSocket/public and internal API URLs | No | Realtime/infrastructure; call smoke tests |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | R | LiveKit server credentials | Yes | Realtime/infrastructure; secret reference and token test |
| `LIVEKIT_CONFIG_FILE` | R for self-hosted LiveKit | Absolute protected config path | Sensitive | Infrastructure; permissions/name-only check |
| `LIVEKIT_UPSTREAM` | C | Internal Caddy upstream endpoint | Sensitive | Infrastructure; rendered routing |
| `LIVEKIT_RTC_TCP_PORT`, `LIVEKIT_RTC_UDP_PORT_RANGE`, `LIVEKIT_NODE_IP` | C | Approved ports/range and node address | Sensitive | Infrastructure; firewall and media test |
| `CALL_JOIN_EARLY_MINUTES`, `CALL_JOIN_LATE_GRACE_MINUTES` | R | Non-negative approved integer policy windows | No | Product/clinical; authorization tests |
| `VIDEO_MEET_TICKET_TTL_SECONDS` | R | Short positive integer lifetime | No | Security/realtime; replay/expiry tests |
| `CALLING_REGION_MODE`, `LIVEKIT_BLOCKED_COUNTRIES`, `BLOCK_LIVEKIT_FOR_UAE`, `BLOCK_LIVEKIT_FOR_UNKNOWN_REGION` | R | Approved mode/list and exact booleans | No | `OWNER ACTION`, `LEGAL ACTION`; region tests |
| `UAE_CALLING_ENABLED`, `UAE_CALL_PROVIDER`, `BLOCKED_COUNTRY_CALL_PROVIDER` | C | Exact boolean and approved provider identifiers | No | Owner/legal/vendor; fallback evidence |
| `GOOGLE_MEET_ENABLED`, `DOXY_ENABLED`, `VSEE_ENABLED`, `ZOOM_ENABLED`, `TEAMS_ENABLED` | C | Exact booleans; disabled unless provider pack is complete | No | `VENDOR ACTION`, owner; feature tests |
| `VSEE_INTEGRATION_MODE` | C | Approved bounded integration-mode identifier | No | Vendor/product; integration evidence |
| `LUXAND_API_TOKEN` | C | Face-check vendor token | Yes | `VENDOR ACTION`, privacy; secret and deletion evidence |
| `LUXAND_DETECT_URL`, `LUXAND_FACE_CONFIDENCE_THRESHOLD` | C | Approved HTTPS endpoint and reviewed numeric threshold | No | Vendor/privacy/clinical; accuracy and failure tests |

## Media storage and uploads

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `MEDIA_STORAGE_BACKEND` | R | Exact `local` in production; source rejects Cloudinary as the production backend | No | Infrastructure/privacy; startup check |
| `MEDIA_PUBLIC_BASE_URL` | R with local media | Non-loopback absolute HTTPS origin | No | Infrastructure; upload/read smoke test |
| `UPLOAD_PATH` | R | Absolute or resolved protected managed-media path included in backup contract | Sensitive | Infrastructure; permissions and restore proof |
| `MAX_FILE_SIZE`, `EKYC_MAX_FILE_SIZE` | O | Positive decimal byte limits | No | Security/product; boundary tests |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | C non-production/approved future backend | Cloud name/key/secret; not sufficient to override the production-local requirement | Name/key: Sensitive; secret: Yes | `VENDOR ACTION`, privacy; disabled or reviewed evidence |
| `CLOUDINARY_SOCIAL_STUDIO_FOLDER`, `CLOUDINARY_SOCIAL_STUDIO_ASSET_FOLDER` | C | Safe vendor folder identifiers | Sensitive | Content/vendor owner |

## AI, Social Studio and Meta

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `OPENAI_API_KEY`, `SOCIAL_STUDIO_OPENAI_API_KEY` | C | OpenAI credentials for explicitly enabled feature | Yes | `VENDOR ACTION`, owner/privacy; secret and data-flow evidence |
| `AI_PROVIDER`, `AI_TEXT_MODEL`, `AI_IMAGE_MODEL`, `AI_MOCK_MODE` | C/O | Approved provider/model identifiers and exact mock boolean | No | Product/vendor; feature and failure tests |
| `SOCIAL_STUDIO_ENABLED`, `SOCIAL_STUDIO_AUTO_PUBLISH` | C | Exact booleans; keep auto-publish off without approved workflow | No | `OWNER ACTION`, content |
| `SOCIAL_STUDIO_AI_PROVIDER`, `SOCIAL_STUDIO_AI_TEXT_MODEL`, `SOCIAL_STUDIO_AI_IMAGE_MODEL`, `SOCIAL_STUDIO_AI_IMAGE_FORMAT`, `SOCIAL_STUDIO_AI_IMAGE_QUALITY`, `SOCIAL_STUDIO_AI_IMAGE_SIZE`, `SOCIAL_STUDIO_AI_IMAGE_TIMEOUT_MS` | C | Approved bounded identifiers/options and positive timeout | No | Content/vendor; generated-content QA |
| `SOCIAL_STUDIO_GENERATION_RATE_LIMIT`, `SOCIAL_STUDIO_MAX_POSTS_PER_RUN` | C | Positive bounded integers | No | Content/platform; rate tests |
| `META_APP_ID` | C | Meta application identifier | Sensitive | `VENDOR ACTION`; account ownership |
| `META_APP_SECRET`, `SOCIAL_TOKEN_ENCRYPTION_KEY` | C | Meta credential and distinct token-encryption key | Yes | Vendor/security; custody and revocation |
| `META_GRAPH_API_VERSION` | C | Explicit supported version identifier | No | Vendor/content; compatibility evidence |

## Worker and scheduler controls

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `ENABLE_ARTICLE_SCHEDULER`, `ENABLE_SOCIAL_SCHEDULER`, `ENABLE_EMAIL_JOBS`, `ENABLE_NOTIFICATION_JOBS`, `ENABLE_BACKUP_JOBS` | C | Exact booleans; only the designated worker may run approved schedulers | No | Platform/product; single-worker and job tests |
| `BACKUP_AUTOMATION_ENABLED` | R for production worker/admin status | Exact boolean matching host-owned timer design | No | Infrastructure; timer status |

## Backup and recovery

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `MENORAH_BACKUP_ROOT`, `BACKUP_ROOT` | R for host tools/containers | Approved absolute mounted backup root | Sensitive | Infrastructure; resolved path/mount evidence |
| `BACKUP_ENCRYPTION_PASSWORD`, `BACKUP_INTEGRITY_HMAC_KEY` | R | Distinct high-entropy encryption and integrity secrets | Yes | `OWNER ACTION`, infrastructure; custody and recovery test |
| `BACKUP_REQUIRE_ENCRYPTION`, `BACKUP_REQUIRE_MOUNT`, `BACKUP_EXPECT_RAID` | R | Exact booleans matching approved production storage | No | Infrastructure; fail-closed tests |
| `BACKUP_RAID_DEVICE` | C | Exact approved block-device/mount identifier; never guessed | Sensitive | Infrastructure; host inventory |
| `BACKUP_MAX_AGE_HOURS`, `BACKUP_RESTORE_TEST_MAX_AGE_HOURS`, `BACKUP_MIN_SIZE_BYTES`, `BACKUP_DISK_USAGE_MAX_PERCENT` | R | Positive bounded numeric health thresholds | No | Owner/infrastructure; health-check output |
| `SIX_HOURLY_RETENTION_DAYS`, `DAILY_RETENTION_DAYS`, `WEEKLY_RETENTION_DAYS`, `MONTHLY_RETENTION_DAYS` | R | Positive integers. Source defaults are not legal/owner approval | No | `OWNER ACTION`, `LEGAL ACTION`, `PRIVACY ACTION`; approved schedule |
| `BACKUP_COLD_STORAGE_LABEL`, `BACKUP_STATUS_GROUP`, `BACKUP_METRICS_RUN_AS` | C | Approved non-secret label/group/numeric host identity | Sensitive | Infrastructure; permissions and off-site evidence |
| `BACKUP_HEALTH_PUSH_URL` | C | Credential-bearing private health-push URL when used | Yes | Infrastructure; secret reference and controlled test |

## Monitoring and alerting

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `ALERTMANAGER_CONFIG_FILE` | R | Absolute host path outside repository to approved receiver configuration | Sensitive; referenced credentials are Yes | Infrastructure; permissions and checksum |
| `ALERTMANAGER_CONFIG_SHA256` | R | Lowercase/approved SHA-256 digest of effective config | Sensitive | Infrastructure; validation output |
| `ALERTMANAGER_DELIVERY_RECEIVER`, `ALERTMANAGER_DELIVERY_TEST_REFERENCE`, `ALERTMANAGER_DELIVERY_VERIFIED_AT` | R | Approved receiver name, bounded evidence reference and timestamp; no token/URL | Sensitive | Infrastructure/owner; receiver-side proof |
| `SERVER_USAGE_LABEL`, `SERVER_USAGE_PATH` | C | Safe display label and restricted metrics/status path | Sensitive | Infrastructure/security; admin authorization test |
| `GRAFANA_LOCAL_PORT`, `UPTIME_KUMA_LOCAL_PORT`, `ALERTMANAGER_LOCAL_PORT` | O | Full `127.0.0.1:PORT` endpoints; values are deliberately compatible with both candidate and predecessor Compose files | Sensitive | Infrastructure; rendered-model/listener check |

## Host paths, networks, certificates and ports

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `MENORAH_DATA_ROOT`, `MENORAH_SECRETS_ROOT` | R | Approved absolute host paths with restrictive ownership/modes | Sensitive | Infrastructure; name/mode evidence |
| `MENORAH_MEDIA_GROUP_ID` | R | Decimal primary GID of the production operator (`id -g`); shared media is `100:<gid>` mode `2770` and application writers receive this supplemental group | Sensitive | Infrastructure; exact `stat` plus UID-100 read test |
| `COMPOSE_PROJECT_NAME` | R | Safe stable Compose project identifier | No | Infrastructure; rendered model |
| `APP_NETWORK_SUBNET`, `TUNNEL_INGRESS_SUBNET` | R | Approved private CIDRs without overlap | Sensitive | Infrastructure/security; network inspection |
| `CADDY_APP_IP`, `CADDY_TUNNEL_IP`, `CLOUDFLARED_TUNNEL_IP` | R | Approved static internal addresses within declared subnets | Sensitive | Infrastructure; rendered model |
| `CADDY_HTTP_PORT` | R | Approved full `127.0.0.1:PORT` endpoint; bare numeric values are forbidden because predecessor rollback would publish them on all interfaces | Sensitive | Infrastructure; local socket/firewall check |
| `API_IOS_LOCAL_PORT`, `API_ANDROID_LOCAL_PORT`, `API_WEB_LOCAL_PORT`, `API_ADMIN_LOCAL_PORT`, `WORKER_LOCAL_PORT`, `LANDING_LOCAL_PORT`, `USER_WEB_APP_LOCAL_PORT`, `WEB_APP_LOCAL_PORT`, `ADMIN_PANEL_LOCAL_PORT` | R for corresponding service | Unique full `127.0.0.1:PORT` endpoints; bare numeric values are forbidden so predecessor rollback remains loopback-only | Sensitive | Infrastructure; Compose and health evidence |
| `CLOUDFLARE_TUNNEL_TOKEN_FILE` | R for tunnel | Docker secret/file reference, not token contents | Sensitive; contents are Yes | `INFRASTRUCTURE ACTION`; mount/name-only check |
| `CLOUDFLARE_ORIGIN_CERT_FILE`, `CLOUDFLARE_ORIGIN_CERT_PATH` | C | Approved certificate source/path | Sensitive | Infrastructure; certificate/expiry check |
| `CLOUDFLARE_ORIGIN_KEY_FILE`, `CLOUDFLARE_ORIGIN_KEY_PATH` | C | Protected private-key source/path | Yes | Infrastructure/security; mode and certificate match |

## Frontend and mobile public build variables

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | C | Browser-visible Google OAuth client ID | No | `GOOGLE ACTION`; build and console evidence |
| `NEXT_PUBLIC_JITSI_DOMAIN` | C | Browser-visible approved meeting hostname | No | Vendor/product; call test |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` | C | Mobile-client-visible OAuth identifiers/scheme | No | `GOOGLE ACTION`; compiled app/token tests |

## One-time bootstrap variables

| Variable(s) | Class | Consumer and required format | Secret | Owner and evidence |
| --- | --- | --- | --- | --- |
| `ADMIN_BOOTSTRAP_CONFIRM` | C | Exact one-time confirmation expected by bootstrap workflow | Sensitive | `OWNER ACTION`, security; change record |
| `ADMIN_BOOTSTRAP_EMAIL` | C | Approved initial admin email | Sensitive | Owner/security; account record |
| `ADMIN_BOOTSTRAP_PASSWORD` | C | Strong one-time password; remove/unset after bootstrap and rotate through normal flow | Yes | Owner/security; bootstrap and removal proof |

## Variables that must be unset in production

| Variable | Class | Reason |
| --- | --- | --- |
| `PASSWORD_RESET_URL_TEMPLATE` | U | Startup validation requires the canonical base URL instead of an arbitrary template |
| `SESSION_COOKIE_DOMAIN` | U | Host-only `__Host-` session cookies must not receive a Domain attribute |
| `COUNSELLOR_MEDIA_STORAGE` | U | `MEDIA_STORAGE_BACKEND` is the single production selector |
| `SOCIAL_STUDIO_STORAGE` | U | `MEDIA_STORAGE_BACKEND` is the single production selector |
| `MONGO_ROTATE_CREDENTIALS_CONFIRM` | U for routine release | Credential rotation is a separate quiesced maintenance workflow |
| `MONGO_RECONCILE_DRY_RUN` | U for routine release | The guarded updater owns read-only preflight versus maintenance apply mode |
| `MONGO_BOOTSTRAP_DRY_RUN` | U for routine release | The guarded updater owns missing-identity preflight versus guarded create-only apply mode |
| `MONGO_BOOTSTRAP_SCOPE` | U for routine release | The guarded updater alone selects the atomic `backup-only` or full candidate/recovery scope |
| `CADDY_HTTPS_PORT` | U | Retired; Tunnel traffic terminates at the reviewed internal HTTP listener and the updater rejects this legacy host binding |

## Internal and test-only environment channels

Repository scripts also use short-lived process variables to pass already
validated metadata between shell and Node/mongosh helpers. Examples include
the prefixes `ARTIFACT_*`, `BACKUP_METADATA_*`, `BACKUP_HEALTH_*`,
`BACKUP_PRUNE_*`, `RELEASE_META_*`, `RESTORE_MARKER_*`, `RESTORE_STATE_*` and
`RESTORE_TEST_*`, plus validation inputs such as `EXPECTED_*`. These are
implementation channels created by the guarded scripts, not persistent
operator configuration. Do not add or override them in production env files.

`SECURITY_AUDIT_TEST_OUTPUT` and `SECURITY_AUDIT_DURABLE_TEST_OUTPUT` are
test-only switches. They must be unset in production.

## Release evidence procedure

1. Generate the expected **names** from the tracked sources and compare them to
   the protected environment without printing either values or full
   credentialed URIs.
2. Assign every name to a service/operation and one row above. Unclassified
   names block release until reviewed.
3. Run backend startup validation independently for each API/worker service.
4. Render Compose with the protected env on the target host using
   `docker compose ... config --quiet`; never archive the rendered model if it
   contains secrets.
5. Verify client bundles contain only approved public values.
6. Record secret references/versions and custodians, never values.
7. Test missing, placeholder, malformed and inconsistent inputs in isolated
   environments.
8. `INFRASTRUCTURE ACTION`: retain a redacted pass/fail matrix keyed by release
   SHA, service, validator and timestamp.
9. `OWNER ACTION`: approve any optional feature that becomes enabled.
10. `LEGAL ACTION`, `PRIVACY ACTION`, `CLINICAL ACTION`, `APPLE ACTION`,
    `GOOGLE ACTION` and `VENDOR ACTION`: approve the variables in their
    respective scope before activation.
