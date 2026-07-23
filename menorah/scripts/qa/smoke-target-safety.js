const PRODUCTION_HOSTS = new Set([
  'api-web.menorah.me',
  'api-ios.menorah.me',
  'api-android.menorah.me',
  'api-admin.menorah.me',
  'api.menorah.me',
  'menorah.me',
  'www.menorah.me',
  'app.menorah.me',
  'admin.menorah.me',
  'counsellor.menorah.me',
  'calls.menorah.me',
  'vps.menorah.me',
]);

const PRODUCTION_CONFIRMATION = 'ALLOW_APPROVED_PRODUCTION_SMOKE';
const SYNTHETIC_DATA_CONFIRMATION = 'PROJECT_OWNED_SYNTHETIC_DATA_ONLY';

function requireHttpsTarget(name, value) {
  const candidate = String(value || '').trim();
  if (!candidate) throw new Error(`${name} is required; there is no default target`);

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
  ) {
    throw new Error(
      `${name} must be a credential-free HTTPS URL without a port, trailing-dot alias, query, or fragment`
    );
  }

  return candidate.replace(/\/+$/, '');
}

function requireSyntheticEmail(env) {
  const email = String(env.QA_EMAIL || '').trim();
  if (
    !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)
    || env.QA_SYNTHETIC_DATA_CONFIRM !== SYNTHETIC_DATA_CONFIRMATION
  ) {
    throw new Error(
      `QA_EMAIL and QA_SYNTHETIC_DATA_CONFIRM=${SYNTHETIC_DATA_CONFIRMATION} are required`
    );
  }
  return email;
}

function validateOptionalSyntheticAdminCredentials(env) {
  const email = String(env.QA_ADMIN_EMAIL || '').trim();
  const password = String(env.QA_ADMIN_PASSWORD || '');
  if (!email && !password) return;
  if (
    !email
    || !password
    || !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)
    || env.QA_SYNTHETIC_DATA_CONFIRM !== SYNTHETIC_DATA_CONFIRMATION
  ) {
    throw new Error(
      'Staging admin smoke requires both synthetic admin credentials and QA_SYNTHETIC_DATA_CONFIRM'
    );
  }
}

function validateSmokeTargets(env, namedTargets) {
  const environment = String(env.QA_TARGET_ENVIRONMENT || '').trim();
  if (!['staging', 'production'].includes(environment)) {
    throw new Error('QA_TARGET_ENVIRONMENT must be exactly staging or production');
  }

  const targets = Object.fromEntries(
    Object.entries(namedTargets).map(([name, value]) => [
      name,
      requireHttpsTarget(name, value),
    ])
  );
  const productionTargets = Object.entries(targets).filter(([, value]) =>
    PRODUCTION_HOSTS.has(new URL(value).hostname.toLowerCase())
  );

  if (environment === 'staging') {
    if (productionTargets.length > 0) {
      throw new Error(
        `Staging smoke tests cannot target production: ${productionTargets
          .map(([name]) => name)
          .join(', ')}`
      );
    }

    const allowedHosts = new Set(
      String(env.QA_STAGING_ALLOWED_HOSTS || '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
    );
    if (allowedHosts.size === 0) {
      throw new Error('QA_STAGING_ALLOWED_HOSTS must list the approved staging hosts');
    }
    for (const host of allowedHosts) {
      if (
        host.endsWith('.')
        || PRODUCTION_HOSTS.has(host)
        || !/(?:^|[.-])(?:staging|security-test)(?:[.-]|$)/.test(host)
      ) {
        throw new Error(`QA_STAGING_ALLOWED_HOSTS contains an unsafe host: ${host}`);
      }
    }

    const unapprovedTargets = Object.entries(targets).filter(([, value]) =>
      !allowedHosts.has(new URL(value).hostname.toLowerCase())
    );
    if (unapprovedTargets.length > 0) {
      throw new Error(
        `Staging smoke targets are not in QA_STAGING_ALLOWED_HOSTS: ${unapprovedTargets
          .map(([name]) => name)
          .join(', ')}`
      );
    }
  }

  if (environment === 'production') {
    if (env.QA_ALLOW_PRODUCTION_SMOKE !== PRODUCTION_CONFIRMATION) {
      throw new Error(
        `Production smoke requires QA_ALLOW_PRODUCTION_SMOKE=${PRODUCTION_CONFIRMATION}`
      );
    }
    if (!String(env.QA_PRODUCTION_CHANGE_REFERENCE || '').trim()) {
      throw new Error('Production smoke requires QA_PRODUCTION_CHANGE_REFERENCE');
    }
    if (productionTargets.length !== Object.keys(targets).length) {
      throw new Error('Production smoke targets must use only approved Menorah production hosts');
    }
  }

  return targets;
}

module.exports = {
  PRODUCTION_CONFIRMATION,
  PRODUCTION_HOSTS,
  SYNTHETIC_DATA_CONFIRMATION,
  requireHttpsTarget,
  requireSyntheticEmail,
  validateOptionalSyntheticAdminCredentials,
  validateSmokeTargets,
};
