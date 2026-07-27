const TOKEN_PLACEHOLDER = '{token}';

const getPasswordResetUrlTemplate = () => String(process.env.PASSWORD_RESET_URL_TEMPLATE || '').trim();

const getCanonicalAppDomain = () => {
  const raw = String(process.env.APP_DOMAIN || 'app.menorah.me').trim();
  try {
    const domainUrl = new URL(raw.includes('://') ? raw : `https://${raw}`);
    if (
      domainUrl.protocol !== 'https:'
      || domainUrl.pathname !== '/'
      || domainUrl.search
      || domainUrl.hash
      || domainUrl.username
      || domainUrl.password
      || domainUrl.port
    ) return '';
    return domainUrl.hostname.toLowerCase();
  } catch {
    return '';
  }
};

const validatePasswordResetUrlTemplate = (template = getPasswordResetUrlTemplate()) => {
  if (!template) return { ok: false, reason: 'PASSWORD_RESET_URL_TEMPLATE is missing' };
  if (!template.includes(TOKEN_PLACEHOLDER)) {
    return { ok: false, reason: 'PASSWORD_RESET_URL_TEMPLATE must contain {token}' };
  }

  try {
    const url = new URL(template.replace(TOKEN_PLACEHOLDER, 'validation-token'));
    if (url.protocol !== 'https:') {
      return { ok: false, reason: 'PASSWORD_RESET_URL_TEMPLATE must use https' };
    }
    if (!url.hostname) return { ok: false, reason: 'PASSWORD_RESET_URL_TEMPLATE must include a hostname' };
    if (process.env.NODE_ENV === 'production') {
      const canonicalDomain = getCanonicalAppDomain();
      if (!canonicalDomain) return { ok: false, reason: 'APP_DOMAIN must be a canonical HTTPS hostname' };
      if (url.hostname.toLowerCase() !== canonicalDomain || url.port) {
        return { ok: false, reason: 'PASSWORD_RESET_URL_TEMPLATE must use the canonical APP_DOMAIN' };
      }
      if (url.pathname !== '/reset-password') {
        return { ok: false, reason: 'PASSWORD_RESET_URL_TEMPLATE must use /reset-password' };
      }
      if (url.hash || url.searchParams.getAll('token').length !== 1 || url.searchParams.get('token') !== 'validation-token' || [...url.searchParams.keys()].length !== 1) {
        return { ok: false, reason: 'PASSWORD_RESET_URL_TEMPLATE must contain only the token={token} query parameter' };
      }
    }
  } catch {
    return { ok: false, reason: 'PASSWORD_RESET_URL_TEMPLATE is not a valid URL' };
  }

  return { ok: true };
};

const buildPasswordResetUrl = (token) => {
  const template = getPasswordResetUrlTemplate();
  const validation = validatePasswordResetUrlTemplate(template);
  if (!validation.ok) {
    if (process.env.NODE_ENV === 'production') throw new Error(validation.reason);
    // Development has no externally delivered email; keep a usable local
    // fallback without ever emitting a custom-scheme recovery link.
    return `http://localhost:3002/reset-password?token=${encodeURIComponent(token)}`;
  }
  return template.replace(TOKEN_PLACEHOLDER, encodeURIComponent(token));
};

module.exports = {
  TOKEN_PLACEHOLDER,
  getPasswordResetUrlTemplate,
  getCanonicalAppDomain,
  validatePasswordResetUrlTemplate,
  buildPasswordResetUrl,
};
