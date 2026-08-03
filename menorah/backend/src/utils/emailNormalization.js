/**
 * Normalise an email address without provider-specific rewriting.
 *
 * Gmail dot and plus-address semantics are not universal (and can differ for
 * managed Google Workspace domains), so authentication must use the exact
 * mailbox identity after only trimming and lower-casing it.
 */
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

// validator.js mutates the supplied options object while applying defaults, so
// this intentionally remains mutable despite being treated as a constant.
const emailNormalizationOptions = {
  gmail_remove_dots: false,
  gmail_remove_subaddress: false,
  outlookdotcom_remove_subaddress: false,
  yahoo_remove_subaddress: false,
  icloud_remove_subaddress: false,
};

module.exports = {
  normalizeEmail,
  emailNormalizationOptions,
};
