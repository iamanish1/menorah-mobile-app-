const PROFILE_COMPLETION_RETURN_PATH = 'menorah:profile-completion-return-path';
const PROFILE_COMPLETION_PATH = '/complete-profile';
const DEFAULT_RETURN_PATH = '/discover';

const isSafeReturnPath = (candidate: string) => {
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return false;

  try {
    const parsed = new URL(candidate, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname !== PROFILE_COMPLETION_PATH;
  } catch {
    return false;
  }
};

export const rememberProfileCompletionReturnPath = () => {
  const candidate = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  try {
    if (isSafeReturnPath(candidate)) {
      sessionStorage.setItem(PROFILE_COMPLETION_RETURN_PATH, candidate);
    }
  } catch {
    // Storage can be disabled in hardened browser modes. The completion page
    // still has a safe Discover fallback in that case.
  }
};

export const consumeProfileCompletionReturnPath = () => {
  try {
    const candidate = sessionStorage.getItem(PROFILE_COMPLETION_RETURN_PATH) || '';
    sessionStorage.removeItem(PROFILE_COMPLETION_RETURN_PATH);
    return isSafeReturnPath(candidate) ? candidate : DEFAULT_RETURN_PATH;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
};
