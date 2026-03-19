'use strict';

function mapUserRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    roles: Array.isArray(row.roles) ? row.roles.filter(Boolean) : [],
  };
}

module.exports = {
  mapUserRow,
};
