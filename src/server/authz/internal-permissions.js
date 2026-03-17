'use strict';

const INTERNAL_PERMISSIONS = Object.freeze({
  DOCS_READ_INTERNAL: 'docs:read_internal',
  API_KEYS_READ: 'api_keys:read',
  API_KEYS_CREATE: 'api_keys:create',
  API_KEYS_UPDATE: 'api_keys:update',
  API_KEYS_ROTATE: 'api_keys:rotate',
  API_KEYS_REVOKE: 'api_keys:revoke',
  AUDIT_LOGS_READ: 'audit_logs:read',
});

const FULL_INTERNAL_PERMISSION_SET = Object.freeze(Object.values(INTERNAL_PERMISSIONS));

const ROLE_PERMISSIONS = Object.freeze({
  admin: FULL_INTERNAL_PERMISSION_SET,
  developer: FULL_INTERNAL_PERMISSION_SET,
  client: Object.freeze([]),
});

function getPermissionsForRoles(roles) {
  const normalizedRoles = Array.isArray(roles) ? roles : [];
  const permissions = new Set();

  for (const role of normalizedRoles) {
    const mappedPermissions = ROLE_PERMISSIONS[String(role || '').trim()] || [];
    for (const permission of mappedPermissions) {
      permissions.add(permission);
    }
  }

  return Array.from(permissions);
}

function hasInternalPermission(roles, permission) {
  return getPermissionsForRoles(roles).includes(permission);
}

module.exports = {
  FULL_INTERNAL_PERMISSION_SET,
  INTERNAL_PERMISSIONS,
  ROLE_PERMISSIONS,
  getPermissionsForRoles,
  hasInternalPermission,
};
