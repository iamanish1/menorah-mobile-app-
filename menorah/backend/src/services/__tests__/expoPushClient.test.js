const {
  EXPO_PUSH_RECEIPTS_URL,
  EXPO_PUSH_SEND_URL,
  getExpoPushReceipts,
  sendExpoPushMessages,
} = require('../expoPushClient');

describe('expoPushClient', () => {
  const originalAccessToken = process.env.EXPO_PUSH_ACCESS_TOKEN;

  afterEach(() => {
    if (originalAccessToken === undefined) delete process.env.EXPO_PUSH_ACCESS_TOKEN;
    else process.env.EXPO_PUSH_ACCESS_TOKEN = originalAccessToken;
  });

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

  test('authenticates send and receipt requests when enhanced push security is enabled', async () => {
    process.env.EXPO_PUSH_ACCESS_TOKEN = `  expo_${'a'.repeat(48)}  `;
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ status: 'ok', id: 'receipt-secure' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { 'receipt-secure': { status: 'ok' } } }),
      });

    await sendExpoPushMessages([{ to: 'ExponentPushToken[token]', title: 'Update' }], { fetchImpl });
    await getExpoPushReceipts(['receipt-secure'], { fetchImpl });

    for (const [, request] of fetchImpl.mock.calls) {
      expect(request.headers.Authorization).toBe(`Bearer expo_${'a'.repeat(48)}`);
    }
  });
});
