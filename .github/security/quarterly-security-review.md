# Quarterly ASVS Level 2 and penetration-test review

- [ ] Assign an independent reviewer and define the in-scope production and staging hosts.
- [ ] Review every applicable OWASP ASVS Level 2 control and attach evidence or a tracked exception.
- [ ] Run the complete route-level IDOR and role-authorization matrix with user, counsellor, administrator, and unauthenticated identities.
- [ ] Commission an external authenticated penetration test covering the web apps, mobile APIs, payments, video, chat, and administration.
- [ ] Review Cloudflare WAF/rate-limit events and tune rules without weakening webhook signature checks.
- [ ] Review login, MFA, reset, CSRF, authorization, administrator, payout, and session lifecycle alerts.
- [ ] Verify databases, Redis, metrics, and logging services remain private and are not published by Docker or the Tunnel.
- [ ] Review all dependency-audit exceptions and image/SBOM findings; remove expired exceptions.
- [ ] Verify secret rotation records and all-history secret scanning, including forks, artifacts, backups, and shared storage.
- [ ] Record remediation owners, severity, due dates, retest evidence, and accepted residual risk.
