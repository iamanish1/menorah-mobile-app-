# App Store Blockers

This file tracks launch blockers and policy risks that must be resolved before iOS App Store submission.

## Required Before Submission
- [ ] Decide the Razorpay/iOS payment strategy.
- [ ] Create a production reviewer demo account.
- [ ] Verify fresh web incognito login works for the demo account.
- [ ] Verify iPhone dev/TestFlight login works for the demo account.
- [ ] Add demo account credentials to App Store Connect review notes.
- [ ] Host a real Privacy Policy URL.
- [ ] Host a real Terms of Service URL.
- [ ] Confirm support email/contact route is real and monitored.
- [ ] Verify backend report-user endpoint.
- [ ] Verify backend report-content/report-message endpoint.
- [ ] Verify backend block-user endpoint.
- [ ] Verify backend account deletion request endpoint.
- [ ] Complete real iPhone QA through TestFlight.
- [ ] Make the native config/prebuild decision carefully before changing native settings.

## Native Config Status
- The repo currently contains `ios/` and `android/`, so Expo Doctor treats it as a native/prebuild project rather than pure CNG.
- With native folders present, EAS Build will not automatically sync native config fields from `app.config.ts`.
- Do not run `npx expo prebuild --clean` casually.
- Before any prebuild, commit the current state, run the prebuild intentionally, and review native diffs.

## Razorpay Usage Inventory

### Booking Payment
- Location: `src/screens/booking/PaymentSheet.tsx`
- Entry points:
  - `src/screens/booking/BookingReview.tsx`
  - `src/screens/booking/SessionReview.tsx`
- API methods:
  - `api.createCheckoutSession`
  - `api.verifyRazorpayPayment`
  - `api.getRazorpayOrderStatus`
- Classification: real-world one-to-one service booking.
- App Store risk: medium. Razorpay may be acceptable only if this is clearly payment for real-world services, not digital app content.

### Subscription Payment
- Location: `src/screens/subscription/SubscriptionPayment.tsx`
- Entry points:
  - `src/components/discover/SubscriptionSelector.tsx`
  - `src/screens/subscription/SubscriptionDetails.tsx`
- API methods:
  - `api.createSubscriptionCheckout`
  - `api.verifySubscriptionPayment`
  - `api.getSubscriptionStatus`
- Classification: digital subscription or premium app feature access.
- App Store risk: high. This likely needs Apple In-App Purchase if it unlocks digital features, premium app access, or subscription content.

## Razorpay Technical Risk
- Expo Doctor reports `react-native-razorpay` as unsupported on New Architecture.
- Do not remove Razorpay until the iOS payment strategy is decided.
- If Razorpay stays on iOS, verify it in a real development build and TestFlight build, not Expo Go.
- Expo Go preview should continue to avoid importing native Razorpay at startup.

## Recommended First Submission Strategy
- Launch iOS free first if possible.
- Disable or hide subscription/payment flows that are not App Store policy-cleared.
- Keep only payment flows that are clearly for allowed real-world one-to-one services.
- Add paid digital subscriptions later with Apple In-App Purchase if needed.

## Remaining QA Risks
- Demo account must be valid and unlocked.
- Report/block/account deletion endpoints must be confirmed end to end.
- Legal URLs must be public before App Review.
- Payment cancellation and failure states must be tested on iPhone.
- A fresh install must be tested before uploading to App Review.
