import { apiFetch, redirectToLogin } from './admin-api.js';
import { els } from './admin-elements.js';
import { renderApiKeys, renderSession, renderStats } from './admin-renderers.js';
import { getApiKeys, setSelectedApiKeyId } from './admin-state.js';
import { setActiveView } from './admin-view.js';
import { setStatus, writeJson } from './dom-utils.js';

let lastGeneratedCreatePartnerId = '';

function handleAuthError(err) {
  if (/session|authorized|role/i.test(err.message)) {
    redirectToLogin();
  }
}

function normalizePartnerId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseCommaSeparatedList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAccessPolicyFromFields(value) {
  const fields = parseCommaSeparatedList(value);
  return fields.length > 0
    ? {
        apartments: {
          fields,
        },
      }
    : {};
}

function updateCreatePartnerIdFromName() {
  const normalizedFromName = normalizePartnerId(els.createName.value);
  const currentPartnerId = String(els.createPartnerId.value || '').trim();

  if (!currentPartnerId || currentPartnerId === lastGeneratedCreatePartnerId) {
    els.createPartnerId.value = normalizedFromName;
    lastGeneratedCreatePartnerId = normalizedFromName;
  }
}

function resetCreatePartnerIdAutofill() {
  lastGeneratedCreatePartnerId = '';
}

export async function fetchCurrentSession() {
  const payload = await apiFetch('/admin/session');
  renderSession(payload.user || null);
  return payload.user || null;
}

export async function loadStats() {
  setStatus(els.statsStatus, 'loading...', null);
  try {
    const payload = await apiFetch('/api-keys/stats');
    renderStats(payload.stats || {});
    setStatus(els.statsStatus, 'loaded', true);
  } catch (err) {
    setStatus(els.statsStatus, 'error', false);
    writeJson(els.keyActionOutput, { error: err.message });
    handleAuthError(err);
  }
}

export async function loadApiKeys() {
  setStatus(els.keysStatus, 'loading...', null);
  try {
    const payload = await apiFetch('/api-keys');
    renderApiKeys(payload.apiKeys || []);
    setStatus(els.keysStatus, 'loaded', true);
  } catch (err) {
    setStatus(els.keysStatus, 'error', false);
    writeJson(els.keyActionOutput, { error: err.message });
    handleAuthError(err);
  }
}

export async function loadAuditLogs(filters = {}) {
  setStatus(els.auditStatus, 'loading...', null);
  try {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim()) {
        query.set(key, String(value).trim());
      }
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const payload = await apiFetch(`/audit-logs${suffix}`);
    writeJson(els.auditOutput, payload.logs || []);
    setStatus(els.auditStatus, 'loaded', true);
  } catch (err) {
    setStatus(els.auditStatus, 'error', false);
    writeJson(els.auditOutput, { error: err.message });
    handleAuthError(err);
  }
}

export async function loadDashboard() {
  await Promise.all([loadStats(), loadApiKeys(), loadAuditLogs({ limit: 20 })]);
}

export async function createApiKey(event) {
  event.preventDefault();
  setStatus(els.createStatus, 'creating...', null);

  const form = new FormData(els.createForm);
  const normalizedPartnerId = normalizePartnerId(form.get('partnerId'));
  els.createPartnerId.value = normalizedPartnerId;

  const payload = {
    partnerId: normalizedPartnerId,
    name: String(form.get('name') || '').trim(),
    role: 'client',
    scopes: [String(form.get('scopes') || '').trim()].filter(Boolean),
    notes: form.get('notes') || null,
  };

  try {
    const created = await apiFetch('/api-keys', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    writeJson(els.createOutput, created);
    setStatus(els.createStatus, 'created', true);
    setSelectedApiKeyId(created.apiKey?.publicId || null);
    els.createForm.reset();
    els.createPartnerId.value = '';
    els.createName.value = '';
    resetCreatePartnerIdAutofill();
    setActiveView('keys');
    await Promise.all([loadApiKeys(), loadStats(), loadAuditLogs({ limit: 20 })]);
  } catch (err) {
    setStatus(els.createStatus, 'error', false);
    writeJson(els.createOutput, { error: err.message });
    handleAuthError(err);
  }
}

export async function handleKeyAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;
  if (!action || !id) return;

  const path =
    action === 'rotate'
      ? `/api-keys/${id}/rotate`
      : action === 'revoke'
        ? `/api-keys/${id}/revoke`
        : `/api-keys/${id}/reactivate`;

  try {
    const payload = await apiFetch(path, { method: 'POST' });
    writeJson(els.keyActionOutput, payload);
    if (payload?.apiKey?.publicId) {
      setSelectedApiKeyId(payload.apiKey.publicId);
    }
    await Promise.all([loadApiKeys(), loadStats(), loadAuditLogs({ limit: 20 })]);
  } catch (err) {
    writeJson(els.keyActionOutput, { error: err.message, action, id });
    handleAuthError(err);
  }
}

export async function handleKeyDetailSubmit(event) {
  event.preventDefault();
  const selectedApiKey = getApiKeys().find((apiKey) => apiKey.publicId === els.keyDetailForm.dataset.keyId);
  if (!selectedApiKey) return;

  setStatus(els.keyDetailStatus, 'saving...', null);

  const payload = {
    name: String(els.keyDetailName.value || '').trim(),
    scopes: parseCommaSeparatedList(els.keyDetailScopes.value),
    notes: String(els.keyDetailNotes.value || '').trim() || null,
    expiresAt: String(els.keyDetailExpiresAt.value || '').trim() || null,
    accessPolicy: buildAccessPolicyFromFields(els.keyDetailAccessFields.value),
  };

  try {
    const result = await apiFetch(`/api-keys/${selectedApiKey.publicId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setStatus(els.keyDetailStatus, 'saved', true);
    writeJson(els.keyActionOutput, result);
    setSelectedApiKeyId(result.apiKey?.publicId || selectedApiKey.publicId);
    await Promise.all([loadApiKeys(), loadStats(), loadAuditLogs({ limit: 20 })]);
  } catch (err) {
    setStatus(els.keyDetailStatus, 'error', false);
    writeJson(els.keyActionOutput, { error: err.message });
    handleAuthError(err);
  }
}

export function handleKeySelection(event) {
  const row = event.target.closest('tr[data-key-id]');
  if (!row) return;

  setSelectedApiKeyId(row.dataset.keyId);
  renderApiKeys(getApiKeys());
}

export function handleAuditSubmit(event) {
  event.preventDefault();
  setActiveView('audit');

  const form = new FormData(els.auditForm);
  loadAuditLogs({
    partnerId: form.get('partnerId'),
    action: form.get('action'),
    limit: form.get('limit'),
  });
}

export function bindCreateFormBehavior() {
  els.createName.addEventListener('input', updateCreatePartnerIdFromName);
}
