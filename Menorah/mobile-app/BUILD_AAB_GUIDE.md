# Building Android App Bundle (AAB) for Menorah Health App

This guide explains how to build an AAB (Android App Bundle) file for publishing to Google Play Store.

## Prerequisites

1. **EAS CLI** installed globally:
   ```bash
   npm install -g eas-cli
   ```

2. **Expo account** - You need to be logged in:
   ```bash
   eas login
   ```

3. **Android Keystore** (for production builds) - EAS can generate this automatically, or you can provide your own.

## Method 1: Using EAS Build (Recommended)

EAS Build is the recommended way to build AAB files for Expo projects. It builds your app in the cloud.

### Step 1: Install EAS CLI

```bash
npm install -g eas-cli
```

### Step 2: Login to Expo

```bash
eas login
```

### Step 3: Configure Build Settings

Your `eas.json` is already configured for production builds with AAB format:

```json
{
  "build": {
    "production": {
      "distribution": "store",
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

### Step 4: Build the AAB

Navigate to the mobile-app directory and run:

```bash
cd Menorah/mobile-app
eas build --platform android --profile production
```

This will:
- Build your app in the cloud
- Generate an AAB file
- Upload it to EAS servers
- Provide a download link when complete

### Step 5: Download the AAB

After the build completes, you'll get a download link. You can also:

```bash
# List all builds
eas build:list

# Download a specific build
eas build:download [BUILD_ID]
```

## Method 2: Local Build (Alternative)

If you prefer to build locally, you can use Gradle directly.

### Step 1: Navigate to Android Directory

```bash
cd Menorah/mobile-app/android
```

### Step 2: Generate a Release Keystore (if you don't have one)

**Important:** For production, you need a release keystore. The debug keystore is only for development.

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

You'll be prompted for:
- Keystore password
- Key password
- Your name, organization, etc.

**Save these credentials securely!** You'll need them for future builds.

### Step 3: Configure Signing in build.gradle

Edit `android/app/build.gradle` and add your signing config:

```gradle
android {
    ...
    signingConfigs {
        release {
            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                storeFile file(MYAPP_RELEASE_STORE_FILE)
                storePassword MYAPP_RELEASE_STORE_PASSWORD
                keyAlias MYAPP_RELEASE_KEY_ALIAS
                keyPassword MYAPP_RELEASE_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            ...
        }
    }
}
```

### Step 4: Create gradle.properties

Create or edit `android/gradle.properties` and add:

```properties
MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
MYAPP_RELEASE_STORE_PASSWORD=your-store-password
MYAPP_RELEASE_KEY_ALIAS=my-key-alias
MYAPP_RELEASE_KEY_PASSWORD=your-key-password
```

**Important:** Add `gradle.properties` to `.gitignore` to keep credentials secure!

### Step 5: Build the AAB

```bash
cd Menorah/mobile-app/android
./gradlew bundleRelease
```

On Windows:
```bash
cd Menorah\mobile-app\android
gradlew.bat bundleRelease
```

The AAB file will be generated at:
```
android/app/build/outputs/bundle/release/app-release.aab
```

## Method 3: Using Expo Prebuild + Gradle

If you need more control over the native build:

### Step 1: Prebuild Native Code

```bash
cd Menorah/mobile-app
npx expo prebuild --platform android
```

### Step 2: Follow Local Build Steps

Then follow Method 2 (Steps 2-5) to build the AAB.

## Important Notes

### Version Management

Before building for production, update your version:

1. **In `app.json`:**
   ```json
   {
     "expo": {
       "version": "1.0.0"  // Update this
     }
   }
   ```

2. **In `android/app/build.gradle`:**
   ```gradle
   defaultConfig {
       versionCode 1  // Increment for each release
       versionName "1.0.0"  // Match app.json version
   }
   ```

### Environment Variables

Make sure your production environment variables are set correctly in `app.json` or `app.config.ts`:

```json
{
  "extra": {
    "API_BASE_URL": "https://your-production-api.com/api",
    "CHECKOUT_RETURN_URL": "https://your-production-url.com/checkout/return",
    "JITSI_BASE_URL": "https://your-jitsi-server.com"
  }
}
```

### Testing the AAB

Before uploading to Play Store, test your AAB:

1. **Using bundletool** (Google's tool):
   ```bash
   # Download bundletool from: https://github.com/google/bundletool/releases
   java -jar bundletool.jar build-apks --bundle=app-release.aab --output=app.apks
   ```

2. **Install on device:**
   ```bash
   bundletool install-apks --apks=app.apks
   ```

## Troubleshooting

### Build Fails with "Keystore not found"

- Make sure the keystore path in `gradle.properties` is correct
- Use absolute paths or paths relative to the `android` directory

### Build Fails with "Signing config not found"

- Ensure `signingConfigs.release` is defined before `buildTypes.release`
- Check that all keystore properties are set in `gradle.properties`

### EAS Build Fails

- Check your `eas.json` configuration
- Ensure you're logged in: `eas whoami`
- Check build logs: `eas build:view [BUILD_ID]`

### Version Code Conflicts

- Each upload to Play Store needs a unique `versionCode`
- Increment `versionCode` in `build.gradle` for each release

## Uploading to Google Play Store

1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app
3. Go to "Production" → "Create new release"
4. Upload your AAB file
5. Fill in release notes
6. Review and publish

## Quick Reference Commands

```bash
# EAS Build (Recommended)
eas build --platform android --profile production

# Local Build
cd android && ./gradlew bundleRelease

# Check build status
eas build:list

# Download build
eas build:download [BUILD_ID]

# View build logs
eas build:view [BUILD_ID]
```

## Security Best Practices

1. **Never commit keystore files or passwords to git**
2. **Use environment variables for sensitive data**
3. **Store keystore files securely (password manager, secure storage)**
4. **Use EAS credentials management for cloud builds**
5. **Enable Google Play App Signing** (recommended by Google)

---

For more information, see:
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Android App Bundle Guide](https://developer.android.com/guide/app-bundle)
- [Google Play Console](https://play.google.com/console)

