const fs = require('fs');
const path = require('path');
const { resolveWorkerJobs } = require('../worker');

describe('worker scheduler isolation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.WORKER_MODE;
    delete process.env.SERVICE_RUNTIME;
    delete process.env.ENABLE_ARTICLE_SCHEDULER;
    delete process.env.ENABLE_COUNSELLOR_VERIFICATION_EXPIRY_JOB;
    delete process.env.ENABLE_SOCIAL_SCHEDULER;
    delete process.env.PRIVACY_RETENTION_EXECUTION_ENABLED;
    delete process.env.ARTICLE_SCHEDULER_ENABLED;
    delete process.env.ENABLE_NOTIFICATION_JOBS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('Cloud Run worker defaults to standby', () => {
    process.env.SERVICE_RUNTIME = 'cloudrun';

    const jobs = resolveWorkerJobs();

    expect(jobs.mode).toBe('standby');
    expect(jobs.active).toBe(false);
    expect(jobs.articleScheduler).toBe(false);
    expect(jobs.counsellorVerificationExpiry).toBe(false);
    expect(jobs.privacyRetention).toBe(false);
    expect(jobs.socialScheduler).toBe(false);
  });

  test('worker only enables schedulers in active mode', () => {
    process.env.WORKER_MODE = 'active';
    process.env.ENABLE_ARTICLE_SCHEDULER = 'true';
    process.env.ENABLE_SOCIAL_SCHEDULER = 'true';
    process.env.PRIVACY_RETENTION_EXECUTION_ENABLED = 'true';
    process.env.ENABLE_NOTIFICATION_JOBS = 'true';

    const jobs = resolveWorkerJobs();

    expect(jobs.active).toBe(true);
    expect(jobs.articleScheduler).toBe(true);
    expect(jobs.counsellorVerificationExpiry).toBe(true);
    expect(jobs.privacyRetention).toBe(true);
    expect(jobs.socialScheduler).toBe(true);
    expect(jobs.notificationJobs).toBe(true);

    process.env.WORKER_MODE = 'standby';
    const standbyJobs = resolveWorkerJobs();
    expect(standbyJobs.articleScheduler).toBe(false);
    expect(standbyJobs.counsellorVerificationExpiry).toBe(false);
    expect(standbyJobs.privacyRetention).toBe(false);
    expect(standbyJobs.socialScheduler).toBe(false);
    expect(standbyJobs.notificationJobs).toBe(false);
  });

  test('active workers can explicitly disable Android push jobs', () => {
    process.env.WORKER_MODE = 'active';
    process.env.ENABLE_NOTIFICATION_JOBS = 'false';

    expect(resolveWorkerJobs().notificationJobs).toBe(false);
  });

  test('Android push jobs are fail-closed and use every accepted true spelling', () => {
    process.env.WORKER_MODE = 'active';
    expect(resolveWorkerJobs().notificationJobs).toBe(false);

    for (const value of ['true', 'TRUE', '1', 'yes', 'on']) {
      process.env.ENABLE_NOTIFICATION_JOBS = value;
      expect(resolveWorkerJobs().notificationJobs).toBe(true);
    }
  });

  test('active workers can explicitly disable the expiry job', () => {
    process.env.WORKER_MODE = 'active';
    process.env.ENABLE_COUNSELLOR_VERIFICATION_EXPIRY_JOB = 'false';

    expect(resolveWorkerJobs().counsellorVerificationExpiry).toBe(false);
  });

  test('privacy retention is disabled by default and only exact true enables it', () => {
    process.env.WORKER_MODE = 'active';
    expect(resolveWorkerJobs().privacyRetention).toBe(false);

    process.env.PRIVACY_RETENTION_EXECUTION_ENABLED = 'TRUE';
    expect(resolveWorkerJobs().privacyRetention).toBe(false);

    process.env.PRIVACY_RETENTION_EXECUTION_ENABLED = 'true';
    expect(resolveWorkerJobs().privacyRetention).toBe(true);
  });

  test('API startup does not import scheduler starters', () => {
    const startServicePath = path.resolve(__dirname, '../../../shared/app/startService.js');
    const startServiceSource = fs.readFileSync(startServicePath, 'utf8');

    expect(startServiceSource).not.toContain('startArticleScheduler');
    expect(startServiceSource).not.toContain('startSocialScheduler');
  });
});
