# Mobile Expo Audit Notes

Last reviewed: 2026-07-16.

## Expo SDK 57 Production Audit Constraint

`npm audit --omit=dev` in `menorah/mobile-app` and `menorah/mobile-app/mobile-app` still reports the transitive advisory:

- `uuid <11.1.1`
- path: `expo -> @expo/cli/@expo/config-plugins -> xcode -> uuid`
- advisory: `GHSA-w5hq-g745-h8pq`

The mobile app has been upgraded with Expo's supported path to Expo `57.0.6` and SDK-compatible React Native packages. Plain `npm audit fix --omit=dev` cannot resolve the finding. npm only offers `npm audit fix --force`, which would install a breaking Expo/CLI version path, so that force path must not be used for production hardening.

Track this until Expo publishes a compatible `@expo/config-plugins`/`xcode` chain that depends on a patched `uuid`.

## Expo Doctor Constraint

`npx expo-doctor` passes 19 of 20 checks. The remaining check is the bare-workflow warning that native folders exist while `app.config.ts` still contains native configuration fields. Those fields do not automatically sync into `ios/` and `android/` unless the project moves back to Continuous Native Generation or the native projects are manually synchronized.
