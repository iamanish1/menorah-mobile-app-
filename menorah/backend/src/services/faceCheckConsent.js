const evaluateFaceCheckConsent = ({ accepted, submittedVersion, configuredVersion }) => {
  if (!accepted) {
    return {
      ok: false,
      status: 400,
      code: 'FACE_CHECK_CONSENT_REQUIRED',
      message: 'Explicit consent is required before starting the optional face check.',
    };
  }

  const normalizedVersion = String(submittedVersion || '').trim();
  if (normalizedVersion !== configuredVersion) {
    return {
      ok: false,
      status: 409,
      code: 'FACE_CHECK_NOTICE_UPDATE_REQUIRED',
      message: 'The face-check notice has changed. Update the app, review the current notice, and try again.',
    };
  }

  return { ok: true, consentVersion: normalizedVersion };
};

module.exports = { evaluateFaceCheckConsent };
