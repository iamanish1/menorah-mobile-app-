# Uptime Kuma Monitors

Create HTTP keyword or status-code monitors for:

- `https://www.menorah.me`
- `https://app.menorah.me`
- `https://admin.menorah.me`
- `https://api-ios.menorah.me/health/ready`
- `https://api-android.menorah.me/health/ready`
- `https://api-web.menorah.me/health/ready`
- `https://api-admin.menorah.me/health/ready`
- `https://calls.menorah.me`

Alert channels:

- Telegram for urgent outage notices.
- Email for daily/weekly summaries.
- SMS or WhatsApp for production outage escalation if available.

Do not monitor `/health/deep` from public internet unless the endpoint is protected or rate-limited. Use it from private monitoring.
