const {
  ADMIN_PERMISSIONS,
  resolveAdminRoleGrant,
} = require('../config/adminPermissions');
const { recordSecurityEvent } = require('../utils/securityAudit');

const recordAdminAuthorizationDenial = (req, res, {
  permission = null,
  reason,
  role = null,
  statusCode,
}) => {
  res.locals.securityAuthorizationLogged = true;
  try {
    recordSecurityEvent('admin_permission_denied', {
      req,
      user: req.user,
      outcome: 'failure',
      statusCode,
      details: {
        reason,
        ...(permission ? { permission } : {}),
        ...(role ? { operationalRole: role } : {}),
      },
    });
  } catch (error) {
    console.error(
      'Admin authorization audit error:',
      error?.code || error?.name || 'ADMIN_AUTHORIZATION_AUDIT_FAILED'
    );
  }
};

const resolveRequestAdminAccess = (req) => {
  const grant = resolveAdminRoleGrant({
    adminId: req.user?._id,
    env: process.env,
  });
  req.adminAccess = Object.freeze({
    configured: grant.configured,
    role: grant.role,
    permissions: grant.permissions,
  });
  return req.adminAccess;
};

const sendConfigurationFailure = (req, res, permission = null) => {
  recordAdminAuthorizationDenial(req, res, {
    permission,
    reason: 'admin_role_configuration_invalid',
    statusCode: 503,
  });
  return res.status(503).json({
    success: false,
    code: 'ADMIN_ROLE_CONFIGURATION_INVALID',
    message: 'Administration is temporarily unavailable.',
  });
};

const sendAssignmentFailure = (req, res, {
  permission = null,
  role = null,
} = {}) => {
  recordAdminAuthorizationDenial(req, res, {
    permission,
    reason: role ? 'admin_permission_required' : 'admin_role_assignment_required',
    role,
    statusCode: 403,
  });
  return res.status(403).json({
    success: false,
    code: role ? 'ADMIN_PERMISSION_REQUIRED' : 'ADMIN_ROLE_ASSIGNMENT_REQUIRED',
    message: role
      ? 'This admin account is not assigned the required function.'
      : 'This admin account has no operational role assignment.',
  });
};

const requireAssignedAdminRole = (req, res, next) => {
  const access = resolveRequestAdminAccess(req);
  if (!access.configured) return sendConfigurationFailure(req, res);
  if (req.user?.role !== 'admin' || !access.role) {
    return sendAssignmentFailure(req, res);
  }
  return next();
};
requireAssignedAdminRole.requiresAssignedAdminRole = true;

const requireAdminPermission = (permission) => {
  if (!ADMIN_PERMISSIONS.includes(permission)) {
    throw new Error(`Unknown admin permission: ${permission}`);
  }

  const middleware = (req, res, next) => {
    const access = resolveRequestAdminAccess(req);
    if (!access.configured) {
      return sendConfigurationFailure(req, res, permission);
    }
    if (req.user?.role !== 'admin' || !access.role) {
      return sendAssignmentFailure(req, res, { permission });
    }
    if (!access.permissions.includes(permission)) {
      return sendAssignmentFailure(req, res, {
        permission,
        role: access.role,
      });
    }
    return next();
  };
  middleware.requiredAdminPermission = permission;
  return middleware;
};

const hasAdminPermission = (req, permission) => (
  ADMIN_PERMISSIONS.includes(permission)
  && (
    req.adminAccess?.permissions
    || resolveRequestAdminAccess(req).permissions
  ).includes(permission)
);

module.exports = {
  hasAdminPermission,
  requireAdminPermission,
  requireAssignedAdminRole,
  resolveRequestAdminAccess,
};
