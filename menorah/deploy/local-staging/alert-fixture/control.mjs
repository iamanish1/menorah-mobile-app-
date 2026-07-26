#!/usr/bin/env node

import path from 'node:path';
import {
  pathToFileURL,
} from 'node:url';

import {
  DEFAULT_PORT,
  EXPECTED_ENVIRONMENT_ID,
  EXPECTED_PROJECT,
  SERVER_STAGING_ENVIRONMENT_ID,
} from './server.mjs';

const ACTIONS = new Map([
  ['baseline', ['/control/baseline', undefined]],
  ['trigger', ['/control/trigger', undefined]],
  ['reset', ['/control/reset', undefined]],
  ['backup-failure', ['/control/backup', { result: 'failure' }]],
  ['backup-success', ['/control/backup', { result: 'success' }]],
]);

export const SERVER_STAGING_VALIDATION_PROJECT =
  'menorah-server-staging-validation';
export const SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION =
  'EXERCISE_EXACT_MENORAH_SERVER_STAGING_VALIDATION_P0_ALERTS';
export const SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION_KEY =
  'MENORAH_SERVER_STAGING_ALERT_EXERCISE_CONFIRM';

export const resolveControlIdentity = (environment = {}) => {
  const project = environment.COMPOSE_PROJECT_NAME;
  const localEnvironmentId =
    environment.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID;
  const serverEnvironmentId =
    environment.MENORAH_SERVER_STAGING_ENVIRONMENT_ID;

  if (
    project === EXPECTED_PROJECT
    && localEnvironmentId === EXPECTED_ENVIRONMENT_ID
    && !serverEnvironmentId
  ) {
    return Object.freeze({
      environmentId: EXPECTED_ENVIRONMENT_ID,
      project: EXPECTED_PROJECT,
    });
  }

  if (
    project === SERVER_STAGING_VALIDATION_PROJECT
    && !localEnvironmentId
    && serverEnvironmentId === SERVER_STAGING_ENVIRONMENT_ID
    && environment[SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION_KEY]
      === SERVER_STAGING_ALERT_EXERCISE_CONFIRMATION
  ) {
    return Object.freeze({
      environmentId: SERVER_STAGING_ENVIRONMENT_ID,
      project: SERVER_STAGING_VALIDATION_PROJECT,
    });
  }

  return null;
};

export const executeControlAction = async (
  action,
  {
    environment = process.env,
    fetchImplementation = fetch,
  } = {},
) => {
  const request = ACTIONS.get(action);
  const identity = resolveControlIdentity(environment);
  if (!request || !identity) {
    throw new Error('Local alert fixture control refused');
  }

  const [pathname, payload] = request;
  const response = await fetchImplementation(
    `http://127.0.0.1:${DEFAULT_PORT}${pathname}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Menorah-Compose-Project': identity.project,
        'X-Menorah-Environment-Id': identity.environmentId,
      },
      body: payload ? JSON.stringify(payload) : '',
    },
  );

  if (response.status !== 204) {
    throw new Error('Local alert fixture control failed');
  }
};

const isMain = (
  process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
);

if (isMain) {
  try {
    await executeControlAction(process.argv[2]);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
