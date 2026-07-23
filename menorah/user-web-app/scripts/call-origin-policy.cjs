function readCallOrigins(value, { required = false } = {}) {
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

  if (
    !['https:', 'wss:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.port
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

  return [
    `https://${parsed.hostname.toLowerCase()}`,
    `wss://${parsed.hostname.toLowerCase()}`,
  ];
}

module.exports = { readCallOrigins };
