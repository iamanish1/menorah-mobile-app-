# Mobile app-link association files

The production reverse proxy exposes the two platform association files from the
`app-link-associations` service:

- `/.well-known/apple-app-site-association` for iOS Universal Links.
- `/.well-known/assetlinks.json` for Android App Links.

They are served on `app.menorah.me`, `menorah.me`, `api-ios.menorah.me`, and
`api-android.menorah.me`, matching the domains declared by the mobile app.
The service returns `404` (rather than placeholder or malformed JSON) until
the signing identifiers below are supplied in the host-only production env
file:

```dotenv
APPLE_APP_LINK_TEAM_ID=ABCDEFGHIJ
APPLE_APP_LINK_BUNDLE_ID=com.menorah.health.app
ANDROID_APP_LINK_PACKAGE_NAME=com.menorah.healthmobile
ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS=AA:BB:...:FF
```

Use the Apple Developer Team ID and the SHA-256 certificate fingerprints from
the exact signing certificates used for the production iOS and Android builds.
Multiple Android certificates (for example upload and Play signing) are
comma-separated. These identifiers are public verification metadata, but they
must be accurate; do not substitute placeholders in the live env file.

After deployment, verify the public HTTPS responses before shipping a mobile
binary:

```bash
curl --fail --show-error https://app.menorah.me/.well-known/apple-app-site-association
curl --fail --show-error https://app.menorah.me/.well-known/assetlinks.json
```

The reset-link paths allowed by the AASA document are `/reset-password` and
the legacy `/api/auth/reset-password` path. Android verifies the package and
certificate only; its intent-filter path restrictions remain in the app
manifest.
