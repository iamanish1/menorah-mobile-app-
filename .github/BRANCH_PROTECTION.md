# GitHub Governance Baseline

This file documents the repository's recommended GitHub controls. It does not
configure GitHub, grant deployment access, or prove that any control is active.

## Protected Branch Rules

Apply a repository ruleset to `main` and `release/**`:

- Require a pull request and at least one approval from a reviewer other than
  the last person who pushed.
- Dismiss stale approvals and require all review conversations to be resolved.
- Require the branch to be current before merge.
- Require these stable status checks:
  - `Production release readiness`
  - `Required functional release gates`
  - `Required security gates`
- Block force pushes and branch deletion.
- Limit bypass to named emergency maintainers, require a documented incident or
  change reference for every bypass, and review bypass activity afterward.
- Require approval for changes to `.github/workflows/**`,
  `menorah/deploy/**`, `menorah/backend/src/database/migrations/**`, and the
  production runbooks. Add matching CODEOWNERS entries only after the owner
  supplies the responsible GitHub teams; do not invent team names.

Protect production release tags such as `v*` against update and deletion. A tag
must resolve to the exact reviewed commit recorded in the release evidence.

> OWNER ACTION: create or update the GitHub rulesets, select the responsible
> reviewers and emergency bypass maintainers, and verify both required check
> names from a pull request before enforcing them. Repository files cannot
> create, inspect, or attest to these settings.

## Merge And Release Evidence

- Use the pull request template for scope, test, migration, recovery, and
  external-action evidence.
- Record the immutable release SHA in the release evidence template after the
  final reviewed push.
- Do not treat a branch name, successful CI run, GitHub release, or tag as
  production authorization by itself.
- Production remains an operator-only action through
  `menorah/deploy/ubuntu/update-from-git.sh` on the Ubuntu host. GitHub Actions
  release readiness declares no environment, host/cloud credential, registry
  write permission, or deployment job.
