const UAE_COUNTRY_CODES = new Set(['AE', 'ARE', 'UAE', 'UNITED ARAB EMIRATES']);
const INDIA_COUNTRY_CODES = new Set(['IN', 'IND', 'INDIA']);
const COUNTRY_ALIASES = {
  UNITED_ARAB_EMIRATES: 'AE',
  UAE: 'AE',
  ARE: 'AE',
  INDIA: 'IN',
  IND: 'IN'
};

const EXTERNAL_PROVIDERS = ['vsee', 'doxy', 'zoom', 'google_meet', 'teams'];
const PROVIDERS = ['livekit', ...EXTERNAL_PROVIDERS, 'disabled'];
const JOIN_MODES = ['in_app', 'external_link', 'disabled'];

const truthy = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const normalizeCountry = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.toUpperCase().replace(/[^A-Z]/g, ' ');
};

const countryCode = (value) => {
  const normalized = normalizeCountry(value);
  if (!normalized) return '';
  const compact = normalized.replace(/\s+/g, '_');
  if (COUNTRY_ALIASES[compact]) return COUNTRY_ALIASES[compact];
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  if (/^[A-Z]{3}$/.test(normalized)) return normalized;
  return '';
};

const isUaeCountry = (value) => UAE_COUNTRY_CODES.has(normalizeCountry(value));
const isIndiaCountry = (value) => INDIA_COUNTRY_CODES.has(normalizeCountry(value));

const csvSet = (value, fallback = '') =>
  new Set(String(value || fallback)
    .split(',')
    .map((item) => countryCode(item) || normalizeCountry(item))
    .filter(Boolean));

const normalizeProvider = (value, fallback = 'vsee') => {
  const provider = String(value || fallback).trim().toLowerCase().replace(/[-\s]+/g, '_');
  return EXTERNAL_PROVIDERS.includes(provider) ? provider : fallback;
};

const providerEnabled = (provider, env = process.env) => {
  const key = `${provider.toUpperCase()}_ENABLED`;
  return truthy(env[key], provider === 'vsee' || provider === 'zoom');
};

const getBlockedCountryProvider = (env = process.env) => {
  const configured = normalizeProvider(
    env.BLOCKED_COUNTRY_CALL_PROVIDER || env.UAE_CALL_PROVIDER || env.UAE_CALLING_PROVIDER || 'zoom'
  );
  return providerEnabled(configured, env) ? configured : 'disabled';
};

const collectSignals = ({ user, booking, req, env = process.env } = {}) => {
  const countries = [
    user?.country,
    user?.accountRegion,
    user?.region,
    user?.address?.country,
    booking?.region,
    booking?.callRegion,
    booking?.videoCall?.region,
    req?.clientCountry
  ].filter(Boolean);

  const phones = [
    user?.phone,
    booking?.user?.phone,
    req?.user?.phone
  ].filter(Boolean).map((phone) => String(phone).replace(/\s+/g, ''));

  return {
    countries,
    phones,
    env
  };
};

const resolveRegion = (input = {}) => {
  const signals = collectSignals(input);
  const uaeCountry = signals.countries.find(isUaeCountry);
  const indiaCountry = signals.countries.find(isIndiaCountry);
  const otherCountry = signals.countries.map(countryCode).find(Boolean);
  const uaePhone = signals.phones.find((phone) => phone.startsWith('+971'));
  const indiaPhone = signals.phones.find((phone) => phone.startsWith('+91'));

  if (uaeCountry) return { region: 'AE', reason: 'uae_country_signal' };
  if (uaePhone) return { region: 'AE', reason: 'uae_phone_signal' };
  if (indiaCountry) return { region: 'IN', reason: 'india_country_signal' };
  if (indiaPhone) return { region: 'IN', reason: 'india_phone_signal' };
  if (otherCountry) return { region: otherCountry, reason: 'country_signal' };
  return { region: 'UNKNOWN', reason: 'region_unknown' };
};

const resolveCallPolicy = (input = {}) => {
  const env = input.env || process.env;
  const mode = String(env.CALLING_REGION_MODE || 'hybrid').toLowerCase();
  const { region, reason } = resolveRegion({ ...input, env });

  if (mode !== 'hybrid') {
    return { region: 'IN', provider: 'livekit', joinMode: 'in_app', reason: 'legacy_calling_mode' };
  }

  const blockedCountries = csvSet(env.LIVEKIT_BLOCKED_COUNTRIES, truthy(env.BLOCK_LIVEKIT_FOR_UAE, true) ? 'AE' : '');
  if (blockedCountries.has(region)) {
    const provider = truthy(env.BLOCKED_COUNTRY_CALLING_ENABLED || env.UAE_CALLING_ENABLED, true)
      ? getBlockedCountryProvider(env)
      : 'disabled';
    return {
      region,
      provider,
      joinMode: provider === 'disabled' ? 'disabled' : 'external_link',
      reason: region === 'AE' ? reason : 'blocked_country_signal'
    };
  }

  if (region !== 'UNKNOWN') {
    return { region, provider: 'livekit', joinMode: 'in_app', reason };
  }

  if (truthy(env.BLOCK_LIVEKIT_FOR_UNKNOWN_REGION, false)) {
    return { region, provider: 'disabled', joinMode: 'disabled', reason };
  }

  return { region, provider: 'livekit', joinMode: 'in_app', reason: 'unknown_region_allowed_by_env' };
};

const isLiveKitPolicy = (policy) =>
  policy?.provider === 'livekit' && policy?.joinMode === 'in_app';

const assertLiveKitAllowed = (input = {}) => {
  const policy = resolveCallPolicy(input);
  if (!isLiveKitPolicy(policy)) {
    const error = new Error(`LiveKit blocked by call policy: ${policy.reason}`);
    error.code = 'LIVEKIT_BLOCKED_BY_POLICY';
    error.statusCode = policy.joinMode === 'disabled' ? 403 : 409;
    error.policy = policy;
    throw error;
  }
  return policy;
};

const isAllowedExternalProvider = (provider) => EXTERNAL_PROVIDERS.includes(normalizeProvider(provider, ''));

const isSafeHttpsUrl = (url) => {
  try {
    const parsed = new URL(String(url || '').trim());
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};

const providerDisplayName = (provider) => ({
  vsee: 'VSee',
  doxy: 'DOXY',
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  teams: 'Microsoft Teams',
  livekit: 'Menorah LiveKit',
  disabled: 'Disabled'
})[provider] || provider;

module.exports = {
  EXTERNAL_PROVIDERS,
  PROVIDERS,
  JOIN_MODES,
  assertLiveKitAllowed,
  isAllowedExternalProvider,
  isSafeHttpsUrl,
  isUaeCountry,
  normalizeProvider,
  providerDisplayName,
  resolveCallPolicy,
  resolveRegion,
  truthy
};
