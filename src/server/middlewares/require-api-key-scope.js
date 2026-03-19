'use strict';

const { buildApiKeyScopeDeniedAuditEntry } = require('../audit/audit-recorder');
const { writeAuditLog } = require('../../../lib/audit/audit-service');
const { PublicError } = require('../errors/public-error');

function getApiKeyScopes(req) {
  if (Array.isArray(req.apiKey?.scopes)) return req.apiKey.scopes;
  if (Array.isArray(req.authActor?.scopes)) return req.authActor.scopes;
  return [];
}

function hasRequiredScope(req, requiredScope) {
  return getApiKeyScopes(req).includes(requiredScope);
}

function requireApiKeyScope(requiredScope, options = {}) {
  const auditLogWriter = options.auditLogWriter || writeAuditLog;
  const requiredScopes = Array.isArray(requiredScope) ? requiredScope : [requiredScope];
  const match = options.match === 'all' ? 'all' : 'any';
  const requiredScopeLabel =
    typeof options.auditRequiredScope === 'string' && options.auditRequiredScope
      ? options.auditRequiredScope
      : requiredScopes.join(match === 'all' ? ' & ' : ' | ');
  const errorMessage =
    typeof options.message === 'string' && options.message
      ? options.message
      : match === 'all'
        ? `Missing required API key scopes: ${requiredScopes.join(', ')}.`
        : `Missing required API key scope: ${requiredScopes.join(' or ')}.`;

  function matchesRequiredScopes(req) {
    return match === 'all'
      ? requiredScopes.every((scope) => hasRequiredScope(req, scope))
      : requiredScopes.some((scope) => hasRequiredScope(req, scope));
  }

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

    if (matchesRequiredScopes(req)) return next();

    try {
      await auditLogWriter(buildApiKeyScopeDeniedAuditEntry(req, requiredScopeLabel));
    } catch (_err) {
      // Scope enforcement should not fail open or break requests because audit persistence failed.
    }

    return next(
      new PublicError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: errorMessage,
      })
    );
  };
}

module.exports = {
  requireApiKeyScope,
  _test: {
    buildScopeAuditEntry: buildApiKeyScopeDeniedAuditEntry,
    getApiKeyScopes,
    hasRequiredScope,
  },
};
