'use strict';

const { getUserProfile, isAuthConfigured } = require('../../../lib/auth-service');
const { getCookie } = require('../../../lib/cookies');
const { verifyAccessToken } = require('../../../lib/jwt');
const { PublicError } = require('../errors/public-error');
const { extractBearerToken } = require('./require-auth');

const allowedRoles = new Set(['admin', 'developer']);
const adminCookieName = 'hope_admin_session';

function userHasAdminConsoleAccess(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return roles.some((role) => allowedRoles.has(role));
}

function extractAdminToken(req) {
  const bearer = extractBearerToken(req);
  if (bearer) return bearer;
  return getCookie(req, adminCookieName);
}

async function authenticateAdminOperator(req) {
  if (!isAuthConfigured()) {
    throw new PublicError({
      statusCode: 503,
      code: 'AUTH_NOT_CONFIGURED',
      message: 'Auth is not configured.',
    });
  }

  const token = extractAdminToken(req);
  if (!token) {
    throw new PublicError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Missing admin session or Bearer token.',
    });
  }

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch (_err) {
    throw new PublicError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid access token.',
    });
  }

  const user = await getUserProfile(claims.sub);
  if (!user || user.status !== 'active') {
    throw new PublicError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'User not found or inactive.',
    });
  }

  if (!userHasAdminConsoleAccess(user)) {
    throw new PublicError({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Admin console access requires admin or developer role.',
    });
  }

  return { token, claims, user };
}

async function requireAdminOperator(req, _res, next) {
  try {
    const auth = await authenticateAdminOperator(req);
    req.adminAuth = auth;
    req.auth = auth.claims;
    return next();
  } catch (err) {
    return next(err);
  }
}

async function requireAdminPageSession(req, res, next) {
  try {
    const auth = await authenticateAdminOperator(req);
    req.adminAuth = auth;
    return next();
  } catch (_err) {
    return res.redirect('/admin/login');
  }
}

module.exports = {
  adminCookieName,
  authenticateAdminOperator,
  requireAdminOperator,
  requireAdminPageSession,
  userHasAdminConsoleAccess,
};
