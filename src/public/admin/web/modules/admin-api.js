import { loginPath } from './admin-config.js';

function normalizedBaseUrl() {
  return window.location.origin;
}

export function redirectToLogin() {
  window.location.href = loginPath;
}

async function parseJsonResponse(res) {
  return res.json().catch(() => ({}));
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${normalizedBaseUrl()}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const payload = await parseJsonResponse(res);
  if (res.status === 401 || res.status === 403) {
    throw new Error(payload?.message || 'Session expired or not authorized.');
  }
  if (!res.ok) {
    throw new Error(payload?.message || `HTTP ${res.status}`);
  }
  return payload;
}
