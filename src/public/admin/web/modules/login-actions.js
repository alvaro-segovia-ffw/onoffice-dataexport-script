import { loginEls } from './login-elements.js';
import {
  fetchAdminSession,
  formatUserSummary,
  hasAdminConsoleAccess,
  loginWithPassword,
  logoutAdminSession,
  redirectToDashboard,
} from './login-auth.js';
import { setStatus } from './dom-utils.js';

export function setSessionSummary(text) {
  loginEls.sessionSummary.textContent = text;
}

export async function handleLoginSubmit(event) {
  event.preventDefault();
  setStatus(loginEls.loginStatus, 'signing in...', null);

  const email = String(loginEls.loginEmail.value || '').trim();
  const password = String(loginEls.loginPassword.value || '');
  if (!email || !password) {
    setStatus(loginEls.loginStatus, 'error', false);
    setSessionSummary('Email and password are required.');
    return;
  }

  try {
    const user = await loginWithPassword(email, password);
    if (!hasAdminConsoleAccess(user)) {
      throw new Error('Only admin or developer users can access the admin console.');
    }

    setStatus(loginEls.loginStatus, 'signed in', true);
    setSessionSummary(formatUserSummary(user, email));
    loginEls.loginPassword.value = '';
    redirectToDashboard();
  } catch (err) {
    setStatus(loginEls.loginStatus, 'error', false);
    setSessionSummary(err.message);
  }
}

export async function handleClearSession() {
  loginEls.loginPassword.value = '';
  setStatus(loginEls.loginStatus, 'idle', null);
  setSessionSummary('No active session.');
  await logoutAdminSession();
}

export async function bootstrapLoginScreen() {
  setStatus(loginEls.loginStatus, 'checking session...', null);

  try {
    const user = await fetchAdminSession();
    if (!hasAdminConsoleAccess(user)) {
      setStatus(loginEls.loginStatus, 'forbidden', false);
      setSessionSummary('Only admin or developer users can access the admin console.');
      return;
    }

    setStatus(loginEls.loginStatus, 'session ready', true);
    setSessionSummary(formatUserSummary(user));
    redirectToDashboard();
  } catch (_err) {
    setStatus(loginEls.loginStatus, 'idle', null);
    setSessionSummary('No active session.');
  }
}
