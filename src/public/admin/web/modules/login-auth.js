import { apiFetch } from './admin-api.js';
import { allowedAdminRoles, dashboardPath } from './admin-config.js';

function parseRoles(user) {
  return Array.isArray(user?.roles) ? user.roles : [];
}

export function hasAdminConsoleAccess(user) {
  return parseRoles(user).some((role) => allowedAdminRoles.has(role));
}

export function formatUserSummary(user, fallbackEmail = 'User') {
  const email = user?.email || fallbackEmail;
  const roles = parseRoles(user);
  return `${email} (${roles.join(', ') || 'no roles'})`;
}

export function redirectToDashboard() {
  window.location.href = dashboardPath;
}

export async function fetchAdminSession() {
  const payload = await apiFetch('/admin/session');
  return payload.user || null;
}

export async function loginWithPassword(email, password) {
  const payload = await apiFetch('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  return payload.user || null;
}

export async function logoutAdminSession() {
  return fetch(`${window.location.origin}/admin/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {});
}
