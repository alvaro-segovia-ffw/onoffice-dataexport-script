'use strict';

const { userHasAdminConsoleAccess } = require('../../../lib/admin/admin-access');
const { getUserProfile, isAuthConfigured } = require('../../../lib/auth/auth-service');
const { getCookie, serializeCookie } = require('../../../lib/cookies');
const { verifyAccessToken } = require('../../../lib/auth/jwt');
const { PublicError } = require('../errors/public-error');
const { extractBearerToken } = require('./require-auth');

const adminCookieName = 'hope_admin_session';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function extractAdminToken(req, options = {}) {
  const { allowCookie = true } = options;
  const bearer = extractBearerToken(req);
  if (bearer) return bearer;
  if (!allowCookie) return null;
  return getCookie(req, adminCookieName);
}

function clearAdminSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(adminCookieName, '', {
      httpOnly: true,
      sameSite: 'Lax',
      secure: IS_PRODUCTION,
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    })
  );
}

async function authenticateAdminOperator(req, options = {}) {
  if (!isAuthConfigured()) {
    throw new PublicError({
      statusCode: 503,
      code: 'AUTH_NOT_CONFIGURED',
      message: 'Auth is not configured.',
    });
  }

  const bearerToken = extractBearerToken(req);
  const token = bearerToken || extractAdminToken(req, options);
  if (!token) {
    throw new PublicError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: options.allowCookie === false ? 'Missing Bearer token.' : 'Missing admin session or Bearer token.',
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

  return {
    token,
    claims,
    user,
    authMethod: bearerToken ? 'bearer' : 'cookie',
  };
}

async function requireAdminOperator(req, _res, next) {
  try {
    const auth = await authenticateAdminOperator(req);
    req.adminAuth = auth;
    req.auth = auth.claims;
    return next();
  } catch (err) {
    if (!extractBearerToken(req) && getCookie(req, adminCookieName) && err instanceof PublicError && err.statusCode === 401) {
      clearAdminSessionCookie(_res);
    }
    return next(err);
  }
}

async function requireAdminBearerOperator(req, _res, next) {
  try {
    const auth = await authenticateAdminOperator(req, { allowCookie: false });
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
    if (!extractBearerToken(req) && getCookie(req, adminCookieName)) {
      clearAdminSessionCookie(res);
    }
    return res.redirect('/admin/login');
  }
}

module.exports = {
  adminCookieName,
  authenticateAdminOperator,
  clearAdminSessionCookie,
  extractAdminToken,
  requireAdminOperator,
  requireAdminPageSession,
  userHasAdminConsoleAccess,
};
