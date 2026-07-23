export function extractPasswordResetToken(fragment: string): string | null;
export function isSafeNavigationIdentifier(value: unknown): value is string;
export function isValidPasswordResetToken(value: unknown): value is string;
export function splitDeepLinkPath(
  path: unknown
): { pathname: string; fragment: string } | null;
