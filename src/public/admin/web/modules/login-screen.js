import { loginEls } from './login-elements.js';
import { bootstrapLoginScreen, handleClearSession, handleLoginSubmit } from './login-actions.js';

function bindLoginEvents() {
  loginEls.loginForm.addEventListener('submit', handleLoginSubmit);
  loginEls.btnClear.addEventListener('click', handleClearSession);
}

export function bootstrapLoginPage() {
  bindLoginEvents();
  bootstrapLoginScreen();
}
