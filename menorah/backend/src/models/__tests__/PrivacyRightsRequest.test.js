const mongoose = require('mongoose');
const PrivacyRightsRequest = require('../PrivacyRightsRequest');

describe('PrivacyRightsRequest model', () => {
  const user = new mongoose.Types.ObjectId();

  test('requires an encrypted payload when a durable request is created', async () => {
    const request = new PrivacyRightsRequest({
      user,
      requestType: 'correction',
      source: 'api-web',
      correctionFields: ['email'],
      contactChannel: 'in_app',
    });

    await expect(request.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        payloadEncrypted: expect.any(Object),
      }),
    });
  });

  test('accepts ciphertext without any plaintext detail field', async () => {
    const request = new PrivacyRightsRequest({
      user,
      requestType: 'grievance',
      source: 'api-android',
      payloadEncrypted: 'v1:iv:tag:ciphertext',
    });

    await expect(request.validate()).resolves.toBeUndefined();
    expect(request.toObject()).not.toHaveProperty('description');
    expect(request.toObject()).not.toHaveProperty('message');
  });
});
