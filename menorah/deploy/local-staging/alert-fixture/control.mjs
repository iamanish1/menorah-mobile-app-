#!/usr/bin/env node

import {
  DEFAULT_PORT,
  EXPECTED_ENVIRONMENT_ID,
  EXPECTED_PROJECT,
} from './server.mjs';

const ACTIONS = new Map([
  ['baseline', ['/control/baseline', undefined]],
  ['trigger', ['/control/trigger', undefined]],
  ['reset', ['/control/reset', undefined]],
  ['backup-failure', ['/control/backup', { result: 'failure' }]],
  ['backup-success', ['/control/backup', { result: 'success' }]],
]);

const action = process.argv[2];
const request = ACTIONS.get(action);
if (
  !request
  || process.env.COMPOSE_PROJECT_NAME !== EXPECTED_PROJECT
  || process.env.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID
    !== EXPECTED_ENVIRONMENT_ID
) {
  process.stderr.write('Local alert fixture control refused\n');
  process.exit(1);
}

const [pathname, payload] = request;
const response = await fetch(`http://127.0.0.1:${DEFAULT_PORT}${pathname}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Menorah-Compose-Project': EXPECTED_PROJECT,
    'X-Menorah-Environment-Id': EXPECTED_ENVIRONMENT_ID,
  },
  body: payload ? JSON.stringify(payload) : '',
});

if (response.status !== 204) {
  process.stderr.write('Local alert fixture control failed\n');
  process.exit(1);
}
