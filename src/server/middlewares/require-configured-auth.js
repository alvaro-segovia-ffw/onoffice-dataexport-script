'use strict';

const { isAuthConfigured } = require('../../../lib/auth-service');
const { PublicError } = require('../errors/public-error');

function requireConfiguredAuth(_req, _res, next) {
  if (!isAuthConfigured()) {
    return next(
      new PublicError({
        statusCode: 503,
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Auth requires DATABASE_URL and JWT_ACCESS_SECRET.',
      })
    );
  }

  return next();
}

module.exports = { requireConfiguredAuth };
