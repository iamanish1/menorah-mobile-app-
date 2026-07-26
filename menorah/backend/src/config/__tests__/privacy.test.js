const {
  RETENTION_CATEGORIES,
  readPrivacyConfiguration,
} = require('../privacy');

const makePolicy = (overrides = {}) => ({
  version: 'unit-retention-policy-v1',
  categories: Object.fromEntries(RETENTION_CATEGORIES.map((category) => [
    category,
    {
      mode: 'manual',
      policyReference: `unit-policy-${category}`,
    },
  ])),
  ...overrides,
});

describe('privacy configuration', () => {
  test('requires a versioned notice and complete category inventory', () => {
    const missing = readPrivacyConfiguration({});
    expect(missing.configured).toBe(false);
    expect(missing.invalidFields).toEqual(expect.arrayContaining([
      'PRIVACY_NOTICE_VERSION',
      'PRIVACY_RETENTION_POLICY_JSON',
    ]));

    const policy = makePolicy();
    delete policy.categories.vendor_copies;
    const incomplete = readPrivacyConfiguration({
      PRIVACY_NOTICE_VERSION: 'unit-privacy-v1',
      PRIVACY_RETENTION_POLICY_JSON: JSON.stringify(policy),
    });
    expect(incomplete.configured).toBe(false);
    expect(incomplete.invalidFields).toContain('PRIVACY_RETENTION_POLICY_JSON');
  });

  test('defaults retention execution off', () => {
    const config = readPrivacyConfiguration({
      PRIVACY_NOTICE_VERSION: 'unit-privacy-v1',
      PRIVACY_RETENTION_POLICY_JSON: JSON.stringify(makePolicy()),
    });
    expect(config.configured).toBe(true);
    expect(config.retentionExecutionEnabled).toBe(false);
  });

  test.each(['TRUE', '1', 'yes', ' true '])(
    'rejects ambiguous retention execution value %p',
    (value) => {
      const config = readPrivacyConfiguration({
        PRIVACY_NOTICE_VERSION: 'unit-privacy-v1',
        PRIVACY_RETENTION_EXECUTION_ENABLED: value,
        PRIVACY_RETENTION_POLICY_JSON: JSON.stringify(makePolicy()),
      });
      expect(config.invalidFields).toContain('PRIVACY_RETENTION_EXECUTION_ENABLED');
    }
  );

  test('only automates a registered category with an explicit bounded period', () => {
    const policy = makePolicy();
    policy.categories.privacy_rights_request_payload = {
      mode: 'automated',
      policyReference: 'unit-request-payload-policy',
      retentionDays: 45,
    };
    const config = readPrivacyConfiguration({
      PRIVACY_NOTICE_VERSION: 'unit-privacy-v1',
      PRIVACY_RETENTION_EXECUTION_ENABLED: 'true',
      PRIVACY_RETENTION_POLICY_JSON: JSON.stringify(policy),
    });
    expect(config.configured).toBe(true);
    expect(config.retentionExecutionEnabled).toBe(true);
    expect(config.retentionPolicy.categories.privacy_rights_request_payload)
      .toEqual(expect.objectContaining({ retentionDays: 45 }));

    policy.categories.chat_content = {
      mode: 'automated',
      policyReference: 'unit-chat-policy',
      retentionDays: 45,
    };
    expect(readPrivacyConfiguration({
      PRIVACY_NOTICE_VERSION: 'unit-privacy-v1',
      PRIVACY_RETENTION_EXECUTION_ENABLED: 'true',
      PRIVACY_RETENTION_POLICY_JSON: JSON.stringify(policy),
    }).configured).toBe(false);
  });

  test('does not invent a period for a manual category', () => {
    const config = readPrivacyConfiguration({
      PRIVACY_NOTICE_VERSION: 'unit-privacy-v1',
      PRIVACY_RETENTION_POLICY_JSON: JSON.stringify(makePolicy()),
    });
    for (const category of RETENTION_CATEGORIES) {
      expect(config.retentionPolicy.categories[category])
        .not.toHaveProperty('retentionDays');
    }
  });
});
