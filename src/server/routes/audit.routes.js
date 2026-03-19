'use strict';

const { Router } = require('express');

const { listAuditLogs } = require('../../../lib/audit/audit-service');
const { INTERNAL_PERMISSIONS } = require('../authz/internal-permissions');
const { requireAdminOperator } = require('../middlewares/require-admin-operator');
const { requireConfiguredAuth } = require('../middlewares/require-configured-auth');
const { requireConfiguredAuditService } = require('../middlewares/require-configured-service');
const { requirePermission } = require('../middlewares/require-permission');
const { validateAuditLogFilters } = require('../validation/audit.validation');

function buildAuditRouter({ asyncHandler }) {
  const router = Router();

  router.get(
    '/',
    requireConfiguredAuth,
    requireConfiguredAuditService,
    requireAdminOperator,
    requirePermission(INTERNAL_PERMISSIONS.AUDIT_LOGS_READ),
    asyncHandler(async (req, res) => {
      const filters = validateAuditLogFilters(req.query);
      const logs = await listAuditLogs(filters);
      return res.json({ logs });
    })
  );

  return router;
}

module.exports = { buildAuditRouter };
