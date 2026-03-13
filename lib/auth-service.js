'use strict';

const {
  buildRefreshTokenExpiry,
  generateRefreshToken,
  getRefreshTokenConfig,
  hashRefreshToken,
} = require('./refresh-token');
const { isDatabaseConfigured, query } = require('./db');
const { getJwtConfig, isJwtConfigured, signAccessToken } = require('./jwt');
const { verifyPassword } = require('./password');

function isAuthConfigured() {
  return isDatabaseConfigured() && isJwtConfigured();
}

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    roles: Array.isArray(row.roles) ? row.roles.filter(Boolean) : [],
  };
}

async function findUserAuthByEmail(email) {
  const sql = `
    select
      u.id,
      u.email,
      u.full_name,
      u.password_hash,
      u.status,
      u.last_login_at,
      coalesce(array_remove(array_agg(r.code), null), '{}') as roles
    from users u
    left join user_roles ur on ur.user_id = u.id
    left join roles r on r.id = ur.role_id
    where lower(u.email) = lower($1)
    group by u.id
  `;
  const result = await query(sql, [email]);
  return result.rows[0] || null;
}

async function findUserById(id) {
  const sql = `
    select
      u.id,
      u.email,
      u.full_name,
      u.status,
      u.last_login_at,
      coalesce(array_remove(array_agg(r.code), null), '{}') as roles
    from users u
    left join user_roles ur on ur.user_id = u.id
    left join roles r on r.id = ur.role_id
    where u.id = $1
    group by u.id
  `;
  const result = await query(sql, [id]);
  return result.rows[0] || null;
}

async function touchLastLogin(userId) {
  await query('update users set last_login_at = now(), updated_at = now() where id = $1', [userId]);
}

async function createRefreshToken(userId) {
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = buildRefreshTokenExpiry();

  await query(
    `
      insert into refresh_tokens (user_id, token_hash, expires_at)
      values ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt]
  );

  return {
    refreshToken,
    refreshTokenExpiresAt: expiresAt.toISOString(),
    refreshTokenTtlDays: getRefreshTokenConfig().ttlDays,
  };
}

async function findRefreshTokenRow(rawToken) {
  const tokenHash = hashRefreshToken(rawToken);
  const result = await query(
    `
      select id, user_id, token_hash, expires_at, revoked_at, created_at
      from refresh_tokens
      where token_hash = $1
      limit 1
    `,
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function revokeRefreshTokenRow(tokenId) {
  await query(
    `
      update refresh_tokens
      set revoked_at = now()
      where id = $1 and revoked_at is null
    `,
    [tokenId]
  );
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
  const user = mapUser(updatedUser || row);
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
  return row ? mapUser(row) : null;
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
