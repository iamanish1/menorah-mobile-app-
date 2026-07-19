const PAYOUT_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const RECENT_ADMIN_MFA_MAX_AGE_MS = 5 * 60 * 1000;
const NON_TERMINAL_PROVIDER_STATUSES = ['processing', 'queued', 'pending', 'on_hold'];
const payoutInFlightStatuses = Object.freeze(['awaiting_approval', ...NON_TERMINAL_PROVIDER_STATUSES]);

const reservedPayoutStatuses = new Set([
  ...payoutInFlightStatuses,
  'processed',
]);

const toNonNegativeInteger = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const getMaximumPayoutPaise = () => {
  const raw = String(process.env.MAX_PAYOUT_AMOUNT_PAISE || '').trim();
  const configured = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(configured) || configured < 100) {
    throw new Error('MAX_PAYOUT_AMOUNT_PAISE must contain an approved payout limit');
  }
  return configured;
};

const calculateEarnedPaise = ({ paidRevenueRupees, commissionRate }) => {
  const revenuePaise = toNonNegativeInteger(Number(paidRevenueRupees) * 100);
  const commission = Math.min(100, Math.max(0, Number(commissionRate) || 0));
  return Math.floor(revenuePaise * (1 - commission / 100));
};

const calculatePayoutAvailability = ({ paidRevenueRupees, commissionRate, reservedPaise }) => {
  const earnedPaise = calculateEarnedPaise({ paidRevenueRupees, commissionRate });
  const alreadyReservedPaise = toNonNegativeInteger(reservedPaise);
  return {
    earnedPaise,
    reservedPaise: alreadyReservedPaise,
    availablePaise: Math.max(0, earnedPaise - alreadyReservedPaise),
  };
};

const isRecentAdminMfa = (decoded, now = Date.now()) => {
  const verifiedAt = Number(decoded?.mfaAuthenticatedAt);
  return Number.isFinite(verifiedAt)
    && verifiedAt <= now
    && now - verifiedAt <= RECENT_ADMIN_MFA_MAX_AGE_MS;
};

const isValidPayoutIdempotencyKey = (value) =>
  /^[A-Za-z0-9_-]{16,128}$/.test(String(value || ''));

const getProviderPayoutIdempotencyKey = (payout) => {
  const key = String(payout?._id || '');
  if (!/^[A-Za-z0-9_-]{4,36}$/.test(key)) {
    throw new Error('Payout record cannot be mapped to a provider idempotency key');
  }
  return key;
};

const isDefinitiveProviderFailure = (error) => {
  if (error?.statusCode === 503 && !error?.response) return true;
  const status = Number(error?.response?.status);
  return Number.isInteger(status)
    && status >= 400
    && status < 500
    && ![408, 409, 429].includes(status);
};

const getPermittedPriorPayoutStatuses = (newStatus) => {
  if (NON_TERMINAL_PROVIDER_STATUSES.includes(newStatus)) {
    return [...NON_TERMINAL_PROVIDER_STATUSES];
  }
  if (newStatus === 'processed') {
    return [...NON_TERMINAL_PROVIDER_STATUSES, 'processed'];
  }
  if (newStatus === 'reversed') {
    return [...NON_TERMINAL_PROVIDER_STATUSES, 'processed', 'reversed'];
  }
  if (['cancelled', 'failed', 'rejected'].includes(newStatus)) {
    return [...NON_TERMINAL_PROVIDER_STATUSES, newStatus];
  }
  return null;
};

module.exports = {
  PAYOUT_APPROVAL_TTL_MS,
  RECENT_ADMIN_MFA_MAX_AGE_MS,
  payoutInFlightStatuses,
  reservedPayoutStatuses,
  getMaximumPayoutPaise,
  calculateEarnedPaise,
  calculatePayoutAvailability,
  getProviderPayoutIdempotencyKey,
  isDefinitiveProviderFailure,
  getPermittedPriorPayoutStatuses,
  isValidPayoutIdempotencyKey,
  isRecentAdminMfa,
};
