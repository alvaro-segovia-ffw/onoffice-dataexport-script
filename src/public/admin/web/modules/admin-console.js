import { els } from './admin-elements.js';
import {
  bindCreateFormBehavior,
  createApiKey,
  fetchCurrentSession,
  handleAuditSubmit,
  handleCreateStepBack,
  handleCreateStepNext,
  handleKeyDetailSubmit,
  handleKeyAction,
  handleKeySelection,
  loadApiKeys,
  loadDashboard,
} from './admin-actions.js';
import { setStatus } from './dom-utils.js';
import { bindViewNavigation, setActiveView } from './admin-view.js';
import { redirectToLogin } from './admin-api.js';

function bindEvents() {
  els.btnLoad.addEventListener('click', loadDashboard);
  els.createForm.addEventListener('submit', createApiKey);
  bindCreateFormBehavior();
  els.btnCreateNext.addEventListener('click', handleCreateStepNext);
  els.btnCreateBack.addEventListener('click', handleCreateStepBack);
  els.keysTable.addEventListener('click', handleKeySelection);
  els.keyDetailForm.addEventListener('submit', handleKeyDetailSubmit);
  els.keyDetailActions.addEventListener('click', handleKeyAction);
  els.btnRefreshKeys.addEventListener('click', loadApiKeys);
  els.auditForm.addEventListener('submit', handleAuditSubmit);
  bindViewNavigation();
}

export async function bootstrapAdminConsole() {
  bindEvents();
  setStatus(els.loginStatus, 'checking session...', null);
  setActiveView('overview');

  try {
    const user = await fetchCurrentSession();
    if (!user) {
      redirectToLogin();
      return;
    }
    setStatus(els.loginStatus, 'session ready', true);
    await loadDashboard();
  } catch (_err) {
    setStatus(els.loginStatus, 'token invalid', false);
    redirectToLogin();
  }
}
