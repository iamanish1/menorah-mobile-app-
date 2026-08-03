const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_PUSH_BATCH_SIZE = 100;
const MAX_RECEIPT_BATCH_SIZE = 1000;

class ExpoPushError extends Error {
  constructor(code, statusCode = 0) {
    super(code);
    this.name = 'ExpoPushError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const pushHeaders = () => {
  const accessToken = String(process.env.EXPO_PUSH_ACCESS_TOKEN || '').trim();
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
};

const postExpo = async (url, body, { fetchImpl = global.fetch } = {}) => {
  if (typeof fetchImpl !== 'function') {
    throw new ExpoPushError('PUSH_TRANSPORT_UNAVAILABLE');
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: pushHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    throw new ExpoPushError('PUSH_TRANSPORT_FAILED');
  }

  if (!response.ok) {
    throw new ExpoPushError('PUSH_PROVIDER_REJECTED', response.status);
  }

  try {
    return await response.json();
  } catch {
    throw new ExpoPushError('PUSH_PROVIDER_RESPONSE_INVALID', response.status);
  }
};

const chunk = (items, size) => {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const sendExpoPushMessages = async (messages, options = {}) => {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const tickets = [];
  for (const batch of chunk(messages, MAX_PUSH_BATCH_SIZE)) {
    const payload = await postExpo(EXPO_PUSH_SEND_URL, batch, options);
    const batchTickets = Array.isArray(payload?.data) ? payload.data : [payload?.data];
    if (batchTickets.length !== batch.length || batchTickets.some((ticket) => !ticket)) {
      throw new ExpoPushError('PUSH_TICKET_RESPONSE_INVALID');
    }
    tickets.push(...batchTickets);
  }
  return tickets;
};

const getExpoPushReceipts = async (receiptIds, options = {}) => {
  if (!Array.isArray(receiptIds) || receiptIds.length === 0) return {};

  const receipts = {};
  for (const batch of chunk(receiptIds, MAX_RECEIPT_BATCH_SIZE)) {
    const payload = await postExpo(
      EXPO_PUSH_RECEIPTS_URL,
      { ids: batch },
      options
    );
    Object.assign(receipts, payload?.data || {});
  }
  return receipts;
};

module.exports = {
  EXPO_PUSH_RECEIPTS_URL,
  EXPO_PUSH_SEND_URL,
  ExpoPushError,
  getExpoPushReceipts,
  sendExpoPushMessages,
};
