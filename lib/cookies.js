'use strict';

function parseCookieHeader(raw) {
  const header = String(raw || '');
  if (!header) return {};

  const cookies = {};
  const parts = header.split(';');
  for (const part of parts) {
    const [namePart, ...valueParts] = part.split('=');
    const name = String(namePart || '').trim();
    if (!name) continue;
    const value = valueParts.join('=').trim();
    cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

function getCookie(req, name) {
  const cookies = parseCookieHeader(req?.headers?.cookie || '');
  return cookies[name] || null;
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(String(value || ''))}`];

  if (options.maxAge !== undefined) segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.path) segments.push(`Path=${options.path}`);
  if (options.httpOnly) segments.push('HttpOnly');
  if (options.secure) segments.push('Secure');
  if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);
  if (options.expires instanceof Date) segments.push(`Expires=${options.expires.toUTCString()}`);

  return segments.join('; ');
}

module.exports = {
  getCookie,
  parseCookieHeader,
  serializeCookie,
};
