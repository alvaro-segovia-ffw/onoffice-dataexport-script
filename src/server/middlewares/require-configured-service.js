'use strict';

const { isApiKeyServiceConfigured } = require('../../../lib/api-keys/api-key-service');
const { isAuthConfigured } = require('../../../lib/auth/auth-service');
const { PublicError } = require('../errors/public-error');

function buildConfiguredServiceMiddleware(isConfigured, errorConfig) {
  return function requireConfiguredService(_req, _res, next) {
    if (!isConfigured()) {
      return next(new PublicError(errorConfig));
    }

    return next();
  };
}

const requireConfiguredAuth = buildConfiguredServiceMiddleware(isAuthConfigured, {
  statusCode: 503,
  code: 'AUTH_NOT_CONFIGURED',
  message: 'Auth requires DATABASE_URL and JWT_ACCESS_SECRET.',
});

const requireConfiguredApiKeyService = buildConfiguredServiceMiddleware(isApiKeyServiceConfigured, {
  statusCode: 503,
  code: 'API_KEY_SERVICE_NOT_CONFIGURED',
  message: 'API key service requires DATABASE_URL.',
});

const requireConfiguredAuditService = buildConfiguredServiceMiddleware(isApiKeyServiceConfigured, {
  statusCode: 503,
  code: 'AUDIT_SERVICE_NOT_CONFIGURED',
  message: 'Audit service requires DATABASE_URL.',
});

module.exports = {
  buildConfiguredServiceMiddleware,
  requireConfiguredApiKeyService,
  requireConfiguredAuditService,
  requireConfiguredAuth,
};
