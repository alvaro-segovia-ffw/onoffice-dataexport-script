'use strict';

const { query } = require('../db');

async function findUserAuthByEmail(email) {
  const result = await query(
    `
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
    `,
    [email]
  );

  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await query(
    `
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
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function touchLastLogin(userId) {
  await query('update users set last_login_at = now(), updated_at = now() where id = $1', [userId]);
}

module.exports = {
  findUserAuthByEmail,
  findUserById,
  touchLastLogin,
};
