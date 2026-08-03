const RELEASE_URL_FIELDS = Object.freeze({
  iosApiBaseUrl: 'EXPO_PUBLIC_IOS_API_BASE_URL',
  androidApiBaseUrl: 'EXPO_PUBLIC_ANDROID_API_BASE_URL',
  webBaseUrl: 'EXPO_PUBLIC_WEB_BASE_URL',
  checkoutReturnUrl: 'EXPO_PUBLIC_CHECKOUT_RETURN_URL',
  jitsiBaseUrl: 'EXPO_PUBLIC_JITSI_BASE_URL',
});

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const PRODUCTION_HOSTS = new Set([
  'menorah.me',
  'www.menorah.me',
  'api.menorah.me',
  'api-ios.menorah.me',
  'api-android.menorah.me',
  'api-web.menorah.me',
  'api-admin.menorah.me',
  'app.menorah.me',
  'admin.menorah.me',
  'counsellor.menorah.me',
  'calls.menorah.me',
  'vps.menorah.me',
]);
const RELEASE_TIERS = new Set(['development', 'preview', 'production']);

function normalizeHttpsUrl(name, value, { required }) {
  const candidate = String(value || '').trim();
  if (!candidate) {
    if (required) throw new Error(`${name} is required for release builds`);
    return undefined;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL`);
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.port
    || parsed.hostname.endsWith('.')
    || LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase())
    || parsed.hostname.toLowerCase().endsWith('.localhost')
  ) {
    throw new Error(`${name} must be a credential-free, non-local HTTPS URL`);
  }

  return candidate.replace(/\/+$/, '');
}

function readReleaseEnvironment(env = process.env) {
  const tier = String(env.MENORAH_MOBILE_ENVIRONMENT || '').trim();
  const required = env.NODE_ENV === 'production' || Boolean(tier);
  if (tier && !RELEASE_TIERS.has(tier)) {
    throw new Error(
      'MENORAH_MOBILE_ENVIRONMENT must be development, preview, or production for release builds'
    );
  }
  if (env.NODE_ENV === 'production' && !tier) {
    throw new Error(
      'MENORAH_MOBILE_ENVIRONMENT must be development, preview, or production for release builds'
    );
  }

  const urls = Object.fromEntries(
    Object.entries(RELEASE_URL_FIELDS).map(([property, name]) => [
      property,
      normalizeHttpsUrl(name, env[name], { required }),
    ])
  );

  if (required) {
    const hosts = Object.values(urls).map((value) => new URL(value).hostname.toLowerCase());
    if (tier !== 'production' && hosts.some((host) => PRODUCTION_HOSTS.has(host))) {
      throw new Error(`${tier} mobile builds cannot target Menorah production hosts`);
    }
    if (tier !== 'production') {
      const allowedHosts = new Set(
        String(env.MENORAH_MOBILE_ALLOWED_HOSTS || '')
          .split(',')
          .map((host) => host.trim().toLowerCase())
          .filter(Boolean)
      );
      const tierToken = tier === 'preview'
        ? /(?:^|[.-])(?:preview|staging|security-test)(?:[.-]|$)/
        : /(?:^|[.-])(?:dev|development|staging|security-test)(?:[.-]|$)/;
      if (allowedHosts.size === 0) {
        throw new Error(
          'MENORAH_MOBILE_ALLOWED_HOSTS must list the approved non-production hosts'
        );
      }
      for (const host of allowedHosts) {
        if (
          host.endsWith('.')
          || PRODUCTION_HOSTS.has(host)
          || !tierToken.test(host)
        ) {
          throw new Error(`MENORAH_MOBILE_ALLOWED_HOSTS contains an unsafe host: ${host}`);
        }
      }
      if (hosts.some((host) => !allowedHosts.has(host))) {
        throw new Error(`${tier} mobile URLs must use only MENORAH_MOBILE_ALLOWED_HOSTS`);
      }

      const iosApi = new URL(urls.iosApiBaseUrl);
      const androidApi = new URL(urls.androidApiBaseUrl);
      const web = new URL(urls.webBaseUrl);
      const checkout = new URL(urls.checkoutReturnUrl);
      const calls = new URL(urls.jitsiBaseUrl);
      if (
        iosApi.pathname !== '/api'
        || androidApi.pathname !== '/api'
        || web.pathname !== '/'
        || checkout.origin !== web.origin
        || checkout.pathname !== '/checkout/return'
        || calls.pathname !== '/'
      ) {
        throw new Error(
          `${tier} mobile URLs must use /api endpoints, one web origin with /checkout/return, and a call origin`
        );
      }
    }
    if (tier === 'production' && (
      urls.iosApiBaseUrl !== 'https://api-ios.menorah.me/api'
      || urls.androidApiBaseUrl !== 'https://api-android.menorah.me/api'
      || urls.webBaseUrl !== 'https://app.menorah.me'
      || urls.checkoutReturnUrl !== 'https://app.menorah.me/checkout/return'
      || urls.jitsiBaseUrl !== 'https://calls.menorah.me'
    )) {
      throw new Error('production mobile builds must use approved production destinations');
    }
  }

  return urls;
}

function readAndroidReleaseEnvironment(env = process.env) {
  const urls = readReleaseEnvironment(env);
  for (const name of [
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
  ]) {
    const value = String(env[name] || '').trim();
    if (!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value)) {
      throw new Error(`${name} must be an approved Google OAuth client ID`);
    }
  }
  return urls;
}

module.exports = {
  RELEASE_URL_FIELDS,
  RELEASE_TIERS,
  normalizeHttpsUrl,
  readAndroidReleaseEnvironment,
  readReleaseEnvironment,
};
