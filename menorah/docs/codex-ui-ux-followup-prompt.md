# Codex Prompt For UI/UX Follow-Up Work

Copy this into Codex on the other laptop after opening the repo.

```text
You are working on the Menorah Health repo. First orient yourself before editing:

1. Run:
   - git status -sb
   - git branch --show-current
   - git pull --ff-only
2. Create a new working branch for UI/UX changes:
   - git switch -c ui-ux/<short-description>
3. Do not edit or commit host-only production secrets:
   - deploy/env/production.env
   - deploy/env/cloudflare.env
   - deploy/livekit/livekit.yaml
4. Keep production/ops behavior intact:
   - backup RAID/LUKS scripts and timers
   - admin Server Usage backup health cards
   - backend rate limiting behind Cloudflare
   - Docker production compose wiring
5. For UI/UX changes, prefer existing design patterns and component styles. Make the app usable first, not decorative.
6. If working on admin panel, run:
   - cd admin-panel && npm run build
7. If working on user web app, run:
   - cd user-web-app && npm run build
8. If working on counsellor web app, run:
   - cd web-app && npm run build
9. If working on mobile app, run:
   - cd mobile-app && npm run typecheck
   - cd mobile-app && npm run lint -- --quiet
10. Before committing:
   - git status -sb
   - git diff --check
   - confirm no secrets are staged
   - commit only the intended UI/UX changes

Current production notes:
- The active release branch before your work was architecture/self-host-cloudrun-failover.
- Android production build exists, iOS launch is deferred until Apple developer account review is complete.
- Article and Social Studio code exists, but AI generation is blocked until OpenAI quota/billing is fixed.
- Social Studio publishing still needs Instagram connection and production social env before real publishing.
- Daily/weekly/monthly backups are automated on the Ubuntu server; weekly cold storage is still manual.

Goal:
Improve UI/UX safely, keep the production stack stable, and leave a clear commit with the exact tests/builds you ran.
```
