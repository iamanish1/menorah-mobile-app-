# Mobile Expo Audit Notes

Last reviewed: 2026-07-17.

## Expo SDK 57 Production Audit Constraint

`npm audit --omit=dev` in `menorah/mobile-app` and `menorah/mobile-app/mobile-app` still reports the transitive advisory:

- `uuid <11.1.1`
- path: `expo -> @expo/cli/@expo/config-plugins -> xcode -> uuid`
- advisory: `GHSA-w5hq-g745-h8pq`

The mobile app has been upgraded with Expo's supported path to Expo `57.0.6` and SDK-compatible React Native packages. Plain `npm audit fix --omit=dev` cannot resolve the finding. npm only offers `npm audit fix --force`, which would install a breaking Expo/CLI version path, so that force path must not be used for production hardening.

Track this until Expo publishes a compatible `@expo/config-plugins`/`xcode` chain that depends on a patched `uuid`.

CI permits only this exact moderate advisory and only for the reviewed Expo dependency packages. The exception expires on 2026-10-31; any new package, advisory, severity, or an expired exception fails the production audit gate.

## Expo Doctor Bare-Workflow Configuration

This is an intentional bare-workflow project: native folders are authoritative while `app.config.ts` also supplies Expo runtime and build metadata. Expo's supported `appConfigFieldsNotSyncedCheck` is disabled in `package.json` so diagnostics can gate all applicable checks. Native changes to orientation, icons, appearance, platform settings, status bar, plugins, or scheme must still be synchronized manually in `ios/` and `android/`; changing only `app.config.ts` does not update tracked native projects.
