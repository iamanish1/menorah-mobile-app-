# App Store Review Notes

Reviewer account:
APPLE ACTION — create a dedicated reviewer account and place its credentials only in App Store
Connect immediately before submission. No reviewer credentials are stored in this repository.

Menorah Health provides mental wellness support, peer support, self-help tools, educational resources, private chat, and booking for support sessions. It does not diagnose, treat, cure, or replace professional medical care.

User-generated content safety:
In-app reporting and blocking are not currently available. Chat safety menus direct users to the Community Guidelines and Support without claiming that a moderation action was submitted.

Privacy:
Privacy Policy is available at: [APPLE ACTION — ADD VERIFIED PUBLIC URL]
Terms of Service is available at: [APPLE ACTION — ADD VERIFIED PUBLIC URL]
Community Guidelines are available in the app at Settings > Support > Community Guidelines.
Account deletion is available at: Settings > Account > Delete Account.

Crisis disclaimer:
This app is not an emergency service. If a user is in immediate danger, may harm themselves or someone else, or needs urgent medical help, they should contact local emergency services immediately.

Payments:
This release exposes Razorpay only for real-time one-to-one support-session bookings. New digital subscription purchases are disabled on both iOS and Android, and the app does not offer an external-checkout or web-link workaround. Keep digital purchases disabled until the applicable store-billing implementation and policy review are complete.

Notes for Apple reviewer:
Backend production API must be online during review.
Please use the demo account supplied in App Store Connect to access account, chat, booking,
support, privacy, and account deletion flows.
If testing payments, use the approved sandbox/test payment path provided in App Review notes before submission.

Repository/mobile security notes:
Authenticated screens and password-reset entry are configured to block screenshots/screen
recording. iOS app-switcher snapshots are configured to be obscured. Password reset Universal
Links are limited to
`https://app.menorah.me/reset-password` and accept a single-use token only from the URL fragment.

External completion:
Follow `docs/mobile-store-external-actions.md` for the required signed-device, website association,
privacy-report, reviewer-account, and store-console work. These actions cannot be completed from
the repository.
