'use strict';

const { getUserProfile, isAuthConfigured } = require('../lib/auth-service');
const { getCookie } = require('../lib/cookies');
const { verifyAccessToken } = require('../lib/jwt');
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
    const err = new Error('Auth is not configured.');
    err.statusCode = 503;
    err.errorCode = 'AuthNotConfigured';
    throw err;
  }

  const token = extractAdminToken(req);
  if (!token) {
    const err = new Error('Missing admin session or Bearer token.');
    err.statusCode = 401;
    err.errorCode = 'Unauthorized';
    throw err;
  }

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch (err) {
    const authErr = new Error(err.message || 'Invalid access token.');
    authErr.statusCode = 401;
    authErr.errorCode = 'Unauthorized';
    throw authErr;
  }

  const user = await getUserProfile(claims.sub);
  if (!user || user.status !== 'active') {
    const err = new Error('User not found or inactive.');
    err.statusCode = 401;
    err.errorCode = 'Unauthorized';
    throw err;
  }

  if (!userHasAdminConsoleAccess(user)) {
    const err = new Error('Admin console access requires admin or developer role.');
    err.statusCode = 403;
    err.errorCode = 'Forbidden';
    throw err;
  }

  return { token, claims, user };
}

async function requireAdminOperator(req, res, next) {
  try {
    const auth = await authenticateAdminOperator(req);
    req.adminAuth = auth;
    req.auth = auth.claims;
    return next();
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      error: err.errorCode || 'AdminAuthFailed',
      message: err.message || 'Unknown error',
    });
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
  requireAdminOperator,
  requireAdminPageSession,
  userHasAdminConsoleAccess,
};
