'use strict';

const { writeAuditLog } = require('../../../lib/audit-service');
const { PublicError } = require('../errors/public-error');

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

  return async function requireApiKeyScopeMiddleware(req, _res, next) {
    if (!req.apiKey && !req.authActor) {
      return next(
        new PublicError({
          statusCode: 500,
          code: 'API_KEY_SCOPE_MIDDLEWARE_MISCONFIGURED',
          message: 'Internal server error',
        })
      );
    }

    if (hasRequiredScope(req, requiredScope)) return next();

    try {
      await auditLogWriter(buildScopeAuditEntry(req, requiredScope));
    } catch (_err) {
      // Scope enforcement should not fail open or break requests because audit persistence failed.
    }

    return next(
      new PublicError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: `Missing required API key scope: ${requiredScope}.`,
      })
    );
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
