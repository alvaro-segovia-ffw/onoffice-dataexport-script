'use strict';

const { INTERNAL_PERMISSIONS } = require('../authz/internal-permissions');
const { authenticateAdminOperator } = require('./require-admin-operator');
const { requirePermission } = require('./require-permission');
const { requireAuth } = require('./require-auth');

const DOCS_REQUIRED_PERMISSION = INTERNAL_PERMISSIONS.DOCS_READ_INTERNAL;

async function requireDocsAccess(req, res, next) {
  const requireDocsPermission = requirePermission(DOCS_REQUIRED_PERMISSION);
  try {
    const auth = await authenticateAdminOperator(req);
    req.adminAuth = auth;
    req.auth = auth.claims;
    return requireDocsPermission(req, res, next);
  } catch (_adminErr) {
    return requireAuth(req, res, (authErr) => {
      if (authErr) return next(authErr);
      return requireDocsPermission(req, res, next);
    });
  }
}

module.exports = {
  DOCS_REQUIRED_PERMISSION,
  requireDocsAccess,
};
