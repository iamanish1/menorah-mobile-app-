const Counsellor = require('../../models/Counsellor');
const PendingApplication = require('../../models/PendingApplication');
const User = require('../../models/User');
const {
  isCounsellorProfessionallyApproved,
} = require('../../services/counsellorVerificationPolicy');
const {
  ADMIN_ROLE_GRANTS,
  COUNSELLOR_IDS,
  SERVER_STAGING_EMAIL_DOMAIN,
  ServerStagingSeedError,
  PASSWORD_ENV_BY_ALIAS,
  SEED_CONFIRMATION,
  TRANSACTION_OPTIONS,
  USER_IDS,
  assertMongoTarget,
  assertSeedAllowed,
  buildRoster,
  run,
  safeErrorCode,
  seedSyntheticRoster,
} = require('../seed-server-staging');

const NOW = new Date('2026-07-24T00:00:00.000Z');

const makeEnv = () => {
  const env = {
    NODE_ENV: 'production',
    DEPLOYMENT_ENVIRONMENT: 'staging',
    MENORAH_SERVER_STAGING_SEED_CONFIRM: SEED_CONFIRMATION,
    MENORAH_SYNTHETIC_DATA_ONLY: 'true',
    COMPOSE_PROJECT_NAME: 'menorah-server-staging-validation',
    MENORAH_SERVER_STAGING_ENVIRONMENT_ID: 'menorah-server-staging-v1',
    MENORAH_RUNTIME_CANDIDATE_SHA: 'a'.repeat(40),
    MENORAH_STAGING_EMAIL_DOMAIN: SERVER_STAGING_EMAIL_DOMAIN,
    MONGO_INITDB_DATABASE: 'menorah_staging',
    MONGODB_REPLICA_SET_NAME: 'menorah-staging-rs',
    MONGODB_URI:
      'mongodb://server-seed:unit-only-credential@staging-mongo-primary:27017/menorah_staging?authSource=admin&replicaSet=menorah-staging-rs&retryWrites=true',
    COUNSELLOR_ONBOARDING_CONSENT_VERSION: 'local-consent-v1',
    COUNSELLOR_CREDENTIAL_POLICY_VERSION: 'local-credential-policy-v1',
    ADMIN_ROLE_GRANTS_JSON: JSON.stringify(
      ADMIN_ROLE_GRANTS.map(({ adminId, role }) => ({ adminId, role }))
    ),
  };
  Object.entries(PASSWORD_ENV_BY_ALIAS).forEach(
    ([, environmentName], index) => {
      env[environmentName] =
        `UnitOnly!Aa${String(index).padStart(8, '0')}Zz#`;
    }
  );
  return env;
};

const makeQuery = (result) => {
  const query = {};
  query.collation = jest.fn(() => query);
  query.session = jest.fn(async () => result);
  return query;
};

const makeModel = (collision = null, transactionState = null) => ({
  exists: jest.fn(() => makeQuery(collision)),
  insertMany: jest.fn(async () => {
    if (transactionState) expect(transactionState.active).toBe(true);
    return [];
  }),
});

const makeMongoose = (transactionState = { active: false }) => {
  const session = {
    withTransaction: jest.fn(async (work) => {
      transactionState.active = true;
      try {
        return await work();
      } finally {
        transactionState.active = false;
      }
    }),
    endSession: jest.fn(async () => {}),
  };
  return {
    instance: {
      startSession: jest.fn(async () => session),
    },
    session,
    transactionState,
  };
};

describe('server staging synthetic seed target guards', () => {
  test('accepts only the complete expected server staging identity', () => {
    expect(assertSeedAllowed(makeEnv())).toBe(true);
  });

  test.each([
    ['NODE_ENV', 'test'],
    ['DEPLOYMENT_ENVIRONMENT', 'development'],
    ['MENORAH_SERVER_STAGING_SEED_CONFIRM', 'true'],
    ['MENORAH_SYNTHETIC_DATA_ONLY', 'TRUE'],
    ['COMPOSE_PROJECT_NAME', 'menorah'],
    ['MENORAH_SERVER_STAGING_ENVIRONMENT_ID', 'menorah-server-staging-v2'],
    ['MENORAH_STAGING_EMAIL_DOMAIN', 'staging.localhost'],
    ['MONGO_INITDB_DATABASE', 'menorah'],
    ['MONGODB_REPLICA_SET_NAME', 'menorah-rs'],
  ])('rejects a non-exact %s target value', (key, value) => {
    const env = makeEnv();
    env[key] = value;
    expect(() => assertSeedAllowed(env)).toThrow(
      expect.objectContaining({ code: 'SERVER_STAGING_TARGET_GUARD_FAILED' })
    );
  });

  test.each([
    '',
    'a'.repeat(39),
    'A'.repeat(40),
    'g'.repeat(40),
    '3fb99858c6766a341bb7b7dab2377195427f0ea1-dirty',
  ])('rejects malformed candidate identity %p', (candidate) => {
    const env = makeEnv();
    env.MENORAH_RUNTIME_CANDIDATE_SHA = candidate;
    expect(() => assertSeedAllowed(env)).toThrow(
      expect.objectContaining({
        code: 'SERVER_STAGING_CANDIDATE_IDENTITY_INVALID',
      })
    );
  });

  test.each([
    [
      'wrong host',
      'mongodb://server-seed:unit-only-credential@mongo:27017/menorah_staging?authSource=admin&replicaSet=menorah-staging-rs',
    ],
    [
      'non-exact host casing',
      'mongodb://server-seed:unit-only-credential@STAGING-MONGO-PRIMARY:27017/menorah_staging?authSource=admin&replicaSet=menorah-staging-rs',
    ],
    [
      'wrong port',
      'mongodb://server-seed:unit-only-credential@staging-mongo-primary:27018/menorah_staging?authSource=admin&replicaSet=menorah-staging-rs',
    ],
    [
      'wrong database',
      'mongodb://server-seed:unit-only-credential@staging-mongo-primary:27017/production?authSource=admin&replicaSet=menorah-staging-rs',
    ],
    [
      'wrong auth source',
      'mongodb://server-seed:unit-only-credential@staging-mongo-primary:27017/menorah_staging?authSource=menorah&replicaSet=menorah-staging-rs',
    ],
    [
      'wrong replica set',
      'mongodb://server-seed:unit-only-credential@staging-mongo-primary:27017/menorah_staging?authSource=admin&replicaSet=other-rs',
    ],
    [
      'missing credentials',
      'mongodb://staging-mongo-primary:27017/menorah_staging?authSource=admin&replicaSet=menorah-staging-rs',
    ],
    [
      'SRV target',
      'mongodb+srv://server-seed:unit-only-credential@staging-mongo-primary/menorah_staging?authSource=admin&replicaSet=menorah-staging-rs',
    ],
    [
      'extra target option',
      'mongodb://server-seed:unit-only-credential@staging-mongo-primary:27017/menorah_staging?authSource=admin&replicaSet=menorah-staging-rs&directConnection=true',
    ],
    [
      'disabled retryable writes',
      'mongodb://server-seed:unit-only-credential@staging-mongo-primary:27017/menorah_staging?authSource=admin&replicaSet=menorah-staging-rs&retryWrites=false',
    ],
    [
      'duplicate target option',
      'mongodb://server-seed:unit-only-credential@staging-mongo-primary:27017/menorah_staging?authSource=admin&authSource=admin&replicaSet=menorah-staging-rs',
    ],
  ])('rejects a Mongo URI with %s', (_label, uri) => {
    expect(() => assertMongoTarget(uri)).toThrow(
      expect.objectContaining({
        code: 'SERVER_STAGING_MONGODB_TARGET_INVALID',
      })
    );
  });

  test.each([
    'COUNSELLOR_ONBOARDING_CONSENT_VERSION',
    'COUNSELLOR_CREDENTIAL_POLICY_VERSION',
  ])('rejects an unapproved %s', (key) => {
    const env = makeEnv();
    env[key] = 'REPLACE_ME';
    expect(() => assertSeedAllowed(env)).toThrow(
      expect.objectContaining({
        code: 'SERVER_STAGING_COUNSELLOR_POLICY_INVALID',
      })
    );
  });

  test.each([
    undefined,
    'not-json',
    '[]',
    JSON.stringify([{
      adminId: USER_IDS['ADMIN-FULL-1'],
      role: 'admin',
    }]),
    JSON.stringify(
      ADMIN_ROLE_GRANTS.map(({ adminId, role }, index) => ({
        adminId,
        role: index === 0 ? 'admin' : role,
      }))
    ),
  ])('rejects a non-exact admin grant roster', (grants) => {
    const env = makeEnv();
    env.ADMIN_ROLE_GRANTS_JSON = grants;
    expect(() => assertSeedAllowed(env)).toThrow(
      expect.objectContaining({
        code: 'SERVER_STAGING_ADMIN_GRANTS_INVALID',
      })
    );
  });

  test.each([
    ['missing', ''],
    ['short', 'shortA1!'],
    ['missing uppercase', 'alllowercase123!'],
    ['missing lowercase', 'ALLUPPERCASE123!'],
    ['missing number', 'NoNumberIncluded!'],
    ['missing symbol', 'NoSymbolIncluded123'],
    ['obvious default', 'PasswordDefault123!'],
    ['whitespace', 'Contains whitespace 123!Aa'],
  ])('rejects a %s protected password input', (_label, password) => {
    const env = makeEnv();
    env[PASSWORD_ENV_BY_ALIAS['USER-A']] = password;
    expect(() => assertSeedAllowed(env)).toThrow(
      expect.objectContaining({ code: 'SERVER_STAGING_PASSWORD_INVALID' })
    );
  });

  test('rejects a shared password before roster construction', () => {
    const env = makeEnv();
    env[PASSWORD_ENV_BY_ALIAS['USER-B']] =
      env[PASSWORD_ENV_BY_ALIAS['USER-A']];
    expect(() => assertSeedAllowed(env)).toThrow(
      expect.objectContaining({ code: 'SERVER_STAGING_PASSWORD_REUSED' })
    );
  });

  test('refuses before connecting when any guard fails', async () => {
    const env = makeEnv();
    env.NODE_ENV = 'test';
    const mongooseInstance = {
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    await expect(run({ env, mongooseInstance })).rejects.toMatchObject({
      code: 'SERVER_STAGING_TARGET_GUARD_FAILED',
    });
    expect(mongooseInstance.connect).not.toHaveBeenCalled();
    expect(mongooseInstance.disconnect).not.toHaveBeenCalled();
  });
});

describe('server staging synthetic roster', () => {
  test('has the exact bounded shape and only clearly synthetic profile data', () => {
    const env = makeEnv();
    const roster = buildRoster({ env, now: NOW });

    expect(roster.users).toHaveLength(10);
    expect(roster.counsellors).toHaveLength(3);
    expect(roster.applications).toHaveLength(2);
    expect(roster.users.map(({ alias }) => alias)).toEqual([
      'USER-A',
      'USER-B',
      'COUNSELLOR-A',
      'COUNSELLOR-DRAFT',
      'COUNSELLOR-SUSPENDED',
      'ADMIN-SUPPORT',
      'ADMIN-FINANCE',
      'ADMIN-CONTENT',
      'ADMIN-FULL-1',
      'ADMIN-FULL-2',
    ]);

    const userDocuments = roster.users.map(({ document }) => document);
    expect(userDocuments.filter(({ role }) => role === 'user')).toHaveLength(2);
    expect(
      userDocuments.filter(({ role }) => role === 'counsellor')
    ).toHaveLength(3);
    expect(userDocuments.filter(({ role }) => role === 'admin')).toHaveLength(5);
    expect(new Set(userDocuments.map(({ email }) => email)).size).toBe(10);
    expect(new Set(userDocuments.map(({ phone }) => phone)).size).toBe(10);
    expect(new Set(userDocuments.map(({ password }) => password)).size).toBe(10);
    userDocuments.forEach((document) => {
      expect(document.email.endsWith(`@${SERVER_STAGING_EMAIL_DOMAIN}`)).toBe(
        true
      );
      expect(document.phone).toMatch(/^\+1202555010[0-9]$/);
      expect(document.gender).toBe('prefer-not-to-say');
      expect(document.kyc).toEqual({ status: 'not_started', provider: null });
      expect(new User(document).validateSync()).toBeUndefined();
    });

    expect(
      roster.users
        .filter(({ document }) => document.role === 'admin')
        .map(({ alias, id, document }) => ({
          alias,
          adminId: id,
          databaseRole: document.role,
        }))
    ).toEqual(
      ADMIN_ROLE_GRANTS.map(({ alias, adminId }) => ({
        alias,
        adminId,
        databaseRole: 'admin',
      }))
    );
    expect(ADMIN_ROLE_GRANTS.map(({ role }) => role)).toEqual([
      'support',
      'finance',
      'content',
      'admin',
      'admin',
    ]);

    expect(
      roster.counsellors.map(({ alias, document }) => ({
        alias,
        status: document.status,
        verified: document.isVerified,
        active: document.isActive,
        available: document.isAvailable,
      }))
    ).toEqual([
      {
        alias: 'COUNSELLOR-A',
        status: 'approved',
        verified: true,
        active: true,
        available: true,
      },
      {
        alias: 'COUNSELLOR-DRAFT',
        status: 'draft',
        verified: false,
        active: false,
        available: false,
      },
      {
        alias: 'COUNSELLOR-SUSPENDED',
        status: 'suspended',
        verified: false,
        active: false,
        available: false,
      },
    ]);
    roster.counsellors.forEach(({ document }) => {
      expect(document.education).toEqual([]);
      expect(document.certifications).toEqual([]);
      expect(document.verificationDocuments).toEqual([]);
      expect(document).not.toHaveProperty('bankDetails');
      expect(new Counsellor(document).validateSync()).toBeUndefined();
    });
    roster.applications.forEach(({ document }) => {
      expect(document.credentialEvidence).toHaveLength(1);
      expect(document.credentialEvidence[0].reference).toMatch(
        /^urn:menorah:synthetic-server-staging:/
      );
      expect(new PendingApplication(document).validateSync()).toBeUndefined();
    });

    const approved = roster.counsellors[0].document;
    const approvedAccount = roster.users.find(
      ({ alias }) => alias === 'COUNSELLOR-A'
    ).document;
    const suspended = roster.counsellors[2].document;
    const suspendedAccount = roster.users.find(
      ({ alias }) => alias === 'COUNSELLOR-SUSPENDED'
    ).document;
    const config = {
      configured: true,
      verificationConfigured: true,
      onboardingConsentVersion:
        env.COUNSELLOR_ONBOARDING_CONSENT_VERSION,
      credentialPolicyVersion: env.COUNSELLOR_CREDENTIAL_POLICY_VERSION,
    };
    expect(isCounsellorProfessionallyApproved(approved, {
      now: NOW,
      config,
      account: approvedAccount,
    })).toBe(true);
    expect(isCounsellorProfessionallyApproved(suspended, {
      now: NOW,
      config,
      account: suspendedAccount,
    })).toBe(false);
  });
});

describe('server staging synthetic roster writes', () => {
  test.each([
    ['user', 'UserModel'],
    ['counsellor', 'CounsellorModel'],
    ['application', 'PendingApplicationModel'],
  ])(
    'does not mutate anything when a %s roster identity already exists',
    async (_label, collisionModel) => {
      const existing = Object.freeze({ _id: 'existing-synthetic-identity' });
      const transaction = makeMongoose();
      const UserModel = makeModel(
        collisionModel === 'UserModel' ? existing : null,
        transaction.transactionState
      );
      const CounsellorModel = makeModel(
        collisionModel === 'CounsellorModel' ? existing : null,
        transaction.transactionState
      );
      const PendingApplicationModel = makeModel(
        collisionModel === 'PendingApplicationModel' ? existing : null,
        transaction.transactionState
      );

      await expect(seedSyntheticRoster({
        env: makeEnv(),
        now: NOW,
        mongooseInstance: transaction.instance,
        UserModel,
        CounsellorModel,
        PendingApplicationModel,
        hashPassword: jest.fn(async () => 'unit-only-hash'),
        logger: { info: jest.fn() },
      })).rejects.toMatchObject({
        code: 'SERVER_STAGING_ROSTER_ALREADY_PRESENT',
      });

      expect(UserModel.insertMany).not.toHaveBeenCalled();
      expect(CounsellorModel.insertMany).not.toHaveBeenCalled();
      expect(PendingApplicationModel.insertMany).not.toHaveBeenCalled();
      expect(existing).toEqual({ _id: 'existing-synthetic-identity' });
      expect(transaction.session.endSession).toHaveBeenCalledTimes(1);
    }
  );

  test('checks every roster ID, email, phone, and counsellor license before inserting', async () => {
    const transaction = makeMongoose();
    const UserModel = makeModel(null, transaction.transactionState);
    const CounsellorModel = makeModel(null, transaction.transactionState);
    const PendingApplicationModel = makeModel(
      null,
      transaction.transactionState
    );

    await seedSyntheticRoster({
      env: makeEnv(),
      now: NOW,
      mongooseInstance: transaction.instance,
      UserModel,
      CounsellorModel,
      PendingApplicationModel,
      hashPassword: jest.fn(async () => 'unit-only-hash'),
      logger: { info: jest.fn() },
    });

    const userFilter = UserModel.exists.mock.calls[0][0];
    expect(userFilter.$or).toEqual([
      { _id: { $in: Object.values(USER_IDS) } },
      {
        email: {
          $in: expect.arrayContaining([
            `user-a@${SERVER_STAGING_EMAIL_DOMAIN}`,
            `admin-full-2@${SERVER_STAGING_EMAIL_DOMAIN}`,
          ]),
        },
      },
      {
        phone: {
          $in: expect.arrayContaining(['+12025550100', '+12025550109']),
        },
      },
    ]);

    const counsellorFilter = CounsellorModel.exists.mock.calls[0][0];
    expect(counsellorFilter.$or[0]).toEqual({
      _id: { $in: Object.values(COUNSELLOR_IDS) },
    });
    expect(counsellorFilter.$or[1].user.$in).toEqual([
      USER_IDS['COUNSELLOR-A'],
      USER_IDS['COUNSELLOR-DRAFT'],
      USER_IDS['COUNSELLOR-SUSPENDED'],
    ]);
    expect(counsellorFilter.$or[2].licenseNumber.$in).toEqual([
      'SYNTHETIC-SERVER-COUNSELLOR-A',
      'SYNTHETIC-SERVER-COUNSELLOR-DRAFT',
      'SYNTHETIC-SERVER-COUNSELLOR-SUSPENDED',
    ]);

    const applicationFilter =
      PendingApplicationModel.exists.mock.calls[0][0];
    expect(applicationFilter.$or).toHaveLength(6);
    expect(applicationFilter.$or[0]._id.$in).toHaveLength(3);
    expect(applicationFilter.$or[1].linkedUser.$in).toHaveLength(3);
    expect(applicationFilter.$or[2].linkedCounsellor.$in).toHaveLength(3);
    expect(applicationFilter.$or[3].email.$in).toHaveLength(3);
    expect(applicationFilter.$or[4].phone.$in).toHaveLength(3);
    expect(applicationFilter.$or[5].licenseNumber.$in).toHaveLength(3);
  });

  test('uses one transaction for insert-only creation and emits only aliases, IDs, and counts', async () => {
    const env = makeEnv();
    const transaction = makeMongoose();
    const UserModel = makeModel(null, transaction.transactionState);
    const CounsellorModel = makeModel(null, transaction.transactionState);
    const PendingApplicationModel = makeModel(
      null,
      transaction.transactionState
    );
    const logger = { info: jest.fn() };
    const hashPassword = jest.fn(async (password) => (
      `unit-only-hash-${password.length}`
    ));

    const summary = await seedSyntheticRoster({
      env,
      now: NOW,
      mongooseInstance: transaction.instance,
      UserModel,
      CounsellorModel,
      PendingApplicationModel,
      hashPassword,
      logger,
    });

    expect(transaction.instance.startSession).toHaveBeenCalledTimes(1);
    expect(transaction.session.withTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.session.withTransaction.mock.calls[0][1]).toEqual(
      TRANSACTION_OPTIONS
    );
    expect(transaction.session.endSession).toHaveBeenCalledTimes(1);
    expect(hashPassword).toHaveBeenCalledTimes(10);
    expect(UserModel.insertMany).toHaveBeenCalledTimes(1);
    expect(UserModel.insertMany.mock.calls[0][0]).toHaveLength(10);
    expect(PendingApplicationModel.insertMany).toHaveBeenCalledTimes(1);
    expect(PendingApplicationModel.insertMany.mock.calls[0][0]).toHaveLength(
      2
    );
    expect(CounsellorModel.insertMany).toHaveBeenCalledTimes(1);
    expect(CounsellorModel.insertMany.mock.calls[0][0]).toHaveLength(3);
    [
      UserModel,
      PendingApplicationModel,
      CounsellorModel,
    ].forEach((Model) => {
      expect(Model.insertMany.mock.calls[0][1]).toEqual({
        session: transaction.session,
        ordered: true,
      });
    });

    expect(summary.counts).toEqual({
      users: 10,
      counsellors: 3,
      applications: 2,
      total: 15,
    });
    expect(summary.identities).toHaveLength(10);
    expect(summary.identities[2]).toEqual({
      alias: 'COUNSELLOR-A',
      userId: USER_IDS['COUNSELLOR-A'],
      counsellorId: COUNSELLOR_IDS['COUNSELLOR-A'],
      applicationId: '7a110ca15a6e000000000301',
    });

    expect(logger.info).toHaveBeenCalledTimes(1);
    const output = logger.info.mock.calls[0][0];
    expect(output).not.toMatch(/email|password|token|phone|@|\+1202/i);
    buildRoster({ env, now: NOW }).users.forEach(({ document }) => {
      expect(output).not.toContain(document.email);
      expect(output).not.toContain(document.phone);
      expect(output).not.toContain(document.password);
    });
  });

  test('reduces unexpected CLI failures to a value-free error code', () => {
    expect(safeErrorCode({
      message:
        'duplicate key for user-a@mail.staging.menorah.me and +12025550100',
    })).toBe('UNEXPECTED_ERROR');
    expect(safeErrorCode(new ServerStagingSeedError(
      'SERVER_STAGING_ROSTER_ALREADY_PRESENT',
      'value-free controlled failure'
    ))).toBe('SERVER_STAGING_ROSTER_ALREADY_PRESENT');
    expect(safeErrorCode({
      code: 'PASSWORD_LIKE_UNTRUSTED_VALUE',
    })).toBe('UNEXPECTED_ERROR');
  });
});
