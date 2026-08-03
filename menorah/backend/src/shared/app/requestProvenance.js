const net = require('net');

const INTERNAL_COUNTRY_HEADER = 'x-menorah-client-country';
const COUNTRY_PATTERN = /^(?:[A-Z]{2}|T1|XX)$/;

const normalizeIpAddress = (value) => {
  const candidate = String(value || '').trim();
  if (!candidate) return '';

  const withoutBrackets = candidate.startsWith('[') && candidate.endsWith(']')
    ? candidate.slice(1, -1)
    : candidate;
  const ipv4Mapped = withoutBrackets.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  const normalized = ipv4Mapped ? ipv4Mapped[1] : withoutBrackets;
  return net.isIP(normalized) ? normalized : '';
};

const normalizeTrustedCountry = (value) => {
  if (Array.isArray(value) && value.length !== 1) return '';
  const candidate = String(Array.isArray(value) ? value[0] : value || '').trim().toUpperCase();
  if (!candidate || candidate.includes(',')) return '';
  return COUNTRY_PATTERN.test(candidate) ? candidate : '';
};

const isImmediatePeerTrusted = (req) => {
  const address = req?.socket?.remoteAddress;
  const trustProxy = req?.app?.get?.('trust proxy fn');
  if (!address || typeof trustProxy !== 'function') return false;

  try {
    return Boolean(trustProxy(address, 0));
  } catch {
    return false;
  }
};

const getValidatedClientIp = (req) => (
  normalizeIpAddress(req?.ip)
  || normalizeIpAddress(req?.socket?.remoteAddress)
  || 'unknown'
);

const attachValidatedRequestProvenance = (req, _res, next) => {
  req.validatedClientIp = getValidatedClientIp(req);
  req.clientCountry = isImmediatePeerTrusted(req)
    ? normalizeTrustedCountry(req.headers?.[INTERNAL_COUNTRY_HEADER])
    : '';
  next();
};

module.exports = {
  INTERNAL_COUNTRY_HEADER,
  attachValidatedRequestProvenance,
  getValidatedClientIp,
  isImmediatePeerTrusted,
  normalizeIpAddress,
  normalizeTrustedCountry,
};
