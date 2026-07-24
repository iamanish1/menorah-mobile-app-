function readCallOrigins(
  value,
  {
    required = false,
    environment = process.env,
  } = {}
) {
  const candidate = String(value || '').trim();
  if (!candidate) {
    if (required) throw new Error('NEXT_PUBLIC_CALLS_URL is required for production builds');
    return [];
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('NEXT_PUBLIC_CALLS_URL must be an exact HTTPS or WSS origin');
  }

  const localStagingPort = String(
    environment.MENORAH_LOCAL_STAGING_HTTPS_PORT || ''
  ).trim();
  const isExactLocalStagingOrigin = (
    environment.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID
      === 'menorah-local-staging-v1'
    && localStagingPort === '28443'
    && parsed.port === localStagingPort
    && parsed.hostname.endsWith('.staging.localhost')
  );

  if (
    !['https:', 'wss:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || (parsed.port && !isExactLocalStagingOrigin)
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || parsed.hostname.endsWith('.')
    || candidate !== parsed.origin
  ) {
    throw new Error(
      'NEXT_PUBLIC_CALLS_URL must be a credential-free HTTPS or WSS origin without path, port, query, or fragment'
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const portSuffix = parsed.port ? `:${parsed.port}` : '';
  return [
    `https://${hostname}${portSuffix}`,
    `wss://${hostname}${portSuffix}`,
  ];
}

module.exports = { readCallOrigins };
