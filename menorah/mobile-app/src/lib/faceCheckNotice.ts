export const FACE_CHECK_CONSENT_VERSION = 'ordinary-face-check-v1-2026-07-22';
export const FACE_CHECK_RETENTION_DAYS = 365;
export const FACE_CHECK_PRIVACY_EMAIL = 'privacy@menorah.me';
export const MENORAH_PRIVACY_POLICY_URL = 'https://menorah.me/privacy-policy';
export const LUXAND_PRIVACY_POLICY_URL = 'https://www.luxand.com/privacy.php';

export const FACE_CHECK_NOTICE_SECTIONS = [
  {
    title: 'Your choice',
    body: 'This face check is optional. You may skip it and continue using Menorah Health.',
  },
  {
    title: 'What we collect',
    body: 'If you proceed, Menorah Health collects one selfie and records whether a face was detected, the number of faces detected, a confidence score, verification status, submission time, consent evidence, and basic image-file metadata.',
  },
  {
    title: 'Why we collect it',
    body: 'We use this information only for an account trust and safety check. It does not verify a government-issued identity document and is not used for clinical, treatment, employment, advertising, or payment decisions.',
  },
  {
    title: 'How the check works',
    body: 'Your selfie is sent to Luxand, Inc., a facial-analysis provider in the United States. Luxand analyzes the image and may generate facial geometry or other biometric information. If the automated check cannot confidently detect exactly one face, authorized Menorah Health staff may review the result.',
  },
  {
    title: 'Storage and retention',
    body: `Menorah Health does not permanently store the selfie in its application database. We retain the check result, consent record, timestamps, technical metadata, and review history for up to ${FACE_CHECK_RETENTION_DAYS} days, unless law, a legal hold, fraud investigation, or an unresolved security matter requires longer retention. Luxand states that face templates may be retained for one year from the last relevant API activity by default, with shorter periods configurable by customers.`,
  },
  {
    title: 'Sharing and use',
    body: 'We do not sell the selfie, facial information, or check result, and we do not use them for advertising or marketing. They are shared only with Luxand and its contracted infrastructure providers as needed to perform the check, or where disclosure is required by law.',
  },
  {
    title: 'Your rights',
    body: `You may withdraw consent or request access, correction, or deletion by contacting ${FACE_CHECK_PRIVACY_EMAIL} or using the account-deletion controls in Settings. Withdrawal does not invalidate processing already completed, and some information may be retained where required by law or an active legal hold.`,
  },
] as const;

export const FACE_CHECK_CONSENT_TEXT =
  'I have read the Optional Face Check Notice and explicitly consent to Menorah Health and Luxand processing my selfie and derived facial information for this optional check.';
