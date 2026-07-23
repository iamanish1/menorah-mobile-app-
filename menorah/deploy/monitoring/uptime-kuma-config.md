# Uptime Kuma independent monitor checklist

Uptime Kuma is a second, manually configured availability signal. It does not
replace Prometheus, and its SQLite configuration is not treated as
source-controlled evidence.

Create status-code or keyword monitors for:

- `https://www.menorah.me`
- `https://app.menorah.me`
- `https://admin.menorah.me`
- `https://counsellor.menorah.me`
- `https://api-ios.menorah.me/health/ready`
- `https://api-android.menorah.me/health/ready`
- `https://api-web.menorah.me/health/ready`
- `https://api-admin.menorah.me/health/ready`
- `https://calls.menorah.me`
- `https://mentle.org`
- `https://www.mentle.org`
- `https://mentle.mentle.org`
- `https://app.mentle.org`
- `https://business.mentle.org`
- `https://admin.mentle.org`
- `https://counsellor.mentle.org`
- `https://api.mentle.org/health/ready`
- `https://api-business.mentle.org/health/ready`
- `https://api-admin.mentle.org/health/ready`
- `https://api-counsellor.mentle.org/health/ready`
- `https://calls.mentle.org`

Use a 60-second interval, at least two retries, normal certificate validation,
and an independent network vantage point where available. Do not monitor
`/health/deep` from the public internet.

Notification destinations, credentials, escalation chains, and summary
recipients are an **INFRASTRUCTURE ACTION** requiring named owners and approval.
No destination is assumed or authorized by this checklist. After configuration,
run a controlled delivery test and retain screenshots of monitor status,
notification receipt, acknowledgement, and recovery.
