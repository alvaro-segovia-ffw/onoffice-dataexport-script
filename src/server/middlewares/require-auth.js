'use strict';

const { verifyAccessToken } = require('../../../lib/jwt');
const { PublicError } = require('../errors/public-error');

function extractBearerToken(req) {
  const header = String(req.header('authorization') || '');
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

function requireAuth(req, _res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return next(
      new PublicError({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Missing Bearer token.',
      })
    );
  }

  try {
    req.auth = verifyAccessToken(token);
    return next();
  } catch (_err) {
    return next(
      new PublicError({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid access token.',
      })
    );
  }
}

module.exports = {
  extractBearerToken,
  requireAuth,
};
