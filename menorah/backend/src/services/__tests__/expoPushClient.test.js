const {
  EXPO_PUSH_RECEIPTS_URL,
  EXPO_PUSH_SEND_URL,
  getExpoPushReceipts,
  sendExpoPushMessages,
} = require('../expoPushClient');

describe('expoPushClient', () => {
  test('sends messages to the Expo endpoint without logging payloads', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ status: 'ok', id: 'receipt-1' }] }),
    });

    const messages = [{ to: 'ExponentPushToken[token]', title: 'New message' }];
    await expect(sendExpoPushMessages(messages, { fetchImpl })).resolves.toEqual([
      { status: 'ok', id: 'receipt-1' },
    ]);
    expect(fetchImpl.mock.calls[0][0]).toBe(EXPO_PUSH_SEND_URL);
  });

  test('retrieves delivery receipts', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { 'receipt-1': { status: 'ok' } } }),
    });

    await expect(getExpoPushReceipts(['receipt-1'], { fetchImpl })).resolves.toEqual({
      'receipt-1': { status: 'ok' },
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(EXPO_PUSH_RECEIPTS_URL);
  });
});
