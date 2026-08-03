# Administrator operational authorization

This document describes the repository control. It does not assign production
staff, grant access, or contain secret values.

## Role-permission matrix

All four operational profiles authenticate with a database account whose
database `role` remains `admin`. `ADMIN_ROLE_GRANTS_JSON` independently maps
each active admin account ID to exactly one operational profile. The map is
parsed on every request, so a removed or changed assignment takes effect
without waiting for the access token to expire.

| Function | support | finance | content | admin |
| --- | --- | --- | --- | --- |
| User/account support read | Allow | Deny | Deny | Allow |
| Booking and call-link support | Allow | Deny | Deny | Allow |
| Revenue and payout read | Deny | Allow | Deny | Allow |
| Request and approve payouts | Deny | Allow | Deny | Allow |
| Article and Social Studio content | Deny | Deny | Allow | Allow |
| Social Studio uploads/assets | Deny | Deny | Allow | Allow |
| Counsellor credential/clinical review | Deny | Deny | Deny | Allow |
| User face-check review | Deny | Deny | Deny | Allow |
| Privacy administration | Deny | Deny | Deny | Allow |
| Platform/server telemetry | Deny | Deny | Deny | Allow |

The `admin` profile is intentionally the only profile with clinical, privacy,
and platform permissions. It is not an alias for support or finance.

## Route-authentication matrix

| Route family | Token boundary | Operational permission | Additional control |
| --- | --- | --- | --- |
| `/api/admin/users`, `/stats/users`, `/bookings` | Admin audience | `support_read` | Support may list only user accounts; KYC and subscription fields are omitted |
| `/api/admin/bookings/:id/call-link` | Admin audience | `support_manage` | Fresh MFA and URL/provider policy validation |
| `/api/admin/revenue*`, payout lists | Admin audience | `finance_read` | Bounded pagination/filters |
| payout request | Admin audience | `finance_payout_request` | Payout feature gate and configured cap |
| payout approval | Admin audience | `finance_payout_approve` | Different administrator and fresh MFA remain required |
| `/api/articles/admin*` | Admin audience | `content_read` or `content_manage` | Mutations require `content_manage` |
| `/api/admin/social-studio*` | Admin audience | `content_manage` | Applies to searches, credentials, publishing, and uploads |
| counsellor credential/review routes | Admin audience | `clinical_read` or `clinical_manage` | Sensitive mutations retain fresh MFA |
| `/api/admin/ekyc*` | Admin audience | `clinical_read` or `clinical_manage` | Manual approve/reject require fresh MFA |
| `/api/privacy/*` admin routes | Admin audience | `privacy_access` | Separate privacy grant; payload/mutations also require fresh MFA |
| `/api/admin/stats`, `/server-usage` | Admin audience | `platform_read` | Full administrator only |
| `/api/auth/me`, admin password change | Admin audience | Live role assignment | Password change also requires current password, strong policy, and fresh MFA |
| admin logout and logout-all | Admin audience | None | Deliberately remains available after assignment removal |

Admin and user access tokens use different audiences and purposes. User and
counsellor tokens cannot enter an admin route, and an admin token cannot enter
a user-only route. Authentication also reloads the current account role,
active state, and session version from the database for every request.

## Configuration

The value is an exact JSON array. IDs below are non-production examples:

```text
ADMIN_ROLE_GRANTS_JSON=[{"adminId":"64f000000000000000000001","role":"admin"},{"adminId":"64f000000000000000000002","role":"support"},{"adminId":"64f000000000000000000003","role":"finance"},{"adminId":"64f000000000000000000004","role":"content"}]
```

Accepted roles are exactly `support`, `finance`, `content`, and `admin`.
Duplicate IDs, unknown fields, unknown roles, an empty map, or a map without a
full `admin` assignment fail closed. API-admin startup also verifies that
every referenced account exists, is active, and still has database role
`admin`.

`PRIVACY_ADMIN_PERMISSION_GRANTS_JSON` remains a separate authority. A privacy
grant cannot override the operational profile: only the full `admin` profile
has `privacy_access`.

**OWNER ACTION:** decide the named staff assignments for support, finance,
content, and full administrator; apply the IDs through the approved secret
configuration process; retain approval evidence; and review the map whenever
staff duties change. Use the fewest full-administrator assignments practical.
This blocks api-admin startup until completed.

## Sessions and password changes

There is deliberately no refresh-token endpoint or refresh-token purpose in
this service. User access tokens are finite-lived, admin access tokens default
to a shorter lifetime, and an expired token requires login. Therefore there
is no refresh token to rotate or replay-test.

Admin password change now:

1. requires a current admin token and a still-current operational assignment;
2. requires fresh MFA evidence;
3. verifies the current password;
4. applies the shared strong-password policy and rejects password reuse; and
5. increments `sessionVersion`, invalidating every existing device session.

The user/counsellor password-change route uses the same shared strength policy,
rejects reuse of the current password, and likewise invalidates every session.

Logout remains current-session revocation; logout-all increments
`sessionVersion` for all devices.

## Sensitive search, export, and files

Search permissions are inherited from the route family: support searches only
user accounts, finance searches finance records, content searches content
records, and clinical searches require the full administrator profile.
Privacy payload/export access requires both `privacy_access` and
`privacy_reviewer`, plus fresh MFA.

Social Studio asset upload, listing, editing, and deletion require
`content_manage`. The shared `/uploads` object path is intentionally a public
media origin used for user/counsellor profile presentation, article covers,
and published social assets; it is not an authenticated evidence store.
Counsellor credential evidence must therefore remain in an independently
access-controlled store and must not be copied into `/uploads`.

**PRIVACY ACTION / OWNER ACTION:** approve and record the classification of
every media category before launch. If any category is not intended to be
public, move it to a private object store with short-lived, object-authorized
delivery; do not rely on an unguessable `/uploads` URL.

## Bank-account changes

The existing counsellor bank-detail route is covered by focused regression
tests. It requires counsellor authentication and current-password
reauthentication, blocks changes while a payout is awaiting approval or
processing, stores the account number through authenticated encryption,
clears the old provider fund-account reference, and returns only a masked
account number. The existing safe security audit event remains in place.

**OWNER ACTION:** decide whether bank changes additionally require a second
factor, cooling-off period, out-of-band notification, or finance review. Those
controls are product/fraud policy decisions and are not invented by this
repository change.
