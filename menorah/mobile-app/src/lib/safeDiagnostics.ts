type ErrorLike = {
  name?: unknown;
  code?: unknown;
  response?: {
    status?: unknown;
  };
};

const SAFE_ERROR_NAMES = new Set([
  'AbortError',
  'AxiosError',
  'Error',
  'TypeError',
]);
const SAFE_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ERR_BAD_REQUEST',
  'ERR_CANCELED',
  'ERR_NETWORK',
  'ETIMEDOUT',
  'NETWORK_ERROR',
]);

const diagnosticLabel = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(value)
    ? value
    : undefined;

const diagnosticName = (value: unknown): string | undefined =>
  typeof value === 'string' && SAFE_ERROR_NAMES.has(value)
    ? value
    : undefined;

const diagnosticCode = (value: unknown): string | undefined =>
  typeof value === 'string' && SAFE_ERROR_CODES.has(value)
    ? value
    : undefined;

const diagnosticStatus = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;

export function reportEvent(event: string): void {
  if (__DEV__) {
    console.log(`[diagnostic] ${diagnosticLabel(event) ?? 'invalid_event'}`);
  }
}

export function reportError(event: string, error?: unknown): void {
  if (!__DEV__) {
    return;
  }

  const candidate = (
    typeof error === 'object' && error !== null ? error : {}
  ) as ErrorLike;
  const diagnostic = {
    name: diagnosticName(candidate.name),
    code: diagnosticCode(candidate.code),
    status: diagnosticStatus(candidate.response?.status),
  };

  console.warn(
    `[diagnostic] ${diagnosticLabel(event) ?? 'invalid_event'}`,
    diagnostic
  );
}
