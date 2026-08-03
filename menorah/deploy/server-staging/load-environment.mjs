#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  isForbiddenServerStagingEnvironmentKey,
  parseEnvironmentSource,
} from './validate-environment.mjs';

export const COMPLETION_KEY =
  'MENORAH_SERVER_STAGING_DOTENV_LOAD_COMPLETE';
export const COMPLETION_VALUE = 'safe-dotenv-v1';

const parseFailure = (reason) => {
  const error = new Error(
    `Server-staging environment rejected: ${reason}`,
  );
  error.code = 'invalid_server_staging_environment';
  return error;
};

export const parseEnvironment = (source) => {
  if (typeof source !== 'string' || source.includes('\0')) {
    throw parseFailure('input must be NUL-free text');
  }
  if (source.replaceAll('\r\n', '').includes('\r')) {
    throw parseFailure('unexpected carriage return');
  }

  let record;
  try {
    record = parseEnvironmentSource(source, 'server-staging.env');
  } catch (error) {
    error.code = 'invalid_server_staging_environment';
    throw error;
  }
  for (const [key, value] of Object.entries(record)) {
    if (
      key === COMPLETION_KEY
      || isForbiddenServerStagingEnvironmentKey(key)
    ) {
      throw parseFailure('reserved or process-influencing key');
    }
    if (value.includes('\0')) {
      throw parseFailure('decoded values must be NUL-free');
    }
  }
  return new Map(Object.entries(record));
};

export const encodeEnvironment = (values) => {
  const fields = [];
  for (const [key, value] of values) {
    if (key.includes('\0') || value.includes('\0')) {
      throw parseFailure('encoded fields must be NUL-free');
    }
    fields.push(key, value);
  }
  fields.push(COMPLETION_KEY, COMPLETION_VALUE);
  return Buffer.from(`${fields.join('\0')}\0`, 'utf8');
};

const run = async () => {
  if (process.argv.length !== 4 || process.argv[2] !== '--emit0') {
    throw new Error(
      'usage: load-environment.mjs --emit0 /canonical/path/to/environment',
    );
  }
  const source = await readFile(process.argv[3], 'utf8');
  process.stdout.write(encodeEnvironment(parseEnvironment(source)));
};

const isMain = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  run().catch((error) => {
    const message = error?.code === 'invalid_server_staging_environment'
      ? error.message
      : 'Server-staging environment could not be loaded safely';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
