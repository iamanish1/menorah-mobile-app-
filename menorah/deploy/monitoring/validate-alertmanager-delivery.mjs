#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const scalar = (value) => value.trim().replace(/^(['"])(.*)\1$/, '$2');

const DELIVERY_FIELDS = new Map([
  ['discord_configs', new Set(['webhook_url', 'webhook_url_file'])],
  ['email_configs', new Set(['to'])],
  ['msteams_configs', new Set(['webhook_url', 'webhook_url_file'])],
  ['msteamsv2_configs', new Set(['webhook_url', 'webhook_url_file'])],
  ['opsgenie_configs', new Set(['api_key', 'api_key_file'])],
  ['pagerduty_configs', new Set([
    'routing_key',
    'routing_key_file',
    'service_key',
    'service_key_file',
  ])],
  ['pushover_configs', new Set(['user_key', 'user_key_file'])],
  ['rocketchat_configs', new Set(['token', 'token_file'])],
  ['slack_configs', new Set(['api_url', 'api_url_file'])],
  ['sns_configs', new Set(['phone_number', 'target_arn', 'topic_arn'])],
  ['telegram_configs', new Set(['chat_id'])],
  ['victorops_configs', new Set(['api_key', 'api_key_file'])],
  ['webex_configs', new Set(['room_id'])],
  ['webhook_configs', new Set(['url', 'url_file'])],
  ['wechat_configs', new Set(['api_secret', 'api_secret_file'])],
]);

const isConfiguredDestination = (value) => {
  const normalized = scalar(value).trim();
  return (
    normalized.length > 0
    && !/^(?:null|~|\{\}|\[\])$/i.test(normalized)
    && !/(?:replace|placeholder|example\.invalid)/i.test(normalized)
  );
};

export function validateAlertmanagerDelivery({
  source,
  expectedSha256,
  expectedReceiver,
  testReference,
  verifiedAt,
  now = Date.now(),
}) {
  const errors = [];
  const actualSha256 = createHash('sha256').update(source).digest('hex');
  if (!/^[0-9a-f]{64}$/.test(expectedSha256 || '') || actualSha256 !== expectedSha256) {
    errors.push('ALERTMANAGER_CONFIG_SHA256 does not match the tested config');
  }
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(expectedReceiver || '')) {
    errors.push('ALERTMANAGER_DELIVERY_RECEIVER is invalid');
  }
  if (
    typeof testReference !== 'string'
    || testReference.length < 8
    || testReference.length > 200
    || /[\r\n]|replace|placeholder/i.test(testReference)
  ) {
    errors.push('ALERTMANAGER_DELIVERY_TEST_REFERENCE is invalid');
  }

  const verifiedEpoch = Date.parse(verifiedAt || '');
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  if (
    !Number.isFinite(verifiedEpoch)
    || verifiedEpoch > now + 5 * 60 * 1000
    || now - verifiedEpoch > maxAgeMs
  ) {
    errors.push('ALERTMANAGER_DELIVERY_VERIFIED_AT is not within the last 30 days');
  }

  const lines = source.split(/\r?\n/);
  let section = '';
  let rootReceiver = '';
  let currentReceiver = '';
  let currentIntegration = '';
  const routeReceivers = new Set();
  const deliveringReceivers = new Set();
  const receiverCounts = new Map();
  const integrationPattern = /^    ([a-z][a-z0-9_]*_configs):\s*(.*)$/;

  for (const line of lines) {
    if (/^[A-Za-z_][A-Za-z0-9_]*:\s*(?:#.*)?$/.test(line)) {
      section = line.split(':', 1)[0];
      currentReceiver = '';
      currentIntegration = '';
      continue;
    }
    if (section === 'route') {
      const match = line.match(/^(\s+)(-\s+)?receiver:\s*([^#]+?)\s*(?:#.*)?$/);
      if (match) {
        const receiver = scalar(match[3]);
        routeReceivers.add(receiver);
        if (match[1].length === 2 && !match[2] && !rootReceiver) rootReceiver = receiver;
      }
    }
    if (section !== 'receivers') continue;
    const receiverMatch = line.match(/^  - name:\s*([^#]+?)\s*(?:#.*)?$/);
    if (receiverMatch) {
      currentReceiver = scalar(receiverMatch[1]);
      receiverCounts.set(
        currentReceiver,
        (receiverCounts.get(currentReceiver) || 0) + 1,
      );
      currentIntegration = '';
      continue;
    }
    const integrationMatch = line.match(integrationPattern);
    if (integrationMatch && currentReceiver) {
      currentIntegration = integrationMatch[1];
      continue;
    }
    if (currentReceiver && currentIntegration) {
      const fieldMatch = line.match(
        /^\s{6,}-?\s*([a-z][a-z0-9_]*):\s*([^#]+?)\s*(?:#.*)?$/,
      );
      if (
        fieldMatch
        && DELIVERY_FIELDS.get(currentIntegration)?.has(fieldMatch[1])
        && isConfiguredDestination(fieldMatch[2])
      ) {
        deliveringReceivers.add(currentReceiver);
      }
    }
  }

  if (rootReceiver !== expectedReceiver) {
    errors.push('tested receiver does not match the root route');
  }
  if (routeReceivers.size === 0 || [...routeReceivers].some((name) => name !== expectedReceiver)) {
    errors.push('every route must use the single receiver covered by delivery evidence');
  }
  if (receiverCounts.get(expectedReceiver) !== 1) {
    errors.push('the tested receiver must have exactly one receiver definition');
  }
  if (!deliveringReceivers.has(expectedReceiver)) {
    errors.push('the tested receiver has no non-empty delivery integration');
  }
  return errors;
}

function main() {
  const configPath = process.env.ALERTMANAGER_CONFIG_FILE;
  if (!configPath) throw new Error('ALERTMANAGER_CONFIG_FILE is required');
  const source = readFileSync(configPath, 'utf8');
  const errors = validateAlertmanagerDelivery({
    source,
    expectedSha256: process.env.ALERTMANAGER_CONFIG_SHA256,
    expectedReceiver: process.env.ALERTMANAGER_DELIVERY_RECEIVER,
    testReference: process.env.ALERTMANAGER_DELIVERY_TEST_REFERENCE,
    verifiedAt: process.env.ALERTMANAGER_DELIVERY_VERIFIED_AT,
  });
  if (errors.length > 0) throw new Error(`Alertmanager delivery validation failed:\n- ${errors.join('\n- ')}`);
  console.log('Alertmanager delivery evidence and routing validate.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
