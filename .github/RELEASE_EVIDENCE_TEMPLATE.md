# Release Evidence

This template records review and recovery evidence. Completing it does not
deploy, authorize a deployment, or prove that external controls are active.

## Immutable Candidate

- Change reference:
- Reviewed branch:
- Full 40-character commit SHA:
- Source tree SHA:
- Release tag, if approved:
- Pull request and approvals:

## Required Checks

- `Production release readiness` run:
- `Required functional release gates` run:
- `Required security gates` run:
- Other test evidence:
- Passing:
- Failing:
- Skipped:
- Externally blocked:

## Migration And Artifacts

- Migration review/approval for the same commit SHA:
- Migration list and expected state:
- Immutable image IDs/digests:
- Image manifest checksum:
- Configuration validation:

## Backup And Recovery

- Fresh backup archive identity:
- Backup checksum:
- Restore-test evidence:
- Pre-migration rollback target:
- Post-migration recovery plan:
- Maintenance window and operator:

## Health And Handover

- Local health evidence:
- Public health evidence:
- Monitoring/alert delivery evidence:
- Release record path:
- Remaining owner, infrastructure, legal, privacy, clinical, finance, Apple,
  Google, or vendor actions:

> OWNER ACTION: approve the exact commit, migrations, maintenance window, and
> change reference before an operator invokes the sole production method in
> `menorah/docs/production-update-runbook.md`.
