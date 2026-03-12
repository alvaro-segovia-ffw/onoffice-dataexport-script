'use strict';

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

async function loginWithPassword(email, password) {
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

  return {
    accessToken: signAccessToken({
      sub: user.id,
      email: user.email,
      roles: user.roles,
    }),
    accessTokenTtl: getJwtConfig().accessTtl,
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

module.exports = {
  getUserProfile,
  isAuthConfigured,
  loginWithPassword,
};
