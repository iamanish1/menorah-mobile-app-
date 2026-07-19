const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = { role: 'admin' };
    next();
  },
  adminAuth: (_req, _res, next) => next(),
  requireRecentAdminMfa: (_req, _res, next) => next(),
}));

const adminRouter = require('../admin');

describe('admin server usage telemetry', () => {
  const originalEnv = {
    MENORAH_BACKUP_ROOT: process.env.MENORAH_BACKUP_ROOT,
    BACKUP_EXPECT_RAID: process.env.BACKUP_EXPECT_RAID,
    BACKUP_AUTOMATION_ENABLED: process.env.BACKUP_AUTOMATION_ENABLED,
    BACKUP_ENCRYPTION_PASSWORD: process.env.BACKUP_ENCRYPTION_PASSWORD
  };

  beforeEach(() => {
    process.env.MENORAH_BACKUP_ROOT = '/tmp/menorah-test-missing-backups';
    process.env.BACKUP_EXPECT_RAID = 'false';
    process.env.BACKUP_AUTOMATION_ENABLED = 'false';
    process.env.BACKUP_ENCRYPTION_PASSWORD = 'test-secret-that-must-not-be-returned';
  });

  afterAll(() => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  test('does not expose CPU hardware identifiers', async () => {
    const app = express();
    app.use('/api/admin', adminRouter);

    const res = await request(app).get('/api/admin/server-usage').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.cpu).toEqual({
      usagePercent: expect.any(Number),
      loadAverage: expect.any(Array),
    });
    expect(res.body.data.server).toEqual(expect.objectContaining({
      label: expect.any(String),
      hostname: expect.any(String),
      uptimeSeconds: expect.any(Number),
      cpu: {
        usagePercent: expect.any(Number),
        loadAverage: expect.any(Array),
      },
      memory: expect.objectContaining({
        total: expect.any(Number),
        used: expect.any(Number),
        free: expect.any(Number),
        usagePercent: expect.any(Number),
      }),
      disk: expect.objectContaining({
        root: expect.any(Object),
        data: expect.any(Object),
      }),
      network: expect.objectContaining({
        rxBytes: expect.any(Number),
        txBytes: expect.any(Number),
      }),
    }));
    expect(res.body.data.backup).toEqual(expect.objectContaining({
      status: expect.stringMatching(/^(ok|warning|critical)$/),
      headline: expect.any(String),
      message: expect.any(String),
      backupRoot: '/tmp/menorah-test-missing-backups',
      automationEnabled: false,
      latest: null,
      restoreTest: expect.objectContaining({
        ok: false,
      }),
      coldStorage: expect.objectContaining({
        mode: 'manual',
      }),
    }));
    expect(JSON.stringify(res.body.data.backup)).not.toContain('test-secret-that-must-not-be-returned');
    expect(res.body.data.cpu).not.toHaveProperty('model');
    expect(res.body.data.cpu).not.toHaveProperty('cores');
    expect(res.body.data.server.cpu).not.toHaveProperty('model');
    expect(res.body.data.server.cpu).not.toHaveProperty('cores');
  });
});
