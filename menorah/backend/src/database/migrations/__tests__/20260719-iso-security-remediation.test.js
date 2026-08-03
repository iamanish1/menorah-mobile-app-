const Payout = require('../../../models/Payout');
const {
  reconcilePayoutProviderIndex,
} = require('../20260719-iso-security-remediation');

describe('20260719 ISO security migration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('treats an absent payouts collection as an empty index set', async () => {
    const namespaceMissing = Object.assign(
      new Error('ns does not exist: menorah.payouts'),
      {
        code: 26,
        codeName: 'NamespaceNotFound',
      }
    );
    jest.spyOn(Payout.collection, 'indexes')
      .mockRejectedValue(namespaceMissing);
    const dropIndex = jest.spyOn(Payout.collection, 'dropIndex')
      .mockResolvedValue();

    await expect(reconcilePayoutProviderIndex()).resolves.toBeUndefined();
    expect(dropIndex).not.toHaveBeenCalled();
  });

  test('does not hide index-listing failures other than a missing namespace', async () => {
    const unavailable = Object.assign(new Error('database unavailable'), {
      code: 91,
      codeName: 'ShutdownInProgress',
    });
    jest.spyOn(Payout.collection, 'indexes').mockRejectedValue(unavailable);

    await expect(reconcilePayoutProviderIndex()).rejects.toBe(unavailable);
  });
});
