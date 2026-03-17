'use strict';

const { PublicError } = require('../errors/public-error');
const { getPermissionsForRoles, hasInternalPermission } = require('../authz/internal-permissions');

function getRequestRoles(req) {
  if (Array.isArray(req.adminAuth?.user?.roles)) return req.adminAuth.user.roles;
  if (Array.isArray(req.auth?.roles)) return req.auth.roles;
  return [];
}

function requirePermission(permission) {
  return function requirePermissionMiddleware(req, _res, next) {
    const roles = getRequestRoles(req);
    req.internalPermissions = getPermissionsForRoles(roles);

    if (hasInternalPermission(roles, permission)) {
      return next();
    }

    return next(
      new PublicError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Insufficient permission.',
      })
    );
  };
}

module.exports = {
  getRequestRoles,
  requirePermission,
};
