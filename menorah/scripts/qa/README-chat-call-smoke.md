# Authenticated Chat And Call Smoke

Run this only from the Menorah production host:

```bash
bash scripts/qa/run-production-chat-call-smoke.sh
```

The check creates two unique `@menorahqa.test` accounts, a zero-value confirmed video booking, and two messages. It then validates public API login, Socket.IO delivery in both directions, LiveKit token issuance, and a two-browser WebRTC video-track connection with synthetic media. The token request uses the server loopback API by default so the India QA fixture is not reclassified by the production host's Cloudflare egress country; browser media still connects through the public calls hostname.

The runner does not log passwords, JWTs, LiveKit tokens, or email addresses. Its cleanup trap removes the QA users, counsellor profile, booking, chat room, messages, and the temporary LiveKit room. A real-device call on a normal network and a restrictive network remains a separate release check.
