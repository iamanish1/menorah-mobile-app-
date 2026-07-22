const { FACE_CHECK_CONSENT_VERSION } = require('../../config/kyc');
const { evaluateFaceCheckConsent } = require('../faceCheckConsent');

describe('face-check consent policy', () => {
  test('requires an affirmative consent action', () => {
    expect(evaluateFaceCheckConsent({
      accepted: false,
      submittedVersion: FACE_CHECK_CONSENT_VERSION,
      configuredVersion: FACE_CHECK_CONSENT_VERSION,
    })).toMatchObject({
      ok: false,
      status: 400,
      code: 'FACE_CHECK_CONSENT_REQUIRED',
    });
  });

  test('rejects missing and outdated notice versions', () => {
    for (const submittedVersion of [undefined, '', 'legacy-notice']) {
      expect(evaluateFaceCheckConsent({
        accepted: true,
        submittedVersion,
        configuredVersion: FACE_CHECK_CONSENT_VERSION,
      })).toMatchObject({
        ok: false,
        status: 409,
        code: 'FACE_CHECK_NOTICE_UPDATE_REQUIRED',
      });
    }
  });

  test('returns the approved version for persisted consent evidence', () => {
    expect(evaluateFaceCheckConsent({
      accepted: true,
      submittedVersion: FACE_CHECK_CONSENT_VERSION,
      configuredVersion: FACE_CHECK_CONSENT_VERSION,
    })).toEqual({
      ok: true,
      consentVersion: FACE_CHECK_CONSENT_VERSION,
    });
  });
});
