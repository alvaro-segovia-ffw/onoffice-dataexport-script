'use strict';

const {
  buildRefreshTokenExpiry,
  generateRefreshToken,
  getRefreshTokenConfig,
  hashRefreshToken,
} = require('./refresh-token');
const { isDatabaseConfigured } = require('../db');
const { getJwtConfig, isJwtConfigured, signAccessToken } = require('./jwt');
const { mapUserRow } = require('./user-mapper');
const { verifyPassword } = require('./password');
const { findUserAuthByEmail, findUserById, touchLastLogin } = require('./user-repository');
const {
  createRefreshToken: persistRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshTokenById,
} = require('./refresh-token-repository');

function isAuthConfigured() {
  return isDatabaseConfigured() && isJwtConfigured();
}

async function createRefreshToken(userId) {
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = buildRefreshTokenExpiry();

  await persistRefreshToken(userId, tokenHash, expiresAt);

  return {
    refreshToken,
    refreshTokenExpiresAt: expiresAt.toISOString(),
    refreshTokenTtlDays: getRefreshTokenConfig().ttlDays,
  };
}

async function findRefreshTokenRow(rawToken) {
  const tokenHash = hashRefreshToken(rawToken);
  return findRefreshTokenByHash(tokenHash);
}

async function revokeRefreshTokenRow(tokenId) {
  await revokeRefreshTokenById(tokenId);
}

async function loginWithPassword(email, password, options = {}) {
  if (!isAuthConfigured()) {
    throw new Error('Auth is not configured. Missing DATABASE_URL or JWT_ACCESS_SECRET.');
  }

  const row = await findUserAuthByEmail(email);
  if (!row || row.status !== 'active') return null;

  const validPassword = await verifyPassword(password, row.password_hash);
  if (!validPassword) return null;

  await touchLastLogin(row.id);
  const updatedUser = await findUserById(row.id);
  const user = mapUserRow(updatedUser || row);
  const issueRefreshToken = options.issueRefreshToken !== false;
  const refresh = issueRefreshToken ? await createRefreshToken(user.id) : null;

  return {
    accessToken: signAccessToken({
      sub: user.id,
      email: user.email,
      roles: user.roles,
    }),
    accessTokenTtl: getJwtConfig().accessTtl,
    refreshToken: refresh?.refreshToken || null,
    refreshTokenExpiresAt: refresh?.refreshTokenExpiresAt || null,
    refreshTokenTtlDays: refresh?.refreshTokenTtlDays || null,
    user,
  };
}

async function getUserProfile(userId) {
  if (!isAuthConfigured()) {
    throw new Error('Auth is not configured. Missing DATABASE_URL or JWT_ACCESS_SECRET.');
  }

  const row = await findUserById(userId);
  return mapUserRow(row);
}

async function refreshUserSession(refreshToken) {
  if (!isAuthConfigured()) {
    throw new Error('Auth is not configured. Missing DATABASE_URL or JWT_ACCESS_SECRET.');
  }

  const existing = await findRefreshTokenRow(refreshToken);
  if (!existing || existing.revoked_at) return null;
  if (new Date(existing.expires_at).getTime() <= Date.now()) return null;

  const user = await getUserProfile(existing.user_id);
  if (!user || user.status !== 'active') return null;

  await revokeRefreshTokenRow(existing.id);
  const nextRefresh = await createRefreshToken(user.id);

  return {
    accessToken: signAccessToken({
      sub: user.id,
      email: user.email,
      roles: user.roles,
    }),
    accessTokenTtl: getJwtConfig().accessTtl,
    refreshToken: nextRefresh.refreshToken,
    refreshTokenExpiresAt: nextRefresh.refreshTokenExpiresAt,
    refreshTokenTtlDays: nextRefresh.refreshTokenTtlDays,
    user,
  };
}

async function revokeRefreshToken(refreshToken) {
  if (!isAuthConfigured()) {
    throw new Error('Auth is not configured. Missing DATABASE_URL or JWT_ACCESS_SECRET.');
  }

  const existing = await findRefreshTokenRow(refreshToken);
  if (!existing || existing.revoked_at) return false;
  await revokeRefreshTokenRow(existing.id);
  return true;
}

module.exports = {
  getUserProfile,
  isAuthConfigured,
  loginWithPassword,
  refreshUserSession,
  revokeRefreshToken,
};
