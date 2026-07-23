const SERVICE_NAMES = new Set([
  'api',
  'api-ios',
  'api-android',
  'api-web',
  'api-admin',
  'worker',
]);
const AUTH_SUBJECTS = new Set(['user', 'counsellor', 'admin']);
const AUTH_METHODS = new Set([
  'password',
  'mfa',
  'federated',
  'otp',
  'password_reset',
  'other',
]);
const OUTCOMES = new Set(['success', 'failure']);
const PRIVILEGE_CATEGORIES = new Set(['privileged_role', 'admin_role']);
const WATCHED_STATUS_CODES = new Set([401, 403, 429, 500]);
const ROUTE_FAMILIES = Object.freeze([
  ['/health', '/health/*'],
  ['/metrics', '/metrics/*'],
  ['/uploads', '/uploads/*'],
  ['/api/auth', '/api/auth/*'],
  ['/api/admin', '/api/admin/*'],
  ['/api/users', '/api/users/*'],
  ['/api/counsellors', '/api/counsellors/*'],
  ['/api/bookings', '/api/bookings/*'],
  ['/api/payments', '/api/payments/*'],
  ['/api/payouts', '/api/payouts/*'],
  ['/api/chat', '/api/chat/*'],
  ['/api/video', '/api/video/*'],
  ['/api/articles', '/api/articles/*'],
  ['/api/ekyc', '/api/ekyc/*'],
  ['/api/privacy', '/api/privacy/*'],
  ['/api/welcome', '/api/welcome'],
]);

const httpResponseCounters = new Map();
const authenticationCounters = new Map();
const privilegeChangeCounters = new Map();

const increment = (map, labels) => {
  const key = labels.join('|');
  map.set(key, (map.get(key) || 0) + 1);
};

const normalizeService = (value) => {
  const service = String(value || '').trim().toLowerCase();
  return SERVICE_NAMES.has(service) ? service : 'api';
};

const getService = (req) => normalizeService(
  req?.app?.get?.('serviceName') || process.env.SERVICE_NAME || 'api'
);

const getPath = (requestOrPath) => {
  const raw = typeof requestOrPath === 'string'
    ? requestOrPath
    : requestOrPath?.originalUrl || requestOrPath?.url || '/';
  const pathname = String(raw).split(/[?#]/, 1)[0] || '/';
  return pathname.startsWith('/') ? pathname : '/';
};

const normalizeRouteTemplate = (requestOrPath) => {
  const pathname = getPath(requestOrPath);
  const family = ROUTE_FAMILIES.find(([prefix]) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (family) return family[1];
  if (pathname === '/api' || pathname.startsWith('/api/')) return '/api/other';
  return '/other';
};

const normalizeHttpStatus = (statusCode) => {
  const numeric = Number(statusCode);
  if (WATCHED_STATUS_CODES.has(numeric)) return String(numeric);
  if (Number.isInteger(numeric) && numeric >= 100 && numeric <= 599) {
    return `${Math.floor(numeric / 100)}xx`;
  }
  return 'unknown';
};

const recordHttpResponse = ({ req, statusCode }) => {
  increment(httpResponseCounters, [
    getService(req),
    normalizeRouteTemplate(req),
    normalizeHttpStatus(statusCode),
  ]);
};

const recordAuthenticationAttempt = ({
  req,
  service,
  subject,
  method,
  outcome,
}) => {
  const normalizedSubject = AUTH_SUBJECTS.has(subject) ? subject : 'user';
  const normalizedMethod = AUTH_METHODS.has(method) ? method : 'other';
  const normalizedOutcome = OUTCOMES.has(outcome) ? outcome : 'failure';
  increment(authenticationCounters, [
    normalizeService(service || getService(req)),
    normalizedSubject,
    normalizedMethod,
    normalizedOutcome,
  ]);
};

const recordPrivilegeChange = ({ service, category, outcome = 'success' }) => {
  if (!PRIVILEGE_CATEGORIES.has(category)) {
    throw new TypeError(`Unsupported privilege change category: ${category}`);
  }
  const normalizedOutcome = OUTCOMES.has(outcome) ? outcome : 'failure';
  increment(privilegeChangeCounters, [
    normalizeService(service || process.env.SERVICE_NAME),
    category,
    normalizedOutcome,
  ]);
};

const renderCounter = ({ lines, map, metricName, labels }) => {
  Array.from(map.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([key, value]) => {
      const values = key.split('|');
      const serializedLabels = labels
        .map((label, index) => `${label}="${values[index]}"`)
        .join(',');
      lines.push(`${metricName}{${serializedLabels}} ${value}`);
    });
};

const renderApplicationMetrics = () => {
  const lines = [
    '# HELP menorah_http_responses_total HTTP responses by bounded service, route family, and status.',
    '# TYPE menorah_http_responses_total counter',
  ];
  renderCounter({
    lines,
    map: httpResponseCounters,
    metricName: 'menorah_http_responses_total',
    labels: ['service', 'route', 'status'],
  });
  lines.push(
    '# HELP menorah_auth_attempts_total Authentication attempts by bounded subject, method, and outcome.',
    '# TYPE menorah_auth_attempts_total counter'
  );
  renderCounter({
    lines,
    map: authenticationCounters,
    metricName: 'menorah_auth_attempts_total',
    labels: ['service', 'subject', 'method', 'outcome'],
  });
  lines.push(
    '# HELP menorah_privilege_changes_total Privileged role changes by bounded category and outcome.',
    '# TYPE menorah_privilege_changes_total counter'
  );
  renderCounter({
    lines,
    map: privilegeChangeCounters,
    metricName: 'menorah_privilege_changes_total',
    labels: ['service', 'category', 'outcome'],
  });
  return `${lines.join('\n')}\n`;
};

const resetApplicationMetricsForTests = () => {
  httpResponseCounters.clear();
  authenticationCounters.clear();
  privilegeChangeCounters.clear();
};

module.exports = {
  normalizeHttpStatus,
  normalizeRouteTemplate,
  recordAuthenticationAttempt,
  recordHttpResponse,
  recordPrivilegeChange,
  renderApplicationMetrics,
  resetApplicationMetricsForTests,
};
