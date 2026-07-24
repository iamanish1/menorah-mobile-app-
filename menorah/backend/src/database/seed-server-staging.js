const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Counsellor = require('../models/Counsellor');
const PendingApplication = require('../models/PendingApplication');
const User = require('../models/User');
const {
  COUNSELLOR_LICENSE_IDENTITY_COLLATION,
  isApprovedVerificationVersion,
} = require('../config/counsellorVerification');
const {
  SERVER_STAGING_ADMIN_ROLE_GRANTS,
  SERVER_STAGING_ADMIN_USER_IDS,
} = require('../config/serverStagingSyntheticAuthority');

const SEED_CONFIRMATION =
  'CREATE_SYNTHETIC_ROSTER_ONLY_IN_MENORAH_SERVER_STAGING_V1';
const SERVER_STAGING_EMAIL_DOMAIN = 'mail.staging.menorah.me';
const SERVER_STAGING_PROJECT = 'menorah-staging';
const SERVER_STAGING_PROJECTS = new Set([
  SERVER_STAGING_PROJECT,
  'menorah-server-staging-validation',
]);
const SERVER_STAGING_ENVIRONMENT_ID = 'menorah-server-staging-v1';
const SERVER_STAGING_MONGO_HOST = 'staging-mongo-primary:27017';
const SERVER_STAGING_DATABASE = 'menorah_staging';
const SERVER_STAGING_REPLICA_SET = 'menorah-staging-rs';

const TRANSACTION_OPTIONS = Object.freeze({
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  readPreference: 'primary',
});

const USER_IDS = Object.freeze({
  'USER-A': '7a110ca15a6e000000000001',
  'USER-B': '7a110ca15a6e000000000002',
  'COUNSELLOR-A': '7a110ca15a6e000000000011',
  'COUNSELLOR-DRAFT': '7a110ca15a6e000000000012',
  'COUNSELLOR-SUSPENDED': '7a110ca15a6e000000000013',
  ...SERVER_STAGING_ADMIN_USER_IDS,
});

const COUNSELLOR_IDS = Object.freeze({
  'COUNSELLOR-A': '7a110ca15a6e000000000201',
  'COUNSELLOR-DRAFT': '7a110ca15a6e000000000202',
  'COUNSELLOR-SUSPENDED': '7a110ca15a6e000000000203',
});

const APPLICATION_IDS = Object.freeze({
  'COUNSELLOR-A': '7a110ca15a6e000000000301',
  'COUNSELLOR-DRAFT': '7a110ca15a6e000000000302',
  'COUNSELLOR-SUSPENDED': '7a110ca15a6e000000000303',
});

const EVIDENCE_IDS = Object.freeze({
  'COUNSELLOR-A': '7a110ca15a6e000000000401',
  'COUNSELLOR-SUSPENDED': '7a110ca15a6e000000000403',
});

const ADMIN_ROLE_GRANTS = SERVER_STAGING_ADMIN_ROLE_GRANTS;

const PASSWORD_ENV_BY_ALIAS = Object.freeze({
  'USER-A': 'MENORAH_SERVER_STAGING_USER_A_PASSWORD',
  'USER-B': 'MENORAH_SERVER_STAGING_USER_B_PASSWORD',
  'COUNSELLOR-A': 'MENORAH_SERVER_STAGING_COUNSELLOR_A_PASSWORD',
  'COUNSELLOR-DRAFT':
    'MENORAH_SERVER_STAGING_COUNSELLOR_DRAFT_PASSWORD',
  'COUNSELLOR-SUSPENDED':
    'MENORAH_SERVER_STAGING_COUNSELLOR_SUSPENDED_PASSWORD',
  'ADMIN-SUPPORT': 'MENORAH_SERVER_STAGING_ADMIN_SUPPORT_PASSWORD',
  'ADMIN-FINANCE': 'MENORAH_SERVER_STAGING_ADMIN_FINANCE_PASSWORD',
  'ADMIN-CONTENT': 'MENORAH_SERVER_STAGING_ADMIN_CONTENT_PASSWORD',
  'ADMIN-FULL-1': 'MENORAH_SERVER_STAGING_ADMIN_FULL_1_PASSWORD',
  'ADMIN-FULL-2': 'MENORAH_SERVER_STAGING_ADMIN_FULL_2_PASSWORD',
});

const ACCOUNT_SPECS = Object.freeze([
  Object.freeze({
    alias: 'USER-A',
    emailLocalPart: 'user-a',
    phone: '+12025550100',
    role: 'user',
    firstName: 'Synthetic',
    lastName: 'User A',
    isActive: true,
    isVerified: true,
  }),
  Object.freeze({
    alias: 'USER-B',
    emailLocalPart: 'user-b',
    phone: '+12025550101',
    role: 'user',
    firstName: 'Synthetic',
    lastName: 'User B',
    isActive: true,
    isVerified: true,
  }),
  Object.freeze({
    alias: 'COUNSELLOR-A',
    emailLocalPart: 'counsellor-approved',
    phone: '+12025550102',
    role: 'counsellor',
    firstName: 'Synthetic',
    lastName: 'Counsellor Approved',
    isActive: true,
    isVerified: true,
  }),
  Object.freeze({
    alias: 'COUNSELLOR-DRAFT',
    emailLocalPart: 'counsellor-draft',
    phone: '+12025550103',
    role: 'counsellor',
    firstName: 'Synthetic',
    lastName: 'Counsellor Draft',
    isActive: false,
    isVerified: false,
  }),
  Object.freeze({
    alias: 'COUNSELLOR-SUSPENDED',
    emailLocalPart: 'counsellor-suspended',
    phone: '+12025550104',
    role: 'counsellor',
    firstName: 'Synthetic',
    lastName: 'Counsellor Suspended',
    isActive: false,
    isVerified: true,
  }),
  Object.freeze({
    alias: 'ADMIN-SUPPORT',
    emailLocalPart: 'admin-support',
    phone: '+12025550105',
    role: 'admin',
    firstName: 'Synthetic',
    lastName: 'Admin Support',
    isActive: true,
    isVerified: true,
  }),
  Object.freeze({
    alias: 'ADMIN-FINANCE',
    emailLocalPart: 'admin-finance',
    phone: '+12025550106',
    role: 'admin',
    firstName: 'Synthetic',
    lastName: 'Admin Finance',
    isActive: true,
    isVerified: true,
  }),
  Object.freeze({
    alias: 'ADMIN-CONTENT',
    emailLocalPart: 'admin-content',
    phone: '+12025550107',
    role: 'admin',
    firstName: 'Synthetic',
    lastName: 'Admin Content',
    isActive: true,
    isVerified: true,
  }),
  Object.freeze({
    alias: 'ADMIN-FULL-1',
    emailLocalPart: 'admin-full-1',
    phone: '+12025550108',
    role: 'admin',
    firstName: 'Synthetic',
    lastName: 'Admin Full One',
    isActive: true,
    isVerified: true,
  }),
  Object.freeze({
    alias: 'ADMIN-FULL-2',
    emailLocalPart: 'admin-full-2',
    phone: '+12025550109',
    role: 'admin',
    firstName: 'Synthetic',
    lastName: 'Admin Full Two',
    isActive: true,
    isVerified: true,
  }),
]);

class ServerStagingSeedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ServerStagingSeedError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new ServerStagingSeedError(code, message);
};

const requireExactEnvironmentValue = (env, key, expected) => {
  if (env?.[key] !== expected) {
    fail(
      'SERVER_STAGING_TARGET_GUARD_FAILED',
      `${key} does not identify the approved server staging target.`
    );
  }
};

const assertMongoTarget = (rawUri) => {
  if (
    typeof rawUri !== 'string'
    || rawUri.length === 0
    || rawUri !== rawUri.trim()
  ) {
    fail(
      'SERVER_STAGING_MONGODB_TARGET_INVALID',
      'MONGODB_URI is not an exact server staging MongoDB target.'
    );
  }

  let parsed;
  try {
    parsed = new URL(rawUri);
  } catch {
    fail(
      'SERVER_STAGING_MONGODB_TARGET_INVALID',
      'MONGODB_URI is not an exact server staging MongoDB target.'
    );
  }

  const parameterNames = [...parsed.searchParams.keys()];
  const allowedParameterNames = new Set([
    'authSource',
    'replicaSet',
    'retryWrites',
  ]);
  const boundedParameterSet = (
    parameterNames.every((name) => allowedParameterNames.has(name))
    && new Set(parameterNames).size === parameterNames.length
  );
  const exactAuthorityAndDatabase = new RegExp(
    `^mongodb://[^/?#]+@${SERVER_STAGING_MONGO_HOST}`
      + `/${SERVER_STAGING_DATABASE}\\?`
  ).test(rawUri);
  if (
    parsed.protocol !== 'mongodb:'
    || !exactAuthorityAndDatabase
    || parsed.host !== SERVER_STAGING_MONGO_HOST
    || parsed.pathname !== `/${SERVER_STAGING_DATABASE}`
    || !parsed.username
    || !parsed.password
    || parsed.hash
    || !boundedParameterSet
    || parsed.searchParams.getAll('authSource').length !== 1
    || parsed.searchParams.get('authSource') !== 'admin'
    || parsed.searchParams.getAll('replicaSet').length !== 1
    || parsed.searchParams.get('replicaSet') !== SERVER_STAGING_REPLICA_SET
    || parsed.searchParams.getAll('retryWrites').length > 1
    || (
      parsed.searchParams.has('retryWrites')
      && parsed.searchParams.get('retryWrites') !== 'true'
    )
  ) {
    fail(
      'SERVER_STAGING_MONGODB_TARGET_INVALID',
      'MONGODB_URI is not an exact server staging MongoDB target.'
    );
  }
};

const assertAdminRoleGrants = (rawGrants) => {
  let parsed;
  if (
    typeof rawGrants !== 'string'
    || rawGrants.length === 0
    || Buffer.byteLength(rawGrants, 'utf8') > 16 * 1024
  ) {
    parsed = null;
  } else {
    try {
      parsed = JSON.parse(rawGrants);
    } catch {
      parsed = null;
    }
  }

  const expected = new Map(
    ADMIN_ROLE_GRANTS.map(({ adminId, role }) => [adminId, role])
  );
  const actual = new Map();
  if (Array.isArray(parsed)) {
    for (const grant of parsed) {
      const keys = (
        grant
        && typeof grant === 'object'
        && !Array.isArray(grant)
      )
        ? Object.keys(grant).sort()
        : [];
      if (
        keys.join(',') !== 'adminId,role'
        || typeof grant.adminId !== 'string'
        || typeof grant.role !== 'string'
        || actual.has(grant.adminId)
      ) {
        actual.clear();
        break;
      }
      actual.set(grant.adminId, grant.role);
    }
  }

  if (
    !Array.isArray(parsed)
    || parsed.length !== ADMIN_ROLE_GRANTS.length
    || actual.size !== expected.size
    || [...expected].some(([id, role]) => actual.get(id) !== role)
  ) {
    fail(
      'SERVER_STAGING_ADMIN_GRANTS_INVALID',
      'ADMIN_ROLE_GRANTS_JSON must exactly match the synthetic admin roster.'
    );
  }
};

const assertStrongDistinctPasswords = (env) => {
  const passwordEntries = Object.entries(PASSWORD_ENV_BY_ALIAS).map(
    ([alias, environmentName]) => [alias, env?.[environmentName]]
  );
  const seen = new Set();
  for (const [alias, password] of passwordEntries) {
    const strong = (
      typeof password === 'string'
      && password === password.trim()
      && password.length >= 16
      && password.length <= 128
      && /[a-z]/.test(password)
      && /[A-Z]/.test(password)
      && /\d/.test(password)
      && /[^A-Za-z0-9]/.test(password)
      && !/[\s\u0000-\u001f\u007f]/.test(password)
      && !/(?:password|change\s*me|menorah|staging)/i.test(password)
      && new Set(password).size >= 8
    );
    if (!strong) {
      fail(
        'SERVER_STAGING_PASSWORD_INVALID',
        `The protected password input for ${alias} is missing or does not meet policy.`
      );
    }
    if (seen.has(password)) {
      fail(
        'SERVER_STAGING_PASSWORD_REUSED',
        'Every synthetic staging identity requires a distinct password.'
      );
    }
    seen.add(password);
  }
};

const assertSeedAllowed = (env = process.env) => {
  requireExactEnvironmentValue(env, 'NODE_ENV', 'production');
  requireExactEnvironmentValue(env, 'DEPLOYMENT_ENVIRONMENT', 'staging');
  requireExactEnvironmentValue(
    env,
    'MENORAH_SERVER_STAGING_SEED_CONFIRM',
    SEED_CONFIRMATION
  );
  requireExactEnvironmentValue(
    env,
    'MENORAH_SYNTHETIC_DATA_ONLY',
    'true'
  );
  if (!SERVER_STAGING_PROJECTS.has(env?.COMPOSE_PROJECT_NAME)) {
    fail(
      'SERVER_STAGING_TARGET_GUARD_FAILED',
      'COMPOSE_PROJECT_NAME does not identify an approved server staging target.'
    );
  }
  requireExactEnvironmentValue(
    env,
    'MENORAH_SERVER_STAGING_ENVIRONMENT_ID',
    SERVER_STAGING_ENVIRONMENT_ID
  );
  requireExactEnvironmentValue(
    env,
    'MENORAH_STAGING_EMAIL_DOMAIN',
    SERVER_STAGING_EMAIL_DOMAIN
  );
  requireExactEnvironmentValue(
    env,
    'MONGO_INITDB_DATABASE',
    SERVER_STAGING_DATABASE
  );
  requireExactEnvironmentValue(
    env,
    'MONGODB_REPLICA_SET_NAME',
    SERVER_STAGING_REPLICA_SET
  );

  if (!/^[a-f0-9]{40}$/.test(env?.MENORAH_RUNTIME_CANDIDATE_SHA || '')) {
    fail(
      'SERVER_STAGING_CANDIDATE_IDENTITY_INVALID',
      'MENORAH_RUNTIME_CANDIDATE_SHA must be a full lowercase Git SHA.'
    );
  }

  if (
    !isApprovedVerificationVersion(
      env?.COUNSELLOR_ONBOARDING_CONSENT_VERSION
    )
    || !isApprovedVerificationVersion(
      env?.COUNSELLOR_CREDENTIAL_POLICY_VERSION
    )
  ) {
    fail(
      'SERVER_STAGING_COUNSELLOR_POLICY_INVALID',
      'The counsellor verification versions are not approved staging values.'
    );
  }

  assertMongoTarget(env?.MONGODB_URI);
  assertAdminRoleGrants(env?.ADMIN_ROLE_GRANTS_JSON);
  assertStrongDistinctPasswords(env);
  return true;
};

const statusHistoryEntry = ({ from, to, at, actor = null, reason = null }) => ({
  from,
  to,
  at,
  actorType: actor ? 'admin' : 'system',
  actor,
  reason,
});

const counsellorProfile = ({ alias }) => ({
  licenseNumber: `SYNTHETIC-SERVER-${alias}`,
  specialization: 'Synthetic QA',
  specializations: ['Synthetic QA'],
  experience: 0,
  education: [],
  certifications: [],
  bio: 'Synthetic staging-only profile; no clinical information.',
  languages: ['English'],
  hourlyRate: 1000,
  currency: 'INR',
  verificationDocuments: [],
  gallery: [],
});

const approvedVerificationState = ({
  alias,
  env,
  reviewedAt,
  expiresAt,
  suspendedAt = null,
}) => {
  const adminId = USER_IDS['ADMIN-FULL-1'];
  const applicationId = APPLICATION_IDS[alias];
  const evidenceId = EVIDENCE_IDS[alias];
  const statusHistory = [
    statusHistoryEntry({
      from: 'under_review',
      to: 'approved',
      at: reviewedAt,
      actor: adminId,
    }),
  ];
  if (suspendedAt) {
    statusHistory.push(statusHistoryEntry({
      from: 'approved',
      to: 'suspended',
      at: suspendedAt,
      actor: adminId,
      reason: 'Synthetic staging suspension fixture.',
    }));
  }

  return {
    application: applicationId,
    onboardingConsent: {
      accepted: true,
      version: env.COUNSELLOR_ONBOARDING_CONSENT_VERSION,
      acceptedAt: reviewedAt,
      source: 'counsellor_web_registration',
    },
    credentialReview: {
      decision: 'approved',
      policyVersion: env.COUNSELLOR_CREDENTIAL_POLICY_VERSION,
      evidenceIds: [evidenceId],
      reviewedBy: adminId,
      reviewedAt,
    },
    reviewStartedBy: adminId,
    reviewStartedAt: reviewedAt,
    approvedBy: adminId,
    approvedAt: reviewedAt,
    expiresAt,
    suspendedBy: suspendedAt ? adminId : null,
    suspendedAt,
    suspensionReason: suspendedAt
      ? 'Synthetic staging suspension fixture.'
      : null,
    marketplaceAssignmentFence: 0,
    legacyReviewRequired: false,
    schemaVersion: 1,
    statusHistory,
  };
};

const buildApplication = ({
  alias,
  account,
  counsellorId,
  env,
  reviewedAt,
  expiresAt,
  suspendedAt = null,
}) => {
  const adminId = USER_IDS['ADMIN-FULL-1'];
  const evidenceId = EVIDENCE_IDS[alias];
  const profile = counsellorProfile({ alias });
  const history = [
    statusHistoryEntry({
      from: 'submitted',
      to: 'under_review',
      at: reviewedAt,
      actor: adminId,
    }),
    statusHistoryEntry({
      from: 'under_review',
      to: 'approved',
      at: reviewedAt,
      actor: adminId,
    }),
  ];
  if (suspendedAt) {
    history.push(statusHistoryEntry({
      from: 'approved',
      to: 'suspended',
      at: suspendedAt,
      actor: adminId,
      reason: 'Synthetic staging suspension fixture.',
    }));
  }

  return {
    _id: APPLICATION_IDS[alias],
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
    phone: account.phone,
    dateOfBirth: account.dateOfBirth,
    gender: account.gender,
    ...profile,
    status: suspendedAt ? 'suspended' : 'approved',
    onboardingConsent: {
      accepted: true,
      version: env.COUNSELLOR_ONBOARDING_CONSENT_VERSION,
      acceptedAt: reviewedAt,
      source: 'counsellor_web_registration',
    },
    credentialEvidence: [{
      _id: evidenceId,
      reference: `urn:menorah:synthetic-server-staging:${alias.toLowerCase()}`,
      category: 'synthetic-fixture',
      submittedAt: reviewedAt,
      source: 'synthetic_server_staging',
      review: {
        decision: 'approved',
        policyVersion: env.COUNSELLOR_CREDENTIAL_POLICY_VERSION,
        reviewedBy: adminId,
        reviewedAt,
      },
    }],
    credentialReview: {
      decision: 'approved',
      policyVersion: env.COUNSELLOR_CREDENTIAL_POLICY_VERSION,
      evidenceIds: [evidenceId],
      reviewedBy: adminId,
      reviewedAt,
    },
    reviewStartedBy: adminId,
    reviewStartedAt: reviewedAt,
    decisionBy: adminId,
    decisionAt: reviewedAt,
    verificationExpiresAt: expiresAt,
    linkedUser: account._id,
    linkedCounsellor: counsellorId,
    reviewAccountSnapshot: {
      user: account._id,
      role: 'counsellor',
      isActive: false,
      sessionVersion: 0,
      email: account.email,
      phone: account.phone,
      capturedAt: reviewedAt,
    },
    legacyReviewRequired: false,
    lifecycleSchemaVersion: 1,
    statusHistory: history,
    reviewedBy: adminId,
    reviewedAt,
  };
};

const buildRoster = ({
  env = process.env,
  now = new Date(),
} = {}) => {
  assertSeedAllowed(env);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail(
      'SERVER_STAGING_SEED_TIME_INVALID',
      'The synthetic roster timestamp is invalid.'
    );
  }

  const reviewedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const suspendedAt = new Date(now.getTime() - 60 * 60 * 1000);
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const users = ACCOUNT_SPECS.map((spec) => {
    const document = {
      _id: USER_IDS[spec.alias],
      email: `${spec.emailLocalPart}@${SERVER_STAGING_EMAIL_DOMAIN}`,
      phone: spec.phone,
      password: env[PASSWORD_ENV_BY_ALIAS[spec.alias]],
      passwordAuthEnabled: true,
      isEmailVerified: spec.isVerified,
      isPhoneVerified: spec.isVerified,
      firstName: spec.firstName,
      lastName: spec.lastName,
      dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
      gender: 'prefer-not-to-say',
      preferredLanguage: 'English',
      timezone: 'UTC',
      notificationPreferences: {
        email: false,
        sms: false,
        push: false,
      },
      isActive: spec.isActive,
      sessionVersion: 0,
      kyc: { status: 'not_started', provider: null },
      role: spec.role,
    };
    return { alias: spec.alias, id: USER_IDS[spec.alias], document };
  });
  const userByAlias = new Map(
    users.map(({ alias, document }) => [alias, document])
  );

  const approvedAccount = userByAlias.get('COUNSELLOR-A');
  const draftAccount = userByAlias.get('COUNSELLOR-DRAFT');
  const suspendedAccount = userByAlias.get('COUNSELLOR-SUSPENDED');
  const counsellors = [
    {
      alias: 'COUNSELLOR-A',
      id: COUNSELLOR_IDS['COUNSELLOR-A'],
      document: {
        _id: COUNSELLOR_IDS['COUNSELLOR-A'],
        user: approvedAccount._id,
        ...counsellorProfile({ alias: 'COUNSELLOR-A' }),
        isVerified: true,
        isActive: true,
        isAvailable: true,
        status: 'approved',
        approvedBy: USER_IDS['ADMIN-FULL-1'],
        approvedAt: reviewedAt,
        professionalVerification: approvedVerificationState({
          alias: 'COUNSELLOR-A',
          env,
          reviewedAt,
          expiresAt,
        }),
      },
    },
    {
      alias: 'COUNSELLOR-DRAFT',
      id: COUNSELLOR_IDS['COUNSELLOR-DRAFT'],
      document: {
        _id: COUNSELLOR_IDS['COUNSELLOR-DRAFT'],
        user: draftAccount._id,
        ...counsellorProfile({ alias: 'COUNSELLOR-DRAFT' }),
        isVerified: false,
        isActive: false,
        isAvailable: false,
        status: 'draft',
        professionalVerification: {
          onboardingConsent: { accepted: false },
          credentialReview: {
            decision: 'pending',
            evidenceIds: [],
          },
          marketplaceAssignmentFence: 0,
          legacyReviewRequired: false,
          schemaVersion: 1,
          statusHistory: [
            statusHistoryEntry({
              from: null,
              to: 'draft',
              at: reviewedAt,
            }),
          ],
        },
      },
    },
    {
      alias: 'COUNSELLOR-SUSPENDED',
      id: COUNSELLOR_IDS['COUNSELLOR-SUSPENDED'],
      document: {
        _id: COUNSELLOR_IDS['COUNSELLOR-SUSPENDED'],
        user: suspendedAccount._id,
        ...counsellorProfile({ alias: 'COUNSELLOR-SUSPENDED' }),
        isVerified: false,
        isActive: false,
        isAvailable: false,
        status: 'suspended',
        approvedBy: USER_IDS['ADMIN-FULL-1'],
        approvedAt: reviewedAt,
        blockedAt: suspendedAt,
        blockedReason: 'Synthetic staging suspension fixture.',
        professionalVerification: approvedVerificationState({
          alias: 'COUNSELLOR-SUSPENDED',
          env,
          reviewedAt,
          expiresAt,
          suspendedAt,
        }),
      },
    },
  ];

  const applications = [
    {
      alias: 'COUNSELLOR-A',
      id: APPLICATION_IDS['COUNSELLOR-A'],
      document: buildApplication({
        alias: 'COUNSELLOR-A',
        account: approvedAccount,
        counsellorId: COUNSELLOR_IDS['COUNSELLOR-A'],
        env,
        reviewedAt,
        expiresAt,
      }),
    },
    {
      alias: 'COUNSELLOR-SUSPENDED',
      id: APPLICATION_IDS['COUNSELLOR-SUSPENDED'],
      document: buildApplication({
        alias: 'COUNSELLOR-SUSPENDED',
        account: suspendedAccount,
        counsellorId: COUNSELLOR_IDS['COUNSELLOR-SUSPENDED'],
        env,
        reviewedAt,
        expiresAt,
        suspendedAt,
      }),
    },
  ];

  return { users, counsellors, applications };
};

const runExistsQuery = async ({
  Model,
  filter,
  session,
  collation = null,
}) => {
  let query = Model.exists(filter);
  if (collation && typeof query.collation === 'function') {
    query = query.collation(collation);
  }
  if (typeof query.session === 'function') {
    query = query.session(session);
  }
  return query;
};

const assertRosterAbsent = async ({
  roster,
  session,
  UserModel,
  CounsellorModel,
  PendingApplicationModel,
}) => {
  const userDocuments = roster.users.map(({ document }) => document);
  const userCollision = await runExistsQuery({
    Model: UserModel,
    session,
    collation: COUNSELLOR_LICENSE_IDENTITY_COLLATION,
    filter: {
      $or: [
        { _id: { $in: userDocuments.map(({ _id }) => _id) } },
        { email: { $in: userDocuments.map(({ email }) => email) } },
        { phone: { $in: userDocuments.map(({ phone }) => phone) } },
      ],
    },
  });
  if (userCollision) {
    fail(
      'SERVER_STAGING_ROSTER_ALREADY_PRESENT',
      'A synthetic roster user identity already exists; no records were created.'
    );
  }

  const counsellorDocuments = roster.counsellors.map(
    ({ document }) => document
  );
  const counsellorCollision = await runExistsQuery({
    Model: CounsellorModel,
    session,
    collation: COUNSELLOR_LICENSE_IDENTITY_COLLATION,
    filter: {
      $or: [
        { _id: { $in: counsellorDocuments.map(({ _id }) => _id) } },
        { user: { $in: counsellorDocuments.map(({ user }) => user) } },
        {
          licenseNumber: {
            $in: counsellorDocuments.map(
              ({ licenseNumber }) => licenseNumber
            ),
          },
        },
      ],
    },
  });
  if (counsellorCollision) {
    fail(
      'SERVER_STAGING_ROSTER_ALREADY_PRESENT',
      'A synthetic roster counsellor identity already exists; no records were created.'
    );
  }

  const counsellorUsers = roster.users.filter(
    ({ alias }) => Object.hasOwn(COUNSELLOR_IDS, alias)
  );
  const applicationCollision = await runExistsQuery({
    Model: PendingApplicationModel,
    session,
    collation: COUNSELLOR_LICENSE_IDENTITY_COLLATION,
    filter: {
      $or: [
        { _id: { $in: Object.values(APPLICATION_IDS) } },
        {
          linkedUser: {
            $in: counsellorUsers.map(({ id }) => id),
          },
        },
        {
          linkedCounsellor: {
            $in: Object.values(COUNSELLOR_IDS),
          },
        },
        {
          email: {
            $in: counsellorUsers.map(({ document: { email } }) => email),
          },
        },
        {
          phone: {
            $in: counsellorUsers.map(({ document: { phone } }) => phone),
          },
        },
        {
          licenseNumber: {
            $in: counsellorDocuments.map(
              ({ licenseNumber }) => licenseNumber
            ),
          },
        },
      ],
    },
  });
  if (applicationCollision) {
    fail(
      'SERVER_STAGING_ROSTER_ALREADY_PRESENT',
      'A synthetic roster application identity already exists; no records were created.'
    );
  }
};

const safeSummary = (roster) => ({
  counts: {
    users: roster.users.length,
    counsellors: roster.counsellors.length,
    applications: roster.applications.length,
    total:
      roster.users.length
      + roster.counsellors.length
      + roster.applications.length,
  },
  identities: roster.users.map(({ alias, id }) => {
    const counsellor = roster.counsellors.find(
      ({ alias: counsellorAlias }) => counsellorAlias === alias
    );
    const application = roster.applications.find(
      ({ alias: applicationAlias }) => applicationAlias === alias
    );
    return {
      alias,
      userId: id,
      ...(counsellor ? { counsellorId: counsellor.id } : {}),
      ...(application ? { applicationId: application.id } : {}),
    };
  }),
});

const seedSyntheticRoster = async ({
  env = process.env,
  now = new Date(),
  mongooseInstance = mongoose,
  UserModel = User,
  CounsellorModel = Counsellor,
  PendingApplicationModel = PendingApplication,
  hashPassword = (password) => bcrypt.hash(password, 12),
  logger = console,
} = {}) => {
  const roster = buildRoster({ env, now });
  const hashedUserDocuments = await Promise.all(
    roster.users.map(async ({ document }) => ({
      ...document,
      password: await hashPassword(document.password),
    }))
  );
  const session = await mongooseInstance.startSession();
  try {
    await session.withTransaction(async () => {
      await assertRosterAbsent({
        roster,
        session,
        UserModel,
        CounsellorModel,
        PendingApplicationModel,
      });
      await UserModel.insertMany(hashedUserDocuments, {
        session,
        ordered: true,
      });
      await PendingApplicationModel.insertMany(
        roster.applications.map(({ document }) => document),
        { session, ordered: true }
      );
      await CounsellorModel.insertMany(
        roster.counsellors.map(({ document }) => document),
        { session, ordered: true }
      );
    }, TRANSACTION_OPTIONS);
  } finally {
    await session.endSession();
  }

  const summary = safeSummary(roster);
  logger.info(JSON.stringify(summary));
  return summary;
};

const run = async ({
  env = process.env,
  mongooseInstance = mongoose,
  ...dependencies
} = {}) => {
  assertSeedAllowed(env);
  let connected = false;
  try {
    await mongooseInstance.connect(env.MONGODB_URI, { autoIndex: false });
    connected = true;
    return await seedSyntheticRoster({
      env,
      mongooseInstance,
      ...dependencies,
    });
  } finally {
    if (connected) {
      await mongooseInstance.disconnect();
    }
  }
};

const safeErrorCode = (error) => (
  error instanceof ServerStagingSeedError
    ? error.code
    : 'UNEXPECTED_ERROR'
);

if (require.main === module) {
  run().catch((error) => {
    console.error(
      `Server staging synthetic roster seed failed (${safeErrorCode(error)}).`
    );
    process.exitCode = 1;
  });
}

module.exports = {
  ADMIN_ROLE_GRANTS,
  APPLICATION_IDS,
  COUNSELLOR_IDS,
  EVIDENCE_IDS,
  SERVER_STAGING_DATABASE,
  SERVER_STAGING_EMAIL_DOMAIN,
  SERVER_STAGING_ENVIRONMENT_ID,
  SERVER_STAGING_PROJECT,
  SERVER_STAGING_REPLICA_SET,
  ServerStagingSeedError,
  PASSWORD_ENV_BY_ALIAS,
  SEED_CONFIRMATION,
  TRANSACTION_OPTIONS,
  USER_IDS,
  assertMongoTarget,
  assertRosterAbsent,
  assertSeedAllowed,
  assertStrongDistinctPasswords,
  buildRoster,
  run,
  safeErrorCode,
  seedSyntheticRoster,
};
