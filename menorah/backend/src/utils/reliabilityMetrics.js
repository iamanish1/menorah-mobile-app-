const SERVICE_NAMES = new Set([
  'api',
  'api-ios',
  'api-android',
  'api-web',
  'api-admin',
  'worker',
]);
const QUEUE_NAMES = new Set(['provider_revocation']);
const PAYMENT_PROVIDERS = new Set(['razorpay']);
const PAYMENT_OPERATIONS = new Set([
  'order_create',
  'order_recovery',
  'evidence_fetch',
  'payment_verify',
  'payout',
  'refund',
]);
const PAYMENT_WEBHOOK_EVENTS = new Set([
  'signature',
  'relationship',
  'reconciliation',
  'processing',
]);
const PAYMENT_OUTCOMES = new Set(['success', 'failure', 'disabled']);
const WEBHOOK_OUTCOMES = new Set(['success', 'failure', 'replay']);
const EMAIL_PROVIDERS = new Set(['resend']);
const EMAIL_DISPATCH_OUTCOMES = new Set([
  'attempted',
  'success',
  'failure',
  'disabled',
]);
const EMAIL_DELIVERY_OUTCOMES = new Set([
  'delivered',
  'bounced',
  'complained',
  'delayed',
  'failed',
  'suppressed',
  'other',
]);
const CALL_PROVIDERS = new Set([
  'livekit',
  'zoom',
  'vsee',
  'google_meet',
  'disabled',
]);
const CALL_OPERATIONS = new Set([
  'room_create',
  'token_create',
  'connect',
  'regional_fallback',
  'webhook',
]);
const CALL_OUTCOMES = new Set(['success', 'failure', 'disabled']);
const CALL_MEDIA = new Set(['audio', 'video']);
const MEDIA_OUTCOMES = new Set(['success', 'failure']);

const queueSnapshots = new Map();
const queueJobCounters = new Map();
const workerHeartbeats = new Map();
const paymentOperationCounters = new Map();
const paymentWebhookCounters = new Map();
const emailDispatchCounters = new Map();
const emailDeliveryCounters = new Map();
const callProviderCounters = new Map();
const callMediaCounters = new Map();

const normalizeService = (value) => {
  const normalized = String(value || process.env.SERVICE_NAME || 'api')
    .trim()
    .toLowerCase();
  return SERVICE_NAMES.has(normalized) ? normalized : 'api';
};

const increment = (map, labels) => {
  const key = labels.join('|');
  map.set(key, (map.get(key) || 0) + 1);
};

const boundedNonnegative = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
};

const requireBounded = (set, value, label) => {
  if (!set.has(value)) throw new TypeError(`Unsupported ${label}: ${value}`);
  return value;
};

const setQueueSnapshot = ({
  service = 'worker',
  queue,
  pending,
  oldestPendingAgeSeconds,
  retryBacklog,
  deadLetter,
}) => {
  requireBounded(QUEUE_NAMES, queue, 'queue');
  queueSnapshots.set(`${normalizeService(service)}|${queue}`, {
    pending: boundedNonnegative(pending),
    oldestPendingAgeSeconds: boundedNonnegative(oldestPendingAgeSeconds),
    retryBacklog: boundedNonnegative(retryBacklog),
    deadLetter: boundedNonnegative(deadLetter),
  });
};

const recordQueueJobOutcome = ({
  service = 'worker',
  queue,
  outcome,
}) => {
  requireBounded(QUEUE_NAMES, queue, 'queue');
  requireBounded(new Set(['success', 'failure']), outcome, 'queue outcome');
  increment(queueJobCounters, [normalizeService(service), queue, outcome]);
};

const recordWorkerHeartbeat = ({
  service = 'worker',
  worker,
  timestampSeconds = Date.now() / 1000,
}) => {
  requireBounded(QUEUE_NAMES, worker, 'worker');
  workerHeartbeats.set(
    `${normalizeService(service)}|${worker}`,
    boundedNonnegative(timestampSeconds)
  );
};

const recordPaymentOperation = ({
  service,
  provider,
  operation,
  outcome,
}) => {
  requireBounded(PAYMENT_PROVIDERS, provider, 'payment provider');
  requireBounded(PAYMENT_OPERATIONS, operation, 'payment operation');
  requireBounded(PAYMENT_OUTCOMES, outcome, 'payment outcome');
  increment(paymentOperationCounters, [
    normalizeService(service),
    provider,
    operation,
    outcome,
  ]);
};

const recordPaymentWebhook = ({
  service,
  provider,
  event,
  outcome,
}) => {
  requireBounded(PAYMENT_PROVIDERS, provider, 'payment provider');
  requireBounded(PAYMENT_WEBHOOK_EVENTS, event, 'payment webhook event');
  requireBounded(WEBHOOK_OUTCOMES, outcome, 'payment webhook outcome');
  increment(paymentWebhookCounters, [
    normalizeService(service),
    provider,
    event,
    outcome,
  ]);
};

const recordEmailDispatch = ({ service, provider, outcome }) => {
  requireBounded(EMAIL_PROVIDERS, provider, 'email provider');
  requireBounded(EMAIL_DISPATCH_OUTCOMES, outcome, 'email dispatch outcome');
  increment(emailDispatchCounters, [normalizeService(service), provider, outcome]);
};

const recordEmailDelivery = ({ service, provider, outcome }) => {
  requireBounded(EMAIL_PROVIDERS, provider, 'email provider');
  requireBounded(EMAIL_DELIVERY_OUTCOMES, outcome, 'email delivery outcome');
  increment(emailDeliveryCounters, [normalizeService(service), provider, outcome]);
};

const recordCallProviderOperation = ({
  service,
  provider,
  operation,
  outcome,
}) => {
  requireBounded(CALL_PROVIDERS, provider, 'call provider');
  requireBounded(CALL_OPERATIONS, operation, 'call operation');
  requireBounded(CALL_OUTCOMES, outcome, 'call outcome');
  increment(callProviderCounters, [
    normalizeService(service),
    provider,
    operation,
    outcome,
  ]);
};

const recordCallMediaOutcome = ({
  service,
  provider,
  media,
  outcome,
}) => {
  requireBounded(CALL_PROVIDERS, provider, 'call provider');
  requireBounded(CALL_MEDIA, media, 'call media');
  requireBounded(MEDIA_OUTCOMES, outcome, 'call media outcome');
  increment(callMediaCounters, [
    normalizeService(service),
    provider,
    media,
    outcome,
  ]);
};

const renderCounter = ({ lines, map, metricName, labels }) => {
  Array.from(map.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([key, value]) => {
      const values = key.split('|');
      const serialized = labels
        .map((label, index) => `${label}="${values[index]}"`)
        .join(',');
      lines.push(`${metricName}{${serialized}} ${value}`);
    });
};

const renderGaugeMap = ({ lines, map, metricName, labels }) => {
  Array.from(map.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([key, value]) => {
      const values = key.split('|');
      const serialized = labels
        .map((label, index) => `${label}="${values[index]}"`)
        .join(',');
      lines.push(`${metricName}{${serialized}} ${value}`);
    });
};

const renderQueueMetrics = (lines) => {
  const descriptors = [
    ['menorah_queue_pending_jobs', 'Pending durable jobs.', 'pending'],
    [
      'menorah_queue_oldest_pending_age_seconds',
      'Age of the oldest pending or retry job.',
      'oldestPendingAgeSeconds',
    ],
    ['menorah_queue_retry_backlog', 'Durable jobs waiting for retry.', 'retryBacklog'],
    ['menorah_queue_dead_letter_jobs', 'Durable jobs requiring manual review.', 'deadLetter'],
  ];
  for (const [metricName, help, field] of descriptors) {
    lines.push(`# HELP ${metricName} ${help}`, `# TYPE ${metricName} gauge`);
    const values = new Map(
      Array.from(queueSnapshots.entries()).map(([key, snapshot]) => [key, snapshot[field]])
    );
    renderGaugeMap({
      lines,
      map: values,
      metricName,
      labels: ['service', 'queue'],
    });
  }
  lines.push(
    '# HELP menorah_queue_jobs_total Completed durable queue attempts by outcome.',
    '# TYPE menorah_queue_jobs_total counter'
  );
  renderCounter({
    lines,
    map: queueJobCounters,
    metricName: 'menorah_queue_jobs_total',
    labels: ['service', 'queue', 'outcome'],
  });
  lines.push(
    '# HELP menorah_worker_heartbeat_timestamp_seconds Last successful worker loop heartbeat.',
    '# TYPE menorah_worker_heartbeat_timestamp_seconds gauge'
  );
  renderGaugeMap({
    lines,
    map: workerHeartbeats,
    metricName: 'menorah_worker_heartbeat_timestamp_seconds',
    labels: ['service', 'queue'],
  });
};

const renderReliabilityMetrics = () => {
  const lines = [];
  renderQueueMetrics(lines);
  const counters = [
    {
      help: 'Payment provider operations by bounded operation and outcome.',
      name: 'menorah_payment_operations_total',
      map: paymentOperationCounters,
      labels: ['service', 'provider', 'operation', 'outcome'],
    },
    {
      help: 'Payment webhook validation and processing events.',
      name: 'menorah_payment_webhook_events_total',
      map: paymentWebhookCounters,
      labels: ['service', 'provider', 'event', 'outcome'],
    },
    {
      help: 'Email dispatch attempts and terminal request outcomes.',
      name: 'menorah_email_dispatch_total',
      map: emailDispatchCounters,
      labels: ['service', 'provider', 'outcome'],
    },
    {
      help: 'Verified email provider delivery callback outcomes.',
      name: 'menorah_email_delivery_outcomes_total',
      map: emailDeliveryCounters,
      labels: ['service', 'provider', 'outcome'],
    },
    {
      help: 'Call provider operations by bounded provider, operation, and outcome.',
      name: 'menorah_call_provider_operations_total',
      map: callProviderCounters,
      labels: ['service', 'provider', 'operation', 'outcome'],
    },
    {
      help: 'Client-reported call media establishment outcomes.',
      name: 'menorah_call_media_outcomes_total',
      map: callMediaCounters,
      labels: ['service', 'provider', 'media', 'outcome'],
    },
  ];
  for (const counter of counters) {
    lines.push(`# HELP ${counter.name} ${counter.help}`, `# TYPE ${counter.name} counter`);
    renderCounter({
      lines,
      map: counter.map,
      metricName: counter.name,
      labels: counter.labels,
    });
  }
  return `${lines.join('\n')}\n`;
};

const resetReliabilityMetricsForTests = () => {
  for (const collection of [
    queueSnapshots,
    queueJobCounters,
    workerHeartbeats,
    paymentOperationCounters,
    paymentWebhookCounters,
    emailDispatchCounters,
    emailDeliveryCounters,
    callProviderCounters,
    callMediaCounters,
  ]) {
    collection.clear();
  }
};

module.exports = {
  recordCallMediaOutcome,
  recordCallProviderOperation,
  recordEmailDelivery,
  recordEmailDispatch,
  recordPaymentOperation,
  recordPaymentWebhook,
  recordQueueJobOutcome,
  recordWorkerHeartbeat,
  renderReliabilityMetrics,
  resetReliabilityMetricsForTests,
  setQueueSnapshot,
};
