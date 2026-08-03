#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EXPECTED_PROJECT = 'menorah-staging';
const SERVICE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const IMAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;
const DIGEST_REFERENCE_PATTERN = /@sha256:[0-9a-f]{64}$/;

const fail = (message) => {
  throw new Error(`server-staging service lifecycle refused: ${message}`);
};

const assertSafeService = (service) => {
  if (!SERVICE_PATTERN.test(service)) {
    fail(`invalid Compose service name: ${service}`);
  }
};

const assertSafeReference = (service, reference) => {
  if (
    typeof reference !== 'string'
    || reference.length === 0
    || /[\s|]/.test(reference)
  ) {
    fail(`invalid image reference for ${service}`);
  }
};

export const parseLifecycleManifest = (source) => {
  if (typeof source !== 'string' || source.length === 0) {
    fail('release manifest is empty');
  }

  const records = [];
  const services = new Set();
  for (const line of source.split(/\r?\n/)) {
    if (line.length === 0) {
      continue;
    }
    const fields = line.split('|');
    if (fields.length !== 3) {
      fail('release manifest record must contain exactly three fields');
    }
    const [service, reference, imageId] = fields;
    assertSafeService(service);
    assertSafeReference(service, reference);
    if (
      !reference.includes('/menorah-staging/')
      || reference.includes('/menorah/')
      || !DIGEST_REFERENCE_PATTERN.test(reference)
      || !IMAGE_ID_PATTERN.test(imageId)
    ) {
      fail(`invalid staging artifact identity for ${service}`);
    }
    if (services.has(service)) {
      fail(`duplicate release manifest service: ${service}`);
    }
    services.add(service);
    records.push(Object.freeze({ service, reference, imageId }));
  }

  if (records.length === 0) {
    fail('release manifest contains no records');
  }
  if (!services.has('staging-migrate')) {
    fail('release manifest omits staging-migrate');
  }
  return Object.freeze(records);
};

const lifecycleKind = (service, definition) => {
  if (
    Array.isArray(definition.profiles)
    && definition.profiles.length > 0
  ) {
    return 'profile';
  }
  if (definition.restart === 'no') {
    return 'oneshot';
  }
  if (
    typeof definition.restart !== 'string'
    || definition.restart.length === 0
  ) {
    fail(`service lifecycle is ambiguous for ${service}`);
  }
  return 'runtime';
};

const healthRequirement = (definition) => (
  definition.healthcheck
  && definition.healthcheck.disable !== true
    ? 'healthy'
    : 'running'
);

const isStagingOwned = (reference) => (
  reference.includes('/menorah-staging/')
);

const requiresManifestRecord = ({ service, reference, kind }) => (
  isStagingOwned(reference)
  && (kind === 'runtime' || service === 'staging-migrate')
);

export const classifyRenderedServices = (
  model,
  manifestSource = undefined,
) => {
  if (!model || model.name !== EXPECTED_PROJECT) {
    fail(`rendered Compose project is not ${EXPECTED_PROJECT}`);
  }
  if (
    !model.services
    || typeof model.services !== 'object'
    || Array.isArray(model.services)
  ) {
    fail('rendered Compose services are unavailable');
  }

  const manifestRecords = manifestSource === undefined
    ? []
    : parseLifecycleManifest(manifestSource);
  const manifestByService = new Map(
    manifestRecords.map((record) => [record.service, record]),
  );

  const services = Object.entries(model.services)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([service, definition]) => {
      assertSafeService(service);
      if (!definition || typeof definition !== 'object') {
        fail(`rendered Compose definition is invalid for ${service}`);
      }
      assertSafeReference(service, definition.image);

      const kind = lifecycleKind(service, definition);
      if (
        service === 'staging-migrate'
        && (
          definition.restart !== 'no'
          || !Array.isArray(definition.profiles)
          || !definition.profiles.includes('migration')
        )
      ) {
        fail(
          'staging-migrate must be a restart:no migration-profile service',
        );
      }
      const manifestRecord = manifestByService.get(service);
      if (
        manifestRecord
        && manifestRecord.reference !== definition.image
      ) {
        fail(`rendered image differs from the manifest for ${service}`);
      }
      const manifestRequired = requiresManifestRecord({
        service,
        reference: definition.image,
        kind,
      });
      if (manifestSource !== undefined && manifestRequired && !manifestRecord) {
        fail(`manifest omits rendered staging artifact: ${service}`);
      }
      if (manifestSource !== undefined && manifestRecord && !manifestRequired) {
        fail(`manifest contains non-runtime staging artifact: ${service}`);
      }

      return Object.freeze({
        service,
        reference: definition.image,
        kind,
        health: healthRequirement(definition),
        imageId: manifestRecord?.imageId ?? '',
      });
    });

  const renderedServices = new Set(
    services.map(({ service }) => service),
  );
  for (const record of manifestRecords) {
    if (!renderedServices.has(record.service)) {
      fail(`manifest service is absent from Compose: ${record.service}`);
    }
  }

  const migration = services.find(
    ({ service }) => service === 'staging-migrate',
  );
  if (!migration || migration.kind !== 'profile') {
    fail('staging-migrate must remain a profile-scoped service');
  }
  if (!requiresManifestRecord(migration)) {
    fail('staging-migrate must remain a staging-owned manifest artifact');
  }
  if (!services.some(({ kind }) => kind === 'runtime')) {
    fail('rendered Compose contains no long-running services');
  }
  if (!services.some((service) => (
    service.kind === 'runtime' && isStagingOwned(service.reference)
  ))) {
    fail('rendered Compose contains no staging-owned runtime services');
  }
  return Object.freeze(services);
};

export const selectManifestServices = (services) => Object.freeze(
  services.filter(requiresManifestRecord),
);

const printManifestRecords = (services) => {
  const records = selectManifestServices(services);
  if (!records.some(({ kind }) => kind === 'runtime')) {
    fail('rendered Compose contains no staging runtime image');
  }
  if (
    records.filter(({ service }) => service === 'staging-migrate').length !== 1
  ) {
    fail('rendered Compose must contain one migration artifact');
  }
  for (const { service, reference } of records) {
    if (
      reference.includes('/menorah/')
      || !DIGEST_REFERENCE_PATTERN.test(reference)
    ) {
      fail(`invalid staging image identity for ${service}`);
    }
    process.stdout.write(`${service}|${reference}\n`);
  }
};

const printLifecyclePlan = (services) => {
  for (const {
    kind,
    health,
    service,
    reference,
    imageId,
  } of services) {
    process.stdout.write(
      `${kind}|${health}|${service}|${reference}|${imageId}\n`,
    );
  }
};

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  try {
    const [mode, composePath, manifestPath, extra] = process.argv.slice(2);
    if (
      extra !== undefined
      || !['manifest', 'plan'].includes(mode)
      || typeof composePath !== 'string'
      || (mode === 'manifest' && manifestPath !== undefined)
      || (mode === 'plan' && typeof manifestPath !== 'string')
    ) {
      fail(
        'usage: service-lifecycle.mjs '
        + 'manifest COMPOSE_JSON | plan COMPOSE_JSON MANIFEST',
      );
    }
    const model = JSON.parse(readFileSync(composePath, 'utf8'));
    if (mode === 'manifest') {
      printManifestRecords(classifyRenderedServices(model));
    } else {
      printLifecyclePlan(classifyRenderedServices(
        model,
        readFileSync(manifestPath, 'utf8'),
      ));
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
