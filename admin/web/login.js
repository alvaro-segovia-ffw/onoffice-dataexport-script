'use strict';

const dashboardPath = '/admin/dashboard';
const allowedRoles = new Set(['admin', 'developer']);

const els = {
  baseUrl: document.getElementById('baseUrl'),
  loginForm: document.getElementById('loginForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  loginStatus: document.getElementById('loginStatus'),
  sessionSummary: document.getElementById('sessionSummary'),
  btnClear: document.getElementById('btnClear'),
};

function setStatus(el, label, ok) {
  el.textContent = label;
  el.classList.remove('ok', 'err');
  if (ok === true) el.classList.add('ok');
  if (ok === false) el.classList.add('err');
}

function normalizedBaseUrl() {
  return (els.baseUrl.value || '').trim().replace(/\/+$/, '') || window.location.origin;
}

function setSessionSummary(text) {
  els.sessionSummary.textContent = text;
}

function hasAdminConsoleAccess(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return roles.some((role) => allowedRoles.has(role));
}

async function parseJsonResponse(res) {
  return res.json().catch(() => ({}));
}

async function fetchAdminSession() {
  const res = await fetch(`${normalizedBaseUrl()}/admin/session`, {
    credentials: 'include',
  });
  const payload = await parseJsonResponse(res);
  if (!res.ok) {
    throw new Error(payload?.message || `HTTP ${res.status}`);
  }
  return payload.user || null;
}

function redirectToDashboard() {
  window.location.href = dashboardPath;
}

async function login(event) {
  event.preventDefault();
  setStatus(els.loginStatus, 'signing in...', null);

  const email = String(els.loginEmail.value || '').trim();
  const password = String(els.loginPassword.value || '');
  if (!email || !password) {
    setStatus(els.loginStatus, 'error', false);
    setSessionSummary('Email and password are required.');
    return;
  }

  try {
    const res = await fetch(`${normalizedBaseUrl()}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    const payload = await parseJsonResponse(res);
    if (!res.ok) {
      throw new Error(payload?.message || `HTTP ${res.status}`);
    }
    if (!hasAdminConsoleAccess(payload.user)) {
      throw new Error('Only admin or developer users can access the admin console.');
    }

    setStatus(els.loginStatus, 'signed in', true);
    setSessionSummary(`${payload.user?.email || email} (${(payload.user?.roles || []).join(', ') || 'no roles'})`);
    els.loginPassword.value = '';
    redirectToDashboard();
  } catch (err) {
    setStatus(els.loginStatus, 'error', false);
    setSessionSummary(err.message);
  }
}

async function bootstrap() {
  setStatus(els.loginStatus, 'checking session...', null);
  try {
    const user = await fetchAdminSession();
    if (!hasAdminConsoleAccess(user)) {
      setStatus(els.loginStatus, 'forbidden', false);
      setSessionSummary('Only admin or developer users can access the admin console.');
      return;
    }
    setStatus(els.loginStatus, 'session ready', true);
    setSessionSummary(`${user?.email || 'User'} (${(user?.roles || []).join(', ') || 'no roles'})`);
    redirectToDashboard();
  } catch (_err) {
    setStatus(els.loginStatus, 'idle', null);
    setSessionSummary('No active session.');
  }
}

els.loginForm.addEventListener('submit', login);
els.btnClear.addEventListener('click', async () => {
  els.loginPassword.value = '';
  setStatus(els.loginStatus, 'idle', null);
  setSessionSummary('No active session.');
  await fetch(`${normalizedBaseUrl()}/admin/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {});
});

bootstrap();
