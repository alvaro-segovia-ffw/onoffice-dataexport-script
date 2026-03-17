'use strict';

const { writeAuditLog } = require('../../../lib/audit-service');

function getApiKeyScopes(req) {
  if (Array.isArray(req.apiKey?.scopes)) return req.apiKey.scopes;
  if (Array.isArray(req.authActor?.scopes)) return req.authActor.scopes;
  return [];
}

function hasRequiredScope(req, requiredScope) {
  return getApiKeyScopes(req).includes(requiredScope);
}

function buildScopeAuditEntry(req, requiredScope) {
  const apiKey = req.apiKey || {};
  const scopes = getApiKeyScopes(req);

  return {
    actorApiKeyId: apiKey.id || req.authActor?.id || null,
    action: 'api_key_scope_denied',
    resourceType: 'api_key',
    resourceId: apiKey.id || req.authActor?.id || null,
    ip: req.ip,
    userAgent: typeof req.header === 'function' ? req.header('user-agent') : null,
    metadata: {
      partnerId: apiKey.partnerId || req.authActor?.partnerId || null,
      keyPrefix: apiKey.keyPrefix || null,
      requiredScope,
      scopes,
      enforced: true,
      method: req.method || null,
      route: req.originalUrl || req.url || null,
    },
  };
}

function requireApiKeyScope(requiredScope, options = {}) {
  const auditLogWriter = options.auditLogWriter || writeAuditLog;

  return async function requireApiKeyScopeMiddleware(req, res, next) {
    if (!req.apiKey && !req.authActor) {
      return res.status(500).json({
        error: 'ApiKeyScopeMiddlewareMisconfigured',
        message: 'API key scope middleware requires requireApiKey to run first.',
      });
    }

    if (hasRequiredScope(req, requiredScope)) return next();

    try {
      await auditLogWriter(buildScopeAuditEntry(req, requiredScope));
    } catch (_err) {
      // Scope enforcement should not fail open or break requests because audit persistence failed.
    }

    return res.status(403).json({
      error: 'Forbidden',
      message: `Missing required API key scope: ${requiredScope}.`,
    });
  };
}

module.exports = {
  requireApiKeyScope,
  _test: {
    buildScopeAuditEntry,
    getApiKeyScopes,
    hasRequiredScope,
  },
};
