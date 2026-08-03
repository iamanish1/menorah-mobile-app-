const {
  COUNSELLOR_LICENSE_IDENTITY_COLLATION,
  CURRENT_APPLICATION_IDENTITY_STATES,
  PROFESSIONAL_VERIFICATION_STATES,
} = require('../../config/counsellorVerification');

const MIGRATION_VERSION = '20260723-professional-verification-v1';
const SCHEMA_VERSION = 1;
const LEGACY_COUNSELLOR_STATUSES = Object.freeze([
  'pending',
  'approved',
  'rejected',
]);
const LEGACY_APPLICATION_STATUSES = Object.freeze(['pending', 'rejected']);

const INDEX_PLANS = Object.freeze([
  {
    collectionName: 'counsellors',
    indexes: [
      {
        key: { user: 1 },
        options: {
          name: 'user_1',
          unique: true,
        },
        duplicateCheck: {
          match: { user: { $type: 'objectId' } },
          groupBy: '$user',
          description: 'counsellor profiles linked to the same user',
        },
      },
      {
        key: { licenseNumber: 1 },
        options: {
          name: 'licenseNumber_1',
          unique: true,
        },
        coexistingSameKeyIndexNames: [
          'counsellor_license_identity_unique_v1',
        ],
        duplicateCheck: {
          groupBy: '$licenseNumber',
          description: 'counsellor profiles with the same license number',
        },
      },
      {
        key: { licenseNumber: 1 },
        options: {
          name: 'counsellor_license_identity_unique_v1',
          unique: true,
          collation: COUNSELLOR_LICENSE_IDENTITY_COLLATION,
        },
        coexistingSameKeyIndexNames: ['licenseNumber_1'],
        duplicateCheck: {
          match: { licenseNumber: { $type: 'string' } },
          groupBy: {
            $toLower: {
              $trim: { input: '$licenseNumber' },
            },
          },
          nonEmptyGroup: true,
          collation: COUNSELLOR_LICENSE_IDENTITY_COLLATION,
          description:
            'counsellor profiles with a case-insensitive or trimmed license identity collision',
        },
      },
      {
        key: {
          status: 1,
          isActive: 1,
          isAvailable: 1,
          'professionalVerification.expiresAt': 1,
        },
        options: { name: 'professional_verification_eligibility_v1' },
      },
      {
        key: {
          status: 1,
          'professionalVerification.expiresAt': 1,
          _id: 1,
        },
        options: { name: 'professional_verification_expiry_sweep_v1' },
      },
      {
        key: { 'professionalVerification.application': 1 },
        options: {
          name: 'professional_verification_application_v1',
          unique: true,
          partialFilterExpression: {
            'professionalVerification.application': { $type: 'objectId' },
          },
        },
        duplicateCheck: {
          match: {
            'professionalVerification.application': { $type: 'objectId' },
          },
          groupBy: '$professionalVerification.application',
          description: 'counsellor profiles linked to the same application',
        },
      },
    ],
  },
  {
    collectionName: 'pendingapplications',
    indexes: [
      {
        key: { email: 1, legacyReviewRequired: 1 },
        options: {
          name: 'current_application_email_unique_v1',
          unique: true,
          collation: {
            ...COUNSELLOR_LICENSE_IDENTITY_COLLATION,
          },
          partialFilterExpression: {
            status: { $in: [...CURRENT_APPLICATION_IDENTITY_STATES] },
            legacyReviewRequired: false,
            email: { $type: 'string' },
          },
        },
        duplicateCheck: {
          match: {
            status: { $in: [...CURRENT_APPLICATION_IDENTITY_STATES] },
            legacyReviewRequired: false,
            email: { $type: 'string' },
          },
          groupBy: {
            $toLower: {
              $trim: { input: '$email' },
            },
          },
          collation: {
            ...COUNSELLOR_LICENSE_IDENTITY_COLLATION,
          },
          description: 'non-legacy current applications with the same normalized email',
        },
      },
      {
        key: { licenseNumber: 1, legacyReviewRequired: 1 },
        options: {
          name: 'current_application_license_unique_v1',
          unique: true,
          collation: {
            ...COUNSELLOR_LICENSE_IDENTITY_COLLATION,
          },
          partialFilterExpression: {
            status: { $in: [...CURRENT_APPLICATION_IDENTITY_STATES] },
            legacyReviewRequired: false,
            licenseNumber: { $type: 'string' },
          },
        },
        duplicateCheck: {
          match: {
            status: { $in: [...CURRENT_APPLICATION_IDENTITY_STATES] },
            legacyReviewRequired: false,
            licenseNumber: { $type: 'string' },
          },
          groupBy: {
            $toLower: {
              $trim: { input: '$licenseNumber' },
            },
          },
          collation: {
            ...COUNSELLOR_LICENSE_IDENTITY_COLLATION,
          },
          description: 'non-legacy current applications with the same normalized license number',
        },
      },
      {
        key: { email: 1, status: 1, createdAt: -1 },
        options: { name: 'application_email_status_created_v1' },
      },
      {
        key: { linkedCounsellor: 1, createdAt: -1 },
        options: { name: 'application_counsellor_history_v1' },
      },
    ],
  },
]);

const INTEGRITY_DUPLICATE_CHECKS = Object.freeze([
  {
    collectionName: 'pendingapplications',
    match: {
      status: 'pending',
      email: { $type: 'string' },
    },
    groupBy: {
      $toLower: {
        $trim: { input: '$email' },
      },
    },
    nonEmptyGroup: true,
    description: 'active legacy applications with the same normalized email',
  },
  {
    collectionName: 'pendingapplications',
    match: {
      status: 'pending',
      licenseNumber: { $type: 'string' },
    },
    groupBy: {
      $toLower: {
        $trim: { input: '$licenseNumber' },
      },
    },
    nonEmptyGroup: true,
    description: 'active legacy applications with the same normalized license number',
  },
  {
    collectionName: 'pendingapplications',
    match: {
      status: 'pending',
      phone: { $type: 'string' },
    },
    groupBy: {
      $trim: { input: '$phone' },
    },
    nonEmptyGroup: true,
    description: 'active legacy applications with the same normalized phone number',
  },
]);

const migrationError = (message) => new Error(
  `[professional-verification-migration] ${message} `
  + 'No legacy consent, evidence, reviewer, or expiry data was synthesized.'
);

const hasOwn = (value, field) => (
  value != null && Object.prototype.hasOwnProperty.call(value, field)
);

const hasText = (value) => (
  typeof value === 'string' && value.trim().length > 0
);

const isValidDate = (value) => (
  value instanceof Date && Number.isFinite(value.getTime())
);

const isNonNegativeSafeInteger = (value) => (
  Number.isSafeInteger(value) && value >= 0
);

const isIncrementableSessionVersion = (value) => (
  isNonNegativeSafeInteger(value) && value < Number.MAX_SAFE_INTEGER
);

const identifierString = (value) => {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value.toHexString === 'function') return value.toHexString();
  return '';
};

const isObjectIdLike = (value) => /^[a-f0-9]{24}$/i.test(identifierString(value));
const isBsonObjectId = (value) => (
  value?._bsontype === 'ObjectId' && isObjectIdLike(value)
);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value;
};

const sameDocument = (left, right) => (
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
);

const sameIndexKey = (left, right) => {
  const leftEntries = Object.entries(left || {});
  const rightEntries = Object.entries(right || {});
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([field, direction], index) => (
      field === rightEntries[index]?.[0] && direction === rightEntries[index]?.[1]
    ));
};

const indexCollationMatchesPlan = (actual, desired) => {
  if (desired == null) return actual == null;
  if (actual == null || typeof actual !== 'object') return false;
  return Object.entries(desired).every(
    ([field, value]) => sameDocument(actual[field], value)
  );
};

const indexMatchesPlan = (existing, desired) => (
  existing.name === desired.options.name
  && sameIndexKey(existing.key, desired.key)
  && Boolean(existing.unique) === Boolean(desired.options.unique)
  && Boolean(existing.sparse) === Boolean(desired.options.sparse)
  && sameDocument(
    existing.partialFilterExpression || null,
    desired.options.partialFilterExpression || null
  )
  && indexCollationMatchesPlan(existing.collation, desired.options.collation)
  && existing.expireAfterSeconds === undefined
  && existing.hidden !== true
);

const listIndexes = async (collection) => {
  try {
    return await collection.indexes();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
};

const buildDuplicatePipeline = ({
  match,
  groupBy,
  nonEmptyGroup = false,
}) => {
  const pipeline = [];
  if (match) pipeline.push({ $match: match });
  pipeline.push({ $group: { _id: groupBy, count: { $sum: 1 } } });
  pipeline.push({
    $match: {
      count: { $gt: 1 },
      ...(nonEmptyGroup ? { _id: { $ne: '' } } : {}),
    },
  });
  pipeline.push({ $limit: 1 });
  return pipeline;
};

const assertNoDuplicates = async (collection, check) => {
  const duplicates = await collection.aggregate(
    buildDuplicatePipeline(check),
    {
      allowDiskUse: false,
      ...(check.collation ? { collation: check.collation } : {}),
    }
  ).toArray();
  if (duplicates.length) {
    throw migrationError(`Duplicate ${check.description} exist.`);
  }
};

const assertCompatibleIndexState = (existingIndexes, plan, desired) => {
  const sameName = existingIndexes.find(({ name }) => name === desired.options.name);
  if (sameName) {
    if (!indexMatchesPlan(sameName, desired)) {
      throw migrationError(
        `Index "${desired.options.name}" on "${plan.collectionName}" is incompatible.`
      );
    }
  }

  const permittedSameKeyNames = new Set([
    desired.options.name,
    ...(desired.coexistingSameKeyIndexNames || []),
  ]);
  const incompatibleSameKey = existingIndexes.find((existing) => (
    sameIndexKey(existing.key, desired.key)
    && !permittedSameKeyNames.has(existing.name)
  ));
  if (incompatibleSameKey) {
    throw migrationError(
      `Index key for "${desired.options.name}" on "${plan.collectionName}" already exists `
      + `as "${incompatibleSameKey.name}" with different options.`
    );
  }
};

const preflightIndexes = async (contexts) => {
  const existingByCollection = [];
  for (const { collection, plan } of contexts) {
    const existing = await listIndexes(collection);
    for (const desired of plan.indexes) {
      assertCompatibleIndexState(existing, plan, desired);
      if (desired.duplicateCheck) {
        await assertNoDuplicates(collection, desired.duplicateCheck);
      }
    }
    existingByCollection.push(existing);
  }
  return existingByCollection;
};

const createAndVerifyIndexes = async (contexts, existingByCollection) => {
  for (let contextIndex = 0; contextIndex < contexts.length; contextIndex += 1) {
    const { collection, plan } = contexts[contextIndex];
    const existing = existingByCollection[contextIndex];
    for (const desired of plan.indexes) {
      if (!existing.some((index) => indexMatchesPlan(index, desired))) {
        await collection.createIndex(desired.key, {
          ...desired.options,
          writeConcern: { w: 'majority' },
        });
      }
    }
  }

  for (const { collection, plan } of contexts) {
    const actual = await listIndexes(collection);
    for (const desired of plan.indexes) {
      const existing = actual.find((index) => indexMatchesPlan(index, desired));
      if (!existing || !indexMatchesPlan(existing, desired)) {
        throw migrationError(
          `Post-create verification failed for "${desired.options.name}" `
          + `on "${plan.collectionName}".`
        );
      }
    }
  }
};

const findMalformedSchemaContainer = async (collection, path) => (
  collection.findOne({
    [path]: {
      $exists: true,
      $ne: null,
      $not: { $type: 'object' },
    },
  }, { projection: { _id: 1 } })
);

const findMalformedArray = async (collection, path) => (
  collection.findOne({
    [path]: {
      $exists: true,
      $not: { $type: 'array' },
    },
  }, { projection: { _id: 1 } })
);

const exactSchemaVersionExpression = (path) => ({
  $and: [
    { $isNumber: `$${path}` },
    { $eq: [`$${path}`, SCHEMA_VERSION] },
  ],
});

const exactCurrentStatusExpression = (path, states) => ({
  $and: [
    { $eq: [{ $type: `$${path}` }, 'string'] },
    { $in: [`$${path}`, states] },
  ],
});

const assertSchemaVersionState = async ({
  collection,
  versionPath,
  statusPath = 'status',
  currentStatuses,
  label,
}) => {
  const [unexpectedVersion, invalidCurrentStatus] = await Promise.all([
    collection.findOne({
      [versionPath]: {
        $exists: true,
        $ne: null,
      },
      $expr: { $not: [exactSchemaVersionExpression(versionPath)] },
    }, { projection: { _id: 1 } }),
    collection.findOne({
      $expr: {
        $and: [
          exactSchemaVersionExpression(versionPath),
          { $not: [exactCurrentStatusExpression(statusPath, currentStatuses)] },
        ],
      },
    }, { projection: { _id: 1 } }),
  ]);

  if (unexpectedVersion) {
    throw migrationError(
      `${label} contains an unsupported or future schema version; use a compatible migrator.`
    );
  }
  if (invalidCurrentStatus) {
    throw migrationError(`${label} contains an invalid versioned status.`);
  }
};

const assertLegacyShapes = async (counsellors, applications) => {
  const [
    malformedCounsellorIdentity,
    malformedCounsellor,
    malformedCounsellorHistory,
    malformedApplicationHistory,
  ] = await Promise.all([
    counsellors.findOne({
      $or: [
        { user: { $not: { $type: 'objectId' } } },
        { licenseNumber: { $not: { $type: 'string' } } },
        { licenseNumber: { $regex: /^\s*$/ } },
        {
          $expr: {
            $ne: [
              '$licenseNumber',
              {
                $trim: {
                  input: {
                    $convert: {
                      input: '$licenseNumber',
                      to: 'string',
                      onError: '',
                      onNull: '',
                    },
                  },
                },
              },
            ],
          },
        },
      ],
    }, { projection: { _id: 1 } }),
    findMalformedSchemaContainer(counsellors, 'professionalVerification'),
    findMalformedArray(counsellors, 'professionalVerification.statusHistory'),
    findMalformedArray(applications, 'statusHistory'),
  ]);
  await Promise.all([
    assertSchemaVersionState({
      collection: counsellors,
      versionPath: 'professionalVerification.schemaVersion',
      currentStatuses: PROFESSIONAL_VERIFICATION_STATES,
      label: 'Counsellor collection',
    }),
    assertSchemaVersionState({
      collection: applications,
      versionPath: 'lifecycleSchemaVersion',
      currentStatuses: PROFESSIONAL_VERIFICATION_STATES,
      label: 'Pending-application collection',
    }),
  ]);

  if (malformedCounsellorIdentity) {
    throw migrationError(
      'A counsellor has a malformed or untrimmed user/license identity; '
      + 'review it before migration.'
    );
  }
  if (malformedCounsellor) {
    throw migrationError(
      'A counsellor has malformed professional-verification data; review it before migration.'
    );
  }
  if (malformedCounsellorHistory) {
    throw migrationError(
      'A counsellor has malformed professional-verification history; review it before migration.'
    );
  }
  if (malformedApplicationHistory) {
    throw migrationError(
      'An application has malformed status history; review it before migration.'
    );
  }
};

const assertLegacyProfessionalContainer = (counsellor) => {
  if (!hasOwn(counsellor, 'professionalVerification')) return;
  const verification = counsellor.professionalVerification;
  if (verification == null) return;
  if (
    typeof verification !== 'object'
    || Array.isArray(verification)
    || Object.keys(verification).some(
      (field) => field !== 'schemaVersion' || verification[field] != null
    )
  ) {
    throw migrationError(
      `Counsellor ${identifierString(counsellor._id)} has ambiguous partial verification data.`
    );
  }
};

const assertLegacyApplicationHasNoModernFields = (application) => {
  const modernFields = [
    'onboardingConsent',
    'credentialEvidence',
    'credentialReview',
    'reviewStartedBy',
    'reviewStartedAt',
    'decisionBy',
    'decisionAt',
    'decisionReason',
    'verificationExpiresAt',
    'linkedUser',
    'linkedCounsellor',
    'reviewAccountSnapshot',
    'reverificationAuthorization',
    'supersedesApplication',
    'legacyReviewRequired',
    'legacyMigrationVersion',
    'statusHistory',
  ];
  if (modernFields.some((field) => hasOwn(application, field))) {
    throw migrationError(
      `Application ${identifierString(application._id)} has ambiguous partial lifecycle data.`
    );
  }
};

const assertPair = ({
  left,
  right,
  leftValid,
  rightValid,
  label,
}) => {
  const leftPresent = left != null;
  const rightPresent = right != null;
  if (
    leftPresent !== rightPresent
    || (leftPresent && (!leftValid(left) || !rightValid(right)))
  ) {
    throw migrationError(`${label} must be a complete, valid pair.`);
  }
  return leftPresent;
};

const validateLegacyCounsellor = (counsellor = {}) => {
  const id = identifierString(counsellor._id) || '<unknown>';
  assertLegacyProfessionalContainer(counsellor);

  if (!isBsonObjectId(counsellor._id) || !isBsonObjectId(counsellor.user)) {
    throw migrationError(`Counsellor ${id} has an invalid identity or user link.`);
  }
  if (!hasText(counsellor.licenseNumber)) {
    throw migrationError(`Counsellor ${id} has a missing legacy license number.`);
  }
  if (!LEGACY_COUNSELLOR_STATUSES.includes(counsellor.status)) {
    throw migrationError(`Counsellor ${id} has an unknown legacy status.`);
  }
  if (
    typeof counsellor.isVerified !== 'boolean'
    || typeof counsellor.isActive !== 'boolean'
    || typeof counsellor.isAvailable !== 'boolean'
  ) {
    throw migrationError(`Counsellor ${id} has missing or non-boolean legacy flags.`);
  }
  if (counsellor.isActive === false && counsellor.isAvailable === true) {
    throw migrationError(`Counsellor ${id} is inactive but marked available.`);
  }
  if (counsellor.status !== 'approved' && counsellor.isAvailable === true) {
    throw migrationError(`Counsellor ${id} is non-approved but marked available.`);
  }

  const hasApproval = assertPair({
    left: counsellor.approvedBy,
    right: counsellor.approvedAt,
    leftValid: isBsonObjectId,
    rightValid: isValidDate,
    label: `Counsellor ${id} approval metadata`,
  });
  const hasBlock = assertPair({
    left: counsellor.blockedAt,
    right: counsellor.blockedReason,
    leftValid: isValidDate,
    rightValid: hasText,
    label: `Counsellor ${id} block metadata`,
  });

  if (counsellor.status === 'approved') {
    if (counsellor.isVerified !== true || !hasApproval) {
      throw migrationError(
        `Counsellor ${id} has an approved status without legacy verification metadata.`
      );
    }
  } else if (counsellor.isVerified !== false || hasApproval) {
    throw migrationError(
      `Counsellor ${id} has contradictory non-approved verification metadata.`
    );
  }

  if (
    hasBlock
    && (
      counsellor.status !== 'approved'
      || counsellor.isActive !== false
      || counsellor.isAvailable !== false
    )
  ) {
    throw migrationError(`Counsellor ${id} has contradictory block metadata.`);
  }

  return counsellor;
};

const validateLegacyApplication = (application = {}) => {
  const id = identifierString(application._id) || '<unknown>';
  assertLegacyApplicationHasNoModernFields(application);

  if (!isBsonObjectId(application._id)) {
    throw migrationError(`Application ${id} has an invalid identity.`);
  }
  if (!LEGACY_APPLICATION_STATUSES.includes(application.status)) {
    throw migrationError(`Application ${id} has an unsupported legacy status.`);
  }

  const hasReview = assertPair({
    left: application.reviewedBy,
    right: application.reviewedAt,
    leftValid: isBsonObjectId,
    rightValid: isValidDate,
    label: `Application ${id} review metadata`,
  });

  if (application.status === 'rejected') {
    if (!hasReview || !hasText(application.rejectionReason)) {
      throw migrationError(
        `Application ${id} is rejected without complete legacy decision metadata.`
      );
    }
  } else if (hasText(application.rejectionReason)) {
    throw migrationError(
      `Application ${id} is pending but contains a rejection reason.`
    );
  }

  return application;
};

const classifyLegacyCounsellor = (counsellor) => {
  validateLegacyCounsellor(counsellor);
  if (counsellor.status === 'rejected') return 'rejected';
  if (counsellor.status === 'approved') return 'suspended';
  return 'draft';
};

const classifyLegacyApplication = (application) => {
  validateLegacyApplication(application);
  if (application.status === 'rejected') return 'rejected';
  return application.reviewedBy == null ? 'submitted' : 'under_review';
};

const compactObject = (value) => Object.fromEntries(
  Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
);

const buildCounsellorMigrationUpdate = (counsellor, now) => {
  if (!isValidDate(now)) throw migrationError('A valid migration timestamp is required.');
  const nextStatus = classifyLegacyCounsellor(counsellor);
  const reason = nextStatus === 'suspended'
    ? 'legacy_professional_verification_requires_reverification'
    : nextStatus === 'rejected'
      ? 'legacy_professional_verification_rejection_preserved'
      : 'legacy_professional_verification_requires_fresh_submission';

  return {
    $set: {
      status: nextStatus,
      isVerified: false,
      isActive: false,
      isAvailable: false,
      professionalVerification: {
        schemaVersion: SCHEMA_VERSION,
        migrationVersion: MIGRATION_VERSION,
        legacyReviewRequired: nextStatus !== 'rejected',
        legacySnapshot: compactObject({
          status: counsellor.status,
          isVerified: counsellor.isVerified,
          isActive: counsellor.isActive,
          isAvailable: counsellor.isAvailable,
          approvedBy: counsellor.approvedBy ?? null,
          approvedAt: counsellor.approvedAt ?? null,
          blockedAt: counsellor.blockedAt ?? null,
          blockedReason: counsellor.blockedReason ?? null,
        }),
        statusHistory: nextStatus === counsellor.status
          ? []
          : [{
            from: counsellor.status,
            to: nextStatus,
            at: now,
            actorType: 'system',
            actor: null,
            reason,
          }],
      },
    },
  };
};

const buildApplicationMigrationUpdate = (application, now) => {
  if (!isValidDate(now)) throw migrationError('A valid migration timestamp is required.');
  const nextStatus = classifyLegacyApplication(application);
  return {
    $set: {
      status: nextStatus,
      lifecycleSchemaVersion: SCHEMA_VERSION,
      legacyMigrationVersion: MIGRATION_VERSION,
      legacyReviewRequired: nextStatus !== 'rejected',
      statusHistory: nextStatus === application.status
        ? []
        : [{
          from: application.status,
          to: nextStatus,
          at: now,
          actorType: 'system',
          actor: null,
          reason: 'legacy_application_requires_current_review',
        }],
    },
  };
};

const legacyVersionFilter = (path) => ({
  $or: [
    { [path]: { $exists: false } },
    { [path]: null },
  ],
});

const getLegacyDocuments = async (collection, versionPath, projection) => (
  collection.find(
    legacyVersionFilter(versionPath),
    { projection }
  ).sort({ _id: 1 }).toArray()
);

const addExactField = (filter, document, field) => {
  filter[field] = hasOwn(document, field)
    ? document[field]
    : { $exists: false };
};

const buildCounsellorCompareAndSetFilter = (counsellor) => {
  const filter = {
    _id: counsellor._id,
    ...legacyVersionFilter('professionalVerification.schemaVersion'),
  };
  [
    'status',
    'user',
    'licenseNumber',
    'isVerified',
    'isActive',
    'isAvailable',
    'approvedBy',
    'approvedAt',
    'blockedAt',
    'blockedReason',
    'professionalVerification',
  ].forEach((field) => addExactField(filter, counsellor, field));
  return filter;
};

const buildApplicationCompareAndSetFilter = (application) => {
  const filter = {
    _id: application._id,
    ...legacyVersionFilter('lifecycleSchemaVersion'),
  };
  [
    'status',
    'email',
    'phone',
    'licenseNumber',
    'reviewedBy',
    'reviewedAt',
    'rejectionReason',
    'lifecycleSchemaVersion',
    'onboardingConsent',
    'credentialEvidence',
    'credentialReview',
    'reviewStartedBy',
    'reviewStartedAt',
    'decisionBy',
    'decisionAt',
    'decisionReason',
    'verificationExpiresAt',
    'linkedUser',
    'linkedCounsellor',
    'reviewAccountSnapshot',
    'reverificationAuthorization',
    'supersedesApplication',
    'legacyReviewRequired',
    'legacyMigrationVersion',
    'statusHistory',
  ].forEach((field) => addExactField(filter, application, field));
  return filter;
};

const applyLegacyUpdates = async ({
  collection,
  documents,
  buildFilter,
  buildUpdate,
  now,
  session,
}) => {
  if (documents.length === 0) return { matchedCount: 0, modifiedCount: 0 };

  const result = await collection.bulkWrite(documents.map((document) => ({
    updateOne: {
      filter: buildFilter(document),
      update: buildUpdate(document, now),
    },
  })), {
    ordered: true,
    ...(session ? { session } : { writeConcern: { w: 'majority' } }),
  });

  if (result.matchedCount !== documents.length) {
    throw migrationError(
      'Legacy records changed concurrently during migration; rerun in a maintenance boundary.'
    );
  }
  return result;
};

const buildUserDeactivationCompareAndSetFilter = (user) => {
  const filter = { _id: user._id };
  [
    'email',
    'phone',
    'role',
    'isActive',
    'sessionVersion',
    'lastSessionRevokedAt',
  ].forEach((field) => addExactField(filter, user, field));
  return filter;
};

const buildUserDeactivationUpdate = (user, now) => {
  if (!isValidDate(now)) throw migrationError('A valid migration timestamp is required.');
  if (user?.isActive !== true) {
    throw migrationError('Only active linked counsellor users can be revoked.');
  }
  return {
    $set: {
      isActive: false,
      lastSessionRevokedAt: now,
    },
    $inc: { sessionVersion: 1 },
  };
};

const uniqueValues = (values) => {
  const byIdentifier = new Map();
  values.forEach((value) => {
    const identifier = identifierString(value);
    if (identifier && !byIdentifier.has(identifier)) byIdentifier.set(identifier, value);
  });
  return [...byIdentifier.values()];
};

const normalizeEmail = (value) => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const normalizePhone = (value) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizedMongoString = (field, { lowercase = false } = {}) => {
  const trimmed = {
    $trim: {
      input: {
        $convert: {
          input: field,
          to: 'string',
          onError: '',
          onNull: '',
        },
      },
    },
  };
  return lowercase ? { $toLower: trimmed } : trimmed;
};

const loadRelevantUsers = async (users, counsellors, applications) => {
  const userIds = uniqueValues(counsellors.map(({ user }) => user));
  const emails = [...new Set(applications.map(({ email }) => normalizeEmail(email)).filter(Boolean))];
  const phones = [...new Set(applications.map(({ phone }) => normalizePhone(phone)).filter(Boolean))];
  const clauses = [];
  if (userIds.length) clauses.push({ _id: { $in: userIds } });
  if (emails.length) {
    clauses.push({
      $expr: {
        $in: [normalizedMongoString('$email', { lowercase: true }), emails],
      },
    });
  }
  if (phones.length) {
    clauses.push({
      $expr: {
        $in: [normalizedMongoString('$phone'), phones],
      },
    });
  }
  if (clauses.length === 0) return [];

  return users.find(
    { $or: clauses },
    {
      projection: {
        _id: 1,
        email: 1,
        phone: 1,
        role: 1,
        isActive: 1,
        sessionVersion: 1,
        lastSessionRevokedAt: 1,
      },
    }
  ).sort({ _id: 1 }).toArray();
};

const assertUserMappings = (counsellors, applications, users) => {
  const usersById = new Map();
  const usersByEmail = new Map();
  const usersByPhone = new Map();

  for (const user of users) {
    const id = identifierString(user._id);
    if (id) usersById.set(id, user);
    const email = normalizeEmail(user.email);
    const phone = normalizePhone(user.phone);
    if (email) {
      const prior = usersByEmail.get(email);
      if (prior && identifierString(prior._id) !== id) {
        throw migrationError('Multiple users share a normalized application email.');
      }
      usersByEmail.set(email, user);
    }
    if (phone) {
      const prior = usersByPhone.get(phone);
      if (prior && identifierString(prior._id) !== id) {
        throw migrationError('Multiple users share an application phone number.');
      }
      usersByPhone.set(phone, user);
    }
  }

  for (const counsellor of counsellors) {
    const id = identifierString(counsellor._id);
    const user = usersById.get(identifierString(counsellor.user));
    if (
      !user
      || user.role !== 'counsellor'
      || typeof user.isActive !== 'boolean'
      || user.isActive !== counsellor.isActive
      || (
        hasOwn(user, 'sessionVersion')
        && !isIncrementableSessionVersion(user.sessionVersion)
      )
      || (
        hasOwn(user, 'lastSessionRevokedAt')
        && user.lastSessionRevokedAt != null
        && !isValidDate(user.lastSessionRevokedAt)
      )
    ) {
      throw migrationError(
        `Counsellor ${id} has a missing or contradictory linked user account.`
      );
    }
  }

  for (const application of applications) {
    const emailUser = usersByEmail.get(normalizeEmail(application.email));
    const phoneUser = usersByPhone.get(normalizePhone(application.phone));
    if (
      emailUser
      && phoneUser
      && identifierString(emailUser._id) !== identifierString(phoneUser._id)
    ) {
      throw migrationError(
        `Application ${identifierString(application._id)} maps its email and phone `
        + 'to different users.'
      );
    }
  }
};

const linkedActiveUsers = (counsellors, users) => {
  const activeUserIds = new Set(
    counsellors
      .filter(({ isActive }) => isActive === true)
      .map(({ user }) => identifierString(user))
  );
  return users.filter(({ _id }) => activeUserIds.has(identifierString(_id)));
};

const applyDocumentMigrationTransaction = async ({
  connection,
  counsellors,
  applications,
  users,
  legacyCounsellors,
  legacyApplications,
  usersToDeactivate,
  now,
}) => {
  if (
    legacyCounsellors.length === 0
    && legacyApplications.length === 0
    && usersToDeactivate.length === 0
  ) {
    return;
  }
  if (typeof connection?.startSession !== 'function') {
    throw migrationError(
      'Transactional migration support is required to update verification records.'
    );
  }

  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      await applyLegacyUpdates({
        collection: counsellors,
        documents: legacyCounsellors,
        buildFilter: buildCounsellorCompareAndSetFilter,
        buildUpdate: buildCounsellorMigrationUpdate,
        now,
        session,
      });
      await applyLegacyUpdates({
        collection: applications,
        documents: legacyApplications,
        buildFilter: buildApplicationCompareAndSetFilter,
        buildUpdate: buildApplicationMigrationUpdate,
        now,
        session,
      });
      await applyLegacyUpdates({
        collection: users,
        documents: usersToDeactivate,
        buildFilter: buildUserDeactivationCompareAndSetFilter,
        buildUpdate: buildUserDeactivationUpdate,
        now,
        session,
      });
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
  } finally {
    await session.endSession();
  }
};

const up = async ({ mongoose, now = new Date() }) => {
  if (!isValidDate(now)) {
    throw migrationError('A valid migration timestamp is required.');
  }
  if (!mongoose?.connection?.db) {
    throw migrationError('An active MongoDB connection is required.');
  }

  const counsellors = mongoose.connection.db.collection('counsellors');
  const applications = mongoose.connection.db.collection('pendingapplications');
  const users = mongoose.connection.db.collection('users');
  const contexts = INDEX_PLANS.map((plan) => ({
    plan,
    collection: mongoose.connection.db.collection(plan.collectionName),
  }));

  // Every shape, version, uniqueness, index, classification, and account-mapping
  // preflight finishes before the first document or index write.
  await assertLegacyShapes(counsellors, applications);
  const existingByCollection = await preflightIndexes(contexts);
  for (const check of INTEGRITY_DUPLICATE_CHECKS) {
    await assertNoDuplicates(
      mongoose.connection.db.collection(check.collectionName),
      check
    );
  }

  const [legacyCounsellors, legacyApplications] = await Promise.all([
    getLegacyDocuments(
      counsellors,
      'professionalVerification.schemaVersion',
      {
        _id: 1,
        user: 1,
        licenseNumber: 1,
        status: 1,
        isVerified: 1,
        isActive: 1,
        isAvailable: 1,
        approvedBy: 1,
        approvedAt: 1,
        blockedAt: 1,
        blockedReason: 1,
        professionalVerification: 1,
      }
    ),
    getLegacyDocuments(
      applications,
      'lifecycleSchemaVersion',
      {
        _id: 1,
        email: 1,
        phone: 1,
        licenseNumber: 1,
        status: 1,
        rejectionReason: 1,
        reviewedBy: 1,
        reviewedAt: 1,
        onboardingConsent: 1,
        credentialEvidence: 1,
        credentialReview: 1,
        reviewStartedBy: 1,
        reviewStartedAt: 1,
        decisionBy: 1,
        decisionAt: 1,
        decisionReason: 1,
        verificationExpiresAt: 1,
        linkedUser: 1,
        linkedCounsellor: 1,
        reviewAccountSnapshot: 1,
        reverificationAuthorization: 1,
        supersedesApplication: 1,
        legacyReviewRequired: 1,
        lifecycleSchemaVersion: 1,
        legacyMigrationVersion: 1,
        statusHistory: 1,
      }
    ),
  ]);

  legacyCounsellors.forEach(validateLegacyCounsellor);
  legacyApplications.forEach(validateLegacyApplication);
  const relevantUsers = await loadRelevantUsers(
    users,
    legacyCounsellors,
    legacyApplications
  );
  assertUserMappings(legacyCounsellors, legacyApplications, relevantUsers);
  const usersToDeactivate = linkedActiveUsers(
    legacyCounsellors,
    relevantUsers
  );

  // Every migrated profile is non-approved. Revoke linked active accounts in
  // the same transaction so role-only chat/socket surfaces cannot retain
  // access during the required fresh professional review.
  await applyDocumentMigrationTransaction({
    connection: mongoose.connection,
    counsellors,
    applications,
    users,
    legacyCounsellors,
    legacyApplications,
    usersToDeactivate,
    now,
  });

  await createAndVerifyIndexes(contexts, existingByCollection);
};

module.exports = {
  MIGRATION_VERSION,
  SCHEMA_VERSION,
  INDEX_PLANS,
  INTEGRITY_DUPLICATE_CHECKS,
  LEGACY_COUNSELLOR_STATUSES,
  LEGACY_APPLICATION_STATUSES,
  validateLegacyCounsellor,
  validateLegacyApplication,
  classifyLegacyCounsellor,
  classifyLegacyApplication,
  buildCounsellorMigrationUpdate,
  buildApplicationMigrationUpdate,
  buildCounsellorCompareAndSetFilter,
  buildApplicationCompareAndSetFilter,
  buildUserDeactivationCompareAndSetFilter,
  buildUserDeactivationUpdate,
  buildDuplicatePipeline,
  indexMatchesPlan,
  assertUserMappings,
  up,
};
