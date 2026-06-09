# App Store Pre-Submission Checklist

## App Stability
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` has no blocking errors.
- [ ] `npm run doctor` passes or every warning is documented.
- [ ] Production API is live and reachable.
- [ ] App does not depend on Expo Go for production behavior.
- [ ] App launches cleanly on a fresh install.
- [ ] No visible placeholder, "coming soon", or fake support content remains.

## Real iPhone Testing
- [ ] Test on a physical iPhone using a development build or TestFlight.
- [ ] Test login, signup, logout, password reset, and account deletion request.
- [ ] Test chat send/receive, report message, report user, block user, and support links.
- [ ] Test booking, audio/video session join, cancellation, and failure states.
- [ ] Test profile image upload and permission prompts.

## TestFlight Testing
- [ ] Upload an iOS build to TestFlight.
- [ ] Invite internal testers.
- [ ] Verify install, login, navigation, chat, calls, payments, and account deletion request.
- [ ] Verify crash-free behavior on poor network and after app restart.

## Login and Demo Account
- [ ] Create a reviewer demo account.
- [ ] Add demo credentials in App Store Connect review notes.
- [ ] Ensure the demo account can access chat, booking, settings, legal screens, and account deletion.
- [ ] If social login is added later, provide Sign in with Apple or another compliant equivalent.

## Privacy and Legal
- [ ] Host Privacy Policy at a public URL.
- [ ] Host Terms of Service at a public URL.
- [ ] Host Community Guidelines or keep them accessible in app.
- [ ] Verify Privacy Policy describes account data, chat data, booking data, payments, support data, reports, retention, and deletion.
- [ ] Verify support contact details are real and monitored.
- [ ] Complete the App Store privacy questionnaire accurately.
- [ ] Complete the age rating questionnaire accurately.

## Account Deletion
- [ ] Confirm backend account deletion endpoint exists.
- [ ] Confirm Settings > Account > Delete Account submits a real deletion request.
- [ ] Confirm users are told what data may be retained for legal, safety, payment, or dispute obligations.
- [ ] Confirm deletion status/support follow-up process is documented.

## Report, Block, and Moderation
- [ ] Confirm report-user endpoint exists.
- [ ] Confirm report-content endpoint exists.
- [ ] Confirm block-user endpoint exists.
- [ ] Confirm moderation/admin review queue exists.
- [ ] Confirm support team receives and responds to safety reports.
- [ ] Confirm community guidelines are reachable from Settings and chat.

## Mental Wellness and Crisis Safety
- [ ] App description avoids diagnosis, treatment, cure, recovery guarantees, and therapy-replacement claims.
- [ ] In-app text says the app is not medical care and not an emergency service.
- [ ] Crisis guidance is visible from Settings/Profile and chat.
- [ ] Emergency resources are real, current, and appropriate for launch regions.
- [ ] Legal review confirms counsellor/expert/licensing claims are accurate.

## Payments
- [ ] Separate real-time one-to-one service payments from digital subscriptions/features.
- [ ] Use Apple In-App Purchase for digital subscriptions or premium in-app content where required.
- [ ] Provide sandbox/test payment instructions for App Review.
- [ ] Verify refund/cancellation wording is accurate.
- [ ] Review `react-native-razorpay` before iOS submission because `expo-doctor` reports it as unsupported on New Architecture.
- [ ] Confirm iOS App Store payment policy for every paid flow before submission.
- [ ] Move digital subscriptions or premium in-app content to Apple In-App Purchase where required.
- [ ] Keep Razorpay on iOS only for allowed real-world or one-to-one services, not digital subscriptions/premium content.
- [ ] Confirm iOS digital subscription Razorpay flow remains disabled for first submission.
- [ ] Implement Apple In-App Purchase before enabling digital subscriptions or premium content on iOS.
- [ ] Confirm iOS digital subscriptions do not offer web checkout, browser redirects, or auto-login payment workarounds.
- [ ] Complete business/legal policy review before keeping booking payments on iOS.
- [ ] Confirm booking payment does not unlock digital subscriptions, premium content, or app-only features.

## App Store Connect
- [ ] App name, subtitle, description, keywords, category, support URL, and privacy URL are complete.
- [ ] Screenshots show real app screens, not only login/splash screens.
- [ ] Review notes are specific and include demo credentials.
- [ ] App Review contact details are current.
- [ ] Export compliance, content rights, privacy, and age rating forms are complete.

## Production Build
- [ ] `eas build --profile production --platform ios` succeeds.
- [ ] Bundle identifier matches App Store Connect.
- [ ] iOS camera, microphone, and photo permission descriptions are present.
- [ ] No secrets are hardcoded in the app bundle.
- [ ] Final build is tested via TestFlight before submission.

## Native Project Sync
- [ ] This repo currently includes `ios/` and `android/`, so it is being treated as a native/prebuild project rather than a pure CNG project.
- [ ] After changing native config fields in `app.config.ts`, run `npx expo prebuild --clean` intentionally and review the native diffs before building.
