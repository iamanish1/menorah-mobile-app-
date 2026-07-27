# TestFlight QA Checklist

Use this checklist on a real iPhone after installing a development build or TestFlight build. Test against the live API unless a staging API is explicitly configured.

## Build Setup
- [ ] Start from a fresh install.
- [ ] Confirm the build opens without Expo Go.
- [ ] Confirm the app uses the intended API base URL.
- [ ] Confirm no debug-only payment fallback is visible in the dev build.
- [ ] Confirm the app does not crash after being backgrounded and reopened.

## Auth
- [ ] Log in with the reviewer/demo account.
- [ ] Try an incorrect password and confirm the error is friendly.
- [ ] Try an empty email and password and confirm validation appears.
- [ ] Try an invalid email format and confirm validation appears.
- [ ] Try an unverified password account: confirm it receives no usable session, lands on email verification, and can request a new code.
- [ ] Try a counsellor and an admin account: confirm the patient app rejects both and does not retain either token.
- [ ] Open a protected deep link (booking, chat, profile, or article detail) while signed out: confirm it opens the sign-in flow rather than the protected screen.
- [ ] Log out.
- [ ] Log back in after logout.

## Registration
- [ ] Register a new test user with a unique email and phone number.
- [ ] Confirm duplicate email or phone errors are friendly.
- [ ] Confirm invalid phone format is rejected with a clear message.
- [ ] Confirm short password is rejected with a clear message.
- [ ] Complete OTP/email verification if required.

## Session Persistence
- [ ] Log in successfully.
- [ ] Force-close the app.
- [ ] Reopen the app and confirm the session is still active.
- [ ] Restart the phone or simulator and confirm the session still loads.
- [ ] Log out and confirm the session is cleared after app restart.
- [ ] While signed in, put the app offline or force a 5xx during startup: confirm it keeps the stored session and retries validation after connectivity returns or the app foregrounds.
- [ ] Make one authenticated call return 401: confirm the app clears its token, socket connection, chat state, and query cache, then returns to sign-in.
- [ ] Sign in as account A, open chat/bookings, log out, then sign in as account B: confirm no messages, bookings, or loading state from A appear.

## Profile And Settings
- [ ] Open profile home.
- [ ] Edit profile fields and save.
- [ ] Upload or change profile photo.
- [ ] Confirm camera/photo permission prompts are clear.
- [ ] Open Settings.
- [ ] Open notification/privacy settings.
- [ ] Open two-factor or security screens if present.
- [ ] Open Linked accounts, link Google/Apple with the current password, and verify the provider state updates without exposing provider subjects.
- [ ] Change the password and confirm the app signs out rather than leaving a revoked session in the UI.

## HTTPS Reset And Native Links
- [ ] Open a reset link at `https://app.menorah.me/reset-password?token=<test-token>` with the app installed: confirm it enters the reset screen and the token is not left in visible navigation/history.
- [ ] Open the same link without the app installed: confirm it falls back to the browser reset page.
- [ ] Before a native rollout, set real `APPLE_APP_LINK_TEAM_ID`, `APPLE_APP_LINK_BUNDLE_ID`, `ANDROID_APP_LINK_PACKAGE_NAME`, and `ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS` on the edge host; run `CHECK_PUBLIC=true CHECK_NATIVE_APP_LINKS=true deploy/ubuntu/health-check.sh` and require both association files to return valid JSON.

## Legal Pages
- [ ] Open Privacy Policy.
- [ ] Open Terms of Service.
- [ ] Open Community Guidelines.
- [ ] Confirm support/contact details are real and current.
- [ ] Confirm crisis/safety guidance is reachable from profile/settings and chat.

## Account Deletion
- [ ] Find Settings > Account > Delete Account or equivalent.
- [ ] Confirm the app explains retained data for legal, safety, payment, or dispute obligations.
- [ ] Submit a deletion request with a test account.
- [ ] Confirm the backend receives the request or the fallback support path is honest and actionable.

## Chat
- [ ] Open chat list.
- [ ] Start a chat from an available counsellor.
- [ ] Send a message.
- [ ] Receive or refresh messages.
- [ ] Confirm loading, empty, and error states.
- [ ] Turn internet off and confirm the error state is understandable.

## Report And Block
- [ ] Report a user from chat/profile where available.
- [ ] Report a message or content item where available.
- [ ] Block a user where available.
- [ ] Confirm each action reaches a real backend endpoint or clearly routes to support.
- [ ] Confirm moderation/community guideline links are visible.

## Booking
- [ ] Open counsellor list.
- [ ] Open counsellor profile.
- [ ] Select a date/time where available.
- [ ] Start booking from a specific counsellor.
- [ ] Start booking from guided/category flow.
- [ ] Confirm booking details before payment.
- [ ] Confirm cancel/failure states.
- [ ] Confirm booked sessions appear in bookings list.

## Payments
- [ ] Confirm the iOS payment strategy before testing paid flows.
- [ ] On iOS, confirm subscription purchase cards/buttons do not open Razorpay checkout.
- [ ] On iOS, confirm subscription screens show: "Subscriptions are currently unavailable on iOS. You can continue using the free features."
- [ ] On iOS, confirm there is no "pay on website", "subscribe on web", "continue in browser", WebView checkout, or auto-login payment workaround for digital subscriptions.
- [ ] If Razorpay remains enabled for booking, test only allowed real-world one-to-one service booking payments.
- [ ] Test booking payment behavior separately from subscription behavior.
- [ ] Confirm booking payment does not unlock digital subscriptions, premium content, or app-only features.
- [ ] Do not submit digital subscriptions or premium content paid through Razorpay unless App Store policy review approves it.
- [ ] Confirm subscription payment behavior is disabled, converted to Apple IAP, or documented before App Store submission.
- [ ] Confirm payment failure and cancellation states do not leave broken bookings.

## Poor Network
- [ ] Launch the app on poor Wi-Fi.
- [ ] Turn internet off during login.
- [ ] Turn internet off during chat load.
- [ ] Turn internet off during booking creation.
- [ ] Turn internet off during payment creation.
- [ ] Confirm the app recovers when internet is restored.

## Fresh Install
- [ ] Delete the app from the iPhone.
- [ ] Reinstall from TestFlight.
- [ ] Confirm onboarding/auth loads cleanly.
- [ ] Confirm no old tokens or stale local subscription data remain.

## Commands
Only use the platform-specific EAS profiles. The generic `development`, `preview`, and
`production` profiles are base templates and do not pin the iOS split API URL.

Start Metro for an installed dev client:

```bash
cd ~/menorah/menorah-mobile-app-/menorah/mobile-app
EXPO_PUBLIC_API_BASE_URL=https://api.menorah.me/api npx expo start -c --dev-client
```

Create an iOS TestFlight/preview build:

```bash
cd ~/menorah/menorah-mobile-app-/menorah/mobile-app
eas build --platform ios --profile preview-ios
```

Use production profile only after preview QA passes:

```bash
cd ~/menorah/menorah-mobile-app-/menorah/mobile-app
eas build --platform ios --profile production-ios
```
