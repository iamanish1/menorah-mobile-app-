const PASSWORD_RESET_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const NAVIGATION_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

function isValidPasswordResetToken(value) {
  return typeof value === 'string' && PASSWORD_RESET_TOKEN_PATTERN.test(value);
}

function extractPasswordResetToken(fragment) {
  if (typeof fragment !== 'string' || fragment.length === 0 || fragment.length > 256) {
    return null;
  }

  const normalizedFragment = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  const params = new URLSearchParams(normalizedFragment);
  const entries = Array.from(params.entries());
  const tokens = params.getAll('token');

  if (entries.length !== 1 || tokens.length !== 1) {
    return null;
  }

  const token = tokens[0];
  return isValidPasswordResetToken(token) ? token : null;
}

function splitDeepLinkPath(path) {
  if (typeof path !== 'string' || path.length > 2_048) {
    return null;
  }

  const fragmentIndex = path.indexOf('#');
  const pathAndQuery = fragmentIndex === -1 ? path : path.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? '' : path.slice(fragmentIndex + 1);
  const queryIndex = pathAndQuery.indexOf('?');
  const pathname = queryIndex === -1
    ? pathAndQuery
    : pathAndQuery.slice(0, queryIndex);

  return { pathname, fragment };
}

function isSafeNavigationIdentifier(value) {
  return typeof value === 'string' && NAVIGATION_IDENTIFIER_PATTERN.test(value);
}

module.exports = {
  extractPasswordResetToken,
  isSafeNavigationIdentifier,
  isValidPasswordResetToken,
  splitDeepLinkPath,
};
