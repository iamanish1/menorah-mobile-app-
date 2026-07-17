# Security Incident Remediation

Last reviewed: 2026-07-17.

## Production environment snapshot

The `production.env.pre-clean-slate-*` snapshot name was checked across every local Git ref and reachable object without displaying file contents. No matching Git path or object was found. This does not prove the host copy was absent from filesystem snapshots, backups, shell transfers, support bundles, or shared storage.

On the production host, remove the redundant snapshot after confirming the canonical environment file is backed up in the approved encrypted secret store. Search backup inventories and shared storage by filename only. If any copy left the host or entered a backup outside the approved encrypted store, rotate every credential represented in that snapshot. Do not mark rotation complete until each provider has issued a replacement and the old credential has been revoked and tested as invalid.

## Android signing credential incident

Commit `d9bb6686738c1c9aeeebc539cb83e9b62861ec85` contains `menorah/mobile-app/credentials.json` with non-placeholder Android keystore and key passwords. The keystore file itself was not found in reachable Git objects. The password values were not displayed during this review. Rotation has not been performed.

### Credential rotation

1. Freeze Android production signing and disable affected CI/EAS build credentials until ownership is confirmed.
2. In Google Play Console, confirm whether Play App Signing is enabled and record whether the exposed credential protected an upload key or the app-signing key.
3. If it is an upload key, generate a new upload keystore on a secured workstation, request an upload-key reset in Play Console, and replace the EAS/CI keystore plus `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` secrets. Revoke/delete every old CI, EAS, backup, and workstation copy after one signed internal-track build succeeds.
4. If Play App Signing is not enabled or the affected key is the app-signing key, stop release work and use the Play Console app-signing key upgrade/emergency support flow before generating a release. Do not replace that key ad hoc; doing so can prevent installed apps from accepting updates.
5. Rotate any other account or service password that reused either exposed password, then verify the old values no longer authenticate anywhere.

### Coordinated Git history remediation

History rewriting disrupts every clone and open branch. Schedule a repository-wide maintenance window, protect a pre-rewrite archive in restricted incident storage, and then run from a fresh mirror clone with `git-filter-repo` installed:

```bash
git clone --mirror <REPOSITORY_URL> menorah-history-clean.git
cd menorah-history-clean.git
git filter-repo --path menorah/mobile-app/credentials.json --invert-paths --force
git log --all -- menorah/mobile-app/credentials.json
gitleaks git . --redact --no-banner
git push --force --all origin
git push --force --tags origin
```

After the push, ask GitHub Support to purge cached commit/blob views where required, invalidate affected Actions artifacts and caches, and have fork owners remove the file from their histories. Every contributor must delete or archive the old clone and clone the rewritten repository again. Remove the two incident fingerprints from `.gitleaksignore` only after all active branches and tags use the rewritten history and the all-history scan passes.
