# Development To Host Workflow

This repo is set up so development can happen on this Windows machine and deployment can happen later on a separate host machine.

## Local Development

Use this machine for source edits, tests, and image builds.

Backend checks:

```powershell
cd C:\menorah\menorah-mobile-app-\menorah\backend
npm run lint
npm test -- --runInBand
docker build -f ..\backend\Dockerfile .
```

Mobile local development can use the LAN IP auto-detected by `app.config.ts`, or you can force it:

```powershell
cd C:\menorah\menorah-mobile-app-\menorah\mobile-app
$env:EXPO_PUBLIC_API_BASE_URL="http://YOUR_WINDOWS_LAN_IP:4002/api"
npx expo start -c --dev-client
```

Production mobile builds must use platform-specific API URLs. Do not run the generic
`development`, `preview`, or `production` EAS profiles directly; they are base
templates and do not pin the split iOS/Android API URL.

```powershell
eas build --platform ios --profile production-ios
eas build --platform android --profile production-android
```

## Package A Release From This Machine

Commit first, then create a clean zip from tracked files only:

```powershell
cd C:\menorah\menorah-mobile-app-
.\menorah\deploy\scripts\export-dev-bundle.ps1
```

To copy directly with SSH:

```powershell
.\menorah\deploy\scripts\sync-to-host.ps1 -Host user@YOUR_HOST
```

The bundle intentionally excludes untracked `.env` files and secrets.

## Prepare The Host

On the host:

```bash
export MENORAH_ROOT=/opt/menorah
export MENORAH_DATA_ROOT=/srv/menorah
bash menorah/deploy/scripts/prepare-host.sh
```

Unzip the release into:

```text
/opt/menorah/releases/<commit-sha>
```

Then point `/opt/menorah/current` at that release.

## Configure Host Env

Copy templates and fill real values:

```bash
cp menorah/deploy/env/home.compose.env.example menorah/deploy/env/home.compose.env
cp menorah/deploy/env/home.env.example menorah/deploy/env/home.env
```

Do not commit the real env files.

For the first migration phases, keep:

```env
MONGODB_URI=<current Atlas URI>
```

Only switch to the self-hosted replica set after restore tests are proven.

## Start Home Stack

From the release root:

```bash
bash menorah/deploy/scripts/home-compose-up.sh
```

Only `reverse-proxy` exposes ports `80` and `443`. MongoDB, Redis, APIs, and monitoring stay on internal Docker networks.

## Rollback

Keep the previous release directory. To roll back:

```bash
ln -sfn /opt/menorah/releases/<previous-sha> /opt/menorah/current
cd /opt/menorah/current
bash menorah/deploy/scripts/home-compose-up.sh
```

For frontend/domain rollback during migration, point Cloudflare DNS back to Vercel.

For database rollback during later migration, point API env back to Atlas and redeploy. Keep Atlas alive for at least 7 to 14 days after cutover.
