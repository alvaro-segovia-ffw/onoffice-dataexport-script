'use strict';

const { PublicError } = require('../errors/public-error');

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const roles = Array.isArray(req.auth?.roles) ? req.auth.roles : [];
    const allowed = allowedRoles.some((role) => roles.includes(role));

    if (!allowed) {
      return next(
        new PublicError({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Insufficient role.',
        })
      );
    }

    return next();
  };
}

module.exports = { requireRole };
