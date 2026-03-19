import { apiFetch, redirectToLogin } from './admin-api.js';
import { els } from './admin-elements.js';
import {
  renderAccessFieldPreview,
  renderApiKeys,
  renderAuditLogs,
  renderCreateResult,
  renderKeyActionResult,
  renderSession,
  renderStats,
} from './admin-renderers.js';
import {
  findSelectedApiKey,
  getAuditLogs,
  getApiKeys,
  setSelectedApiKeyId,
  setSelectedAuditLogId,
} from './admin-state.js';
import { setActiveView } from './admin-view.js';
import { setStatus, writeJson } from './dom-utils.js';

let lastGeneratedCreatePartnerId = '';
const ACCESS_FIELD_PRESETS = Object.freeze({
  essentials: ['id', 'address.city', 'rent.warmRent', 'currency'],
  address: ['address.street', 'address.city'],
  pricing: ['rent.coldRent', 'rent.warmRent', 'currency'],
});

function localDateTimeValueToIso(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return normalized;
  return date.toISOString();
}

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

function normalizeAuditPartnerId(log) {
  return String(log?.metadata?.partnerId || log?.metadata?.requestedBy || '').trim();
}

function isExpiredApiKey(apiKey) {
  return Boolean(apiKey?.expiresAt && new Date(apiKey.expiresAt).getTime() <= Date.now());
}

function getActivePartnerIds() {
  return Array.from(
    new Set(
      getApiKeys()
        .filter((apiKey) => Boolean(apiKey?.isActive) && !isExpiredApiKey(apiKey))
        .map((apiKey) => String(apiKey?.partnerId || '').trim())
        .filter(Boolean)
    )
  );
}

function applyAuditPartnerFilter(logs, partnerFilter) {
  const selectedFilter = String(partnerFilter || '__active__').trim() || '__active__';
  if (selectedFilter === '__history__') return Array.isArray(logs) ? logs : [];

  if (selectedFilter && !selectedFilter.startsWith('__')) {
    return (Array.isArray(logs) ? logs : []).filter((log) => normalizeAuditPartnerId(log) === selectedFilter);
  }

  const activePartnerIds = new Set(getActivePartnerIds());
  if (!activePartnerIds.size) return [];

  return (Array.isArray(logs) ? logs : []).filter((log) => activePartnerIds.has(normalizeAuditPartnerId(log)));
}

function parseCommaSeparatedList(value) {
  return String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSelectedScopeValues(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
    .map((input) => String(input.value || '').trim())
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

function validateCreateForm() {
  const name = String(els.createName.value || '').trim();
  const partnerId = normalizePartnerId(els.createPartnerId.value);
  els.createPartnerId.value = partnerId;

  if (!name || !partnerId) {
    setStatus(els.createStatus, 'complete required fields', false);
    return false;
  }

  return true;
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
    const selectedPartnerFilter =
      filters.partnerId === undefined ? String(els.auditPartnerFilter?.value || '__active__') : String(filters.partnerId || '');
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'partnerId' && (value === '__active__' || value === '__history__')) {
        return;
      }
      if (value !== undefined && value !== null && String(value).trim()) {
        query.set(key, String(value).trim());
      }
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const payload = await apiFetch(`/audit-logs${suffix}`);
    renderAuditLogs(applyAuditPartnerFilter(payload.logs || [], selectedPartnerFilter));
    setStatus(els.auditStatus, 'loaded', true);
  } catch (err) {
    setStatus(els.auditStatus, 'error', false);
    renderAuditLogs([]);
    handleAuthError(err);
  }
}

export async function loadDashboard() {
  await Promise.all([loadStats(), loadApiKeys()]);
  await loadAuditLogs({ limit: 20, partnerId: '__active__' });
}

export async function createApiKey(event) {
  event.preventDefault();
  if (!validateCreateForm()) return;
  setStatus(els.createStatus, 'creating...', null);

  const form = new FormData(els.createForm);
  const normalizedPartnerId = normalizePartnerId(form.get('partnerId'));
  els.createPartnerId.value = normalizedPartnerId;

  const payload = {
    partnerId: normalizedPartnerId,
    name: String(form.get('name') || '').trim(),
    role: 'client',
    scopes: getSelectedScopeValues(els.createScopes),
    notes: form.get('notes') || null,
  };

  try {
    const created = await apiFetch('/api-keys', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    renderCreateResult(created);
    setStatus(els.createStatus, 'created', true);
    setSelectedApiKeyId(created.apiKey?.publicId || null);
    els.createForm.reset();
    els.createPartnerId.value = '';
    els.createName.value = '';
    const broadScope = els.createScopes?.querySelector('input[value="apartments:read"]');
    if (broadScope) broadScope.checked = true;
    resetCreatePartnerIdAutofill();
    await Promise.all([loadApiKeys(), loadStats()]);
    await loadAuditLogs({ limit: 20, partnerId: '__active__' });
    els.createOutput?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setStatus(els.createStatus, 'error', false);
    renderCreateResult({ error: err.message });
    handleAuthError(err);
  }
}

export async function handleKeyAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;
  if (!action || !id) return;

  if (
    action === 'delete' &&
    !window.confirm('Delete this API key permanently? This cannot be undone and the secret cannot be recovered.')
  ) {
    return;
  }

  const path =
    action === 'rotate'
      ? `/api-keys/${id}/rotate`
      : action === 'revoke'
        ? `/api-keys/${id}/revoke`
        : action === 'delete'
          ? `/api-keys/${id}`
          : `/api-keys/${id}/reactivate`;
  const method = action === 'delete' ? 'DELETE' : 'POST';

  try {
    const payload = await apiFetch(path, { method });
    renderKeyActionResult({ action, payload });
    if (action === 'delete') {
      setSelectedApiKeyId(null);
    } else if (payload?.apiKey?.publicId) {
      setSelectedApiKeyId(payload.apiKey.publicId);
    }
    await Promise.all([loadApiKeys(), loadStats()]);
    await loadAuditLogs({ limit: 20, partnerId: '__active__' });
    if (action === 'rotate') {
      els.keyActionOutput?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (action === 'delete') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) {
    renderKeyActionResult({ action, error: err.message });
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
    scopes: getSelectedScopeValues(els.keyDetailScopes),
    notes: String(els.keyDetailNotes.value || '').trim() || null,
    expiresAt: localDateTimeValueToIso(els.keyDetailExpiresAt.value),
    accessPolicy: buildAccessPolicyFromFields(els.keyDetailAccessFields.value),
  };

  try {
    const result = await apiFetch(`/api-keys/${selectedApiKey.publicId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setStatus(els.keyDetailStatus, 'saved', true);
    renderKeyActionResult({ action: 'update', payload: result });
    setSelectedApiKeyId(result.apiKey?.publicId || selectedApiKey.publicId);
    await Promise.all([loadApiKeys(), loadStats()]);
    await loadAuditLogs({ limit: 20, partnerId: '__active__' });
  } catch (err) {
    setStatus(els.keyDetailStatus, 'error', false);
    renderKeyActionResult({ action: 'update', error: err.message });
    handleAuthError(err);
  }
}

export function handleKeySelection(event) {
  const row = event.target.closest('tr[data-key-id]');
  if (!row) return;

  setSelectedApiKeyId(row.dataset.keyId);
  renderApiKeys(getApiKeys());
}

export function handleKeyFiltersChange() {
  renderApiKeys(getApiKeys());
}

export function handleKeyDetailReset() {
  renderApiKeys(getApiKeys());
}

export function handleKeyDetailAccessSuggestion(event) {
  const button = event.target.closest('button[data-access-field], button[data-remove-access-field]');
  if (!button) return;

  const nextField = String(button.dataset.accessField || button.dataset.removeAccessField || '').trim();
  if (!nextField) return;

  const fields = parseCommaSeparatedList(els.keyDetailAccessFields.value);
  if (fields.includes(nextField)) {
    els.keyDetailAccessFields.value = fields.filter((field) => field !== nextField).join('\n');
  } else {
    els.keyDetailAccessFields.value = [...fields, nextField].join('\n');
  }

  renderAccessFieldPreview(findSelectedApiKey());
}

export function handleKeyDetailAccessPreset(event) {
  const button = event.target.closest('button[data-access-preset]');
  if (!button) return;

  const presetName = String(button.dataset.accessPreset || '').trim();
  const presetFields = ACCESS_FIELD_PRESETS[presetName] || [];
  if (!presetFields.length) return;

  els.keyDetailAccessFields.value = presetFields.join('\n');
  renderAccessFieldPreview(findSelectedApiKey());
}

export function handleKeyDetailAccessClear() {
  els.keyDetailAccessFields.value = '';
  renderAccessFieldPreview(findSelectedApiKey());
}

export function handleKeyDetailAccessInput() {
  renderAccessFieldPreview(findSelectedApiKey());
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

export function handleAuditSelection(event) {
  const row = event.target.closest('tr[data-audit-id]');
  if (!row) return;

  setSelectedAuditLogId(row.dataset.auditId);
  renderAuditLogs(getAuditLogs());
}

export function bindCreateFormBehavior() {
  els.createName.addEventListener('input', updateCreatePartnerIdFromName);
}
