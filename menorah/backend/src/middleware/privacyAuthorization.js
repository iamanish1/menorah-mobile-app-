const {
  PRIVACY_PERMISSIONS,
  resolvePrivacyAdminGrant,
} = require('../config/privacyAdminPermissions');

const requirePrivacyPermission = (permission) => {
  if (!PRIVACY_PERMISSIONS.includes(permission)) {
    throw new Error(`Unknown privacy permission: ${permission}`);
  }
  return (req, res, next) => {
    const grant = resolvePrivacyAdminGrant({
      adminId: req.user?._id,
      env: process.env,
    });
    if (!grant.configured) {
      return res.status(503).json({
        success: false,
        code: 'PRIVACY_PERMISSION_CONFIGURATION_INVALID',
        message: 'Privacy administration is temporarily unavailable.',
      });
    }
    if (
      req.user?.role !== 'admin'
      || !grant.permissions.includes(permission)
    ) {
      return res.status(403).json({
        success: false,
        code: 'PRIVACY_PERMISSION_REQUIRED',
        message: 'This admin account is not assigned the required privacy function.',
      });
    }
    return next();
  };
};

module.exports = {
  requirePrivacyLegalHold: requirePrivacyPermission('privacy_legal_hold'),
  requirePrivacyPermission,
  requirePrivacyReader: requirePrivacyPermission('privacy_reader'),
  requirePrivacyReviewer: requirePrivacyPermission('privacy_reviewer'),
};
