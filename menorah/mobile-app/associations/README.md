# Mobile Site Associations

These files are repository-safe templates. They intentionally contain placeholders and must
not be deployed as-is.

The app accepts verified links only for:

- `https://app.menorah.me/reset-password#token=<64 hexadecimal characters>`

## APPLE ACTION

1. Obtain the production Apple Team ID from the Apple Developer account.
2. Confirm that `com.menorah.health.app` has the Associated Domains capability and that the
   distribution provisioning profile includes it.
3. Replace `__APPLE_TEAM_ID__` and `__IOS_BUNDLE_ID__` outside the repository.
4. Publish the rendered file without an extension at:
   `https://app.menorah.me/.well-known/apple-app-site-association`.

## GOOGLE ACTION

1. Obtain the **Play App Signing** SHA-256 certificate fingerprint from Play Console. Do not
   substitute a debug or upload-key fingerprint for the production Play signing certificate.
2. Replace `__ANDROID_PACKAGE_NAME__` and `__ANDROID_SHA256_CERT_FINGERPRINT__` outside the
   repository.
3. Publish the rendered file as:
   `https://app.menorah.me/.well-known/assetlinks.json`.

## INFRASTRUCTURE ACTION

Both endpoints must be public over HTTPS, return HTTP 200 directly with
`Content-Type: application/json`, and must not redirect. Do not commit rendered identifiers or
certificate fingerprints back to these templates.

Verify after publication:

```bash
curl --fail --silent --show-error --dump-header - \
  https://app.menorah.me/.well-known/apple-app-site-association
curl --fail --silent --show-error --dump-header - \
  https://app.menorah.me/.well-known/assetlinks.json
```

Device verification still requires a signed production-like build. See
`docs/mobile-store-external-actions.md`.
