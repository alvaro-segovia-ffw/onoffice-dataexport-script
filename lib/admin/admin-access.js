'use strict';

const ADMIN_CONSOLE_ROLES = Object.freeze(['admin', 'developer']);
const adminConsoleRoleSet = new Set(ADMIN_CONSOLE_ROLES);

function userHasAdminConsoleAccess(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return roles.some((role) => adminConsoleRoleSet.has(role));
}

module.exports = {
  ADMIN_CONSOLE_ROLES,
  userHasAdminConsoleAccess,
};
