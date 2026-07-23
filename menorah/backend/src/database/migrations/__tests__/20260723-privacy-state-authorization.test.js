const {
  MIGRATION_VERSION,
  rightsWorkflowVersionUpdate,
  userSecurityBackfill,
} = require('../20260723-privacy-state-authorization');
const PrivacyConsentState = require('../../../models/PrivacyConsentState');
const User = require('../../../models/User');

describe('privacy state and authorization migration', () => {
  test('backfills workflow fences without changing request status', () => {
    expect(rightsWorkflowVersionUpdate()).toEqual({
      $set: {
        workflowVersion: { $ifNull: ['$workflowVersion', 1] },
      },
    });
    expect(JSON.stringify(rightsWorkflowVersionUpdate())).not.toMatch(
      /status|completed|rejected|legalHold/
    );
  });

  test('distinguishes social-only password authentication', () => {
    const serialized = JSON.stringify(userSecurityBackfill());
    expect(serialized).toContain('socialAuth.googleSub');
    expect(serialized).toContain('socialAuth.appleSub');
    expect(serialized).toContain('lastPasswordChangeAt');
    expect(serialized).toContain('passwordAuthEnabled');
    expect(serialized).not.toContain('privacyPermissions');
  });

  test('defines unique consent state without persisted privacy grants', () => {
    expect(PrivacyConsentState.schema.indexes()).toEqual(expect.arrayContaining([
      [
        { subjectUser: 1 },
        expect.objectContaining({
          unique: true,
          name: 'privacy_consent_state_subject_unique_v2',
        }),
      ],
    ]));
    expect(User.schema.path('privacyPermissions')).toBeUndefined();
    expect(User.schema.path('passwordAuthEnabled').options.select).toBe(false);
  });

  test('uses an explicit migration version without policy claims', () => {
    expect(MIGRATION_VERSION).toBe('20260723-privacy-state-authorization-v1');
    expect(MIGRATION_VERSION).not.toMatch(/approved|compliant|certified/i);
  });
});
