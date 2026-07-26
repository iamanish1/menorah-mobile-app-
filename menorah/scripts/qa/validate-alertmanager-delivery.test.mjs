import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { validateAlertmanagerDelivery } from '../../deploy/monitoring/validate-alertmanager-delivery.mjs';

const NOW = Date.parse('2026-07-23T12:00:00Z');
const deliveringConfig = `route:
  receiver: paging
receivers:
  - name: paging
    webhook_configs:
      - url_file: /run/secrets/paging-url
`;

const validate = (source) => validateAlertmanagerDelivery({
  source,
  expectedSha256: createHash('sha256').update(source).digest('hex'),
  expectedReceiver: 'paging',
  testReference: 'INC-2026-0042 acknowledged',
  verifiedAt: '2026-07-22T12:00:00Z',
  now: NOW,
});

test('accepts one tested delivering receiver for every route', () => {
  assert.deepEqual(validate(deliveringConfig), []);
});

test('rejects a child route that bypasses delivery through a no-op receiver', () => {
  const source = `route:
  receiver: paging
  routes:
    - receiver: noop
      matchers:
        - severity="critical"
receivers:
  - name: paging
    webhook_configs:
      - url_file: /run/secrets/paging-url
  - name: noop
`;
  assert.match(validate(source).join('\n'), /every route must use the single receiver/);
});

test('rejects a name-only root receiver', () => {
  const source = `route:
  receiver: paging
receivers:
  - name: paging
`;
  assert.match(validate(source).join('\n'), /no non-empty delivery integration/);
});

test('rejects an empty integration object', () => {
  const source = `route:
  receiver: paging
receivers:
  - name: paging
    webhook_configs:
      - {}
`;
  assert.match(validate(source).join('\n'), /no non-empty delivery integration/);
});

test('rejects a non-destination field and placeholder URL', () => {
  const source = `route:
  receiver: paging
receivers:
  - name: paging
    webhook_configs:
      - send_resolved: true
        url: https://example.invalid/placeholder
`;
  assert.match(validate(source).join('\n'), /no non-empty delivery integration/);
});

test('rejects duplicate definitions of the tested receiver', () => {
  const source = `${deliveringConfig}  - name: paging
    webhook_configs:
      - url_file: /run/secrets/other-paging-url
`;
  assert.match(validate(source).join('\n'), /exactly one receiver definition/);
});
