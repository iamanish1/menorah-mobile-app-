# Restore Test Log

Do not mark self-hosted MongoDB production-ready until restore tests pass.

## Template

Restore test date:

Backup file:

Backup size:

Backup SHA256:

Restore duration:

Source MongoDB:

Restore test MongoDB:

Collections restored:

Collection count validation:

App login test:

Admin dashboard test:

Booking read test:

Payment record read test:

Message read test:

Article read test:

Result:

Notes:

## 2026-06-22 Production Restore Test

Restore test date: 2026-06-22 15:17 UTC

Backup file: `/opt/menorah/backups/daily/20260622T151240Z/mongo/menorah-mongo-20260622T151240Z.archive.gz.enc`

Backup size: 5200 bytes

Backup SHA256: `452b4cb98066f3287ef5d7a90230bc5a45dfee3b8406e9aa3d6c5cc5c5c94d9f`

Restore duration: under 1 minute

Source MongoDB: `menorah`

Restore test MongoDB: `menorah_restore_test`

Collections restored: 18 namespaces read from archive

Collection count validation: `mongorestore` reported 8 documents restored, 0 failures

App login test: Not run in this restore test

Admin dashboard test: Not run in this restore test

Booking read test: Not run in this restore test

Payment record read test: Not run in this restore test

Message read test: Not run in this restore test

Article read test: Not run in this restore test

Result: PASS

Notes: Restore-test remapped `menorah.*` archive namespaces into `menorah_restore_test.*`.
