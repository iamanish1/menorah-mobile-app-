# Menorah Health Android store metadata

This directory is the reviewed repository source for the Google Play listing
used by the Android `2.7.0` release. It does not publish or update the Play
Console by itself.

## Release scope

- Store name: **Menorah Health**
- Package: `com.menorah.healthmobile`
- Release: `2.7.0`
- Platform: Android only
- Business model: paid, one-to-one counsellor bookings with the counsellor's
  hourly rate shown before booking

The English listing files are under [`en-US`](./en-US). Before submission, a
Google release owner must compare every Play Console field and screenshot with
these files and the exact Play-delivered candidate. Console-only reviewer
credentials, keys, certificate material, personal data and screenshots must
never be committed here.

Run the deterministic copy check before review:

```sh
node store-metadata/android/validate.mjs
```

It enforces Google Play text limits, the product name, required release
positioning and prohibited-claim patterns. A passing check does not replace
legal, privacy, clinical or Google review.

The limits follow Google's current
[store-listing guidance](https://support.google.com/googleplay/android-developer/answer/9859152)
and [release-note guidance](https://support.google.com/googleplay/android-developer/answer/9859348):
30 characters for the name, 80 for the short description, 4,000 for the full
description and 500 Unicode characters for release notes.

## Copy guardrails

The listing must describe only current, tested behavior. It must not claim
that the service is fully free, staffed by psychology students, available
24/7, absolutely confidential, diagnostic, or an emergency/crisis service.
It must not claim guaranteed outcomes, end-to-end encryption, recording, or
professional licensure beyond the evidence actually reviewed for an
individual counsellor.

Approved positioning for this release is:

- counsellors reviewed through Menorah's verification process;
- visible hourly rates and paid one-to-one bookings;
- secure in-app chat protected by account and booking authorization;
- optional wellbeing check-ins that are informational, not diagnostic; and
- educational articles and wellbeing resources.

The Google release owner must also complete Data Safety, Health Apps, target
age, account deletion, payment, notification/device-identifier, chat,
emergency-contact and reviewer-access declarations from verified production
facts. Store copy is not evidence that those declarations are complete.
