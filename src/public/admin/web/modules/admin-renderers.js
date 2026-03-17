import { els } from './admin-elements.js';
import {
  ensureSelectedApiKey,
  findSelectedApiKey,
  getApiKeys,
  getSelectedApiKeyId,
  setApiKeys,
} from './admin-state.js';
import { appendTextElement, clearChildren, setStatus } from './dom-utils.js';

export function renderSession(user) {
  if (!user) {
    els.sessionSummary.textContent = 'No active session.';
    return;
  }

  const roles = Array.isArray(user.roles) && user.roles.length ? user.roles.join(', ') : 'no roles';
  els.sessionSummary.textContent = `${user.email} (${roles})`;
}

export function renderStats(stats) {
  const items = [
    ['Total', stats.totalKeys],
    ['Active', stats.activeKeys],
    ['Revoked', stats.revokedKeys],
    ['Expired', stats.expiredKeys],
    ['Used 24h', stats.apiKeyUsed24h],
    ['Auth Failed 24h', stats.apiKeyAuthFailed24h],
  ];

  clearChildren(els.statsGrid);
  for (const [label, value] of items) {
    const stat = document.createElement('div');
    stat.className = 'stat';
    appendTextElement(stat, 'span', label);
    appendTextElement(stat, 'strong', String(value ?? '-'));
    els.statsGrid.appendChild(stat);
  }
}

function statusBadge(apiKey) {
  const badge = document.createElement('span');
  badge.className = 'badge badge-status';

  if (!apiKey.isActive) {
    badge.classList.add('text-bg-danger');
    badge.textContent = 'revoked';
    return badge;
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= Date.now()) {
    badge.classList.add('text-bg-warning');
    badge.textContent = 'expired';
    return badge;
  }

  badge.classList.add('text-bg-success');
  badge.textContent = 'active';
  return badge;
}

function buildKeyActionButton(action, id, label, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.action = action;
  button.dataset.id = id;
  button.textContent = label;
  return button;
}

export function renderKeyActionButtons(apiKey) {
  const actions = document.createDocumentFragment();
  actions.appendChild(
    buildKeyActionButton('rotate', apiKey.publicId, 'Rotate', 'btn btn-sm btn-outline-secondary')
  );

  if (apiKey.isActive) {
    actions.appendChild(
      buildKeyActionButton('revoke', apiKey.publicId, 'Revoke', 'btn btn-sm btn-outline-danger danger')
    );
  } else {
    actions.appendChild(
      buildKeyActionButton(
        'reactivate',
        apiKey.publicId,
        'Reactivate',
        'btn btn-sm btn-outline-success ghost'
      )
    );
  }

  return actions;
}

export function renderKeyDetail(apiKey) {
  clearChildren(els.keyDetailCard);

  if (!apiKey) {
    els.keyDetailActions.hidden = true;
    els.keyDetailForm.hidden = true;
    els.keyDetailForm.dataset.keyId = '';
    clearChildren(els.keyDetailActions);
    appendTextElement(els.keyDetailCard, 'p', 'Select an API key from the directory.', 'empty mb-0');
    return;
  }

  const detailItems = [
    ['Partner', apiKey.partnerId || '-'],
    ['Name', apiKey.name || '-'],
    ['Public ID', apiKey.publicId || '-'],
    ['Prefix', apiKey.keyPrefix || '-'],
    ['Role', apiKey.role || '-'],
    ['Scopes', Array.isArray(apiKey.scopes) && apiKey.scopes.length ? apiKey.scopes.join(', ') : '-'],
    ['Status', apiKey.isActive ? 'active' : 'revoked'],
    ['Last used', apiKey.lastUsedAt || '-'],
    ['Expires at', apiKey.expiresAt || '-'],
    ['Created at', apiKey.createdAt || '-'],
  ];

  for (const [label, value] of detailItems) {
    const row = document.createElement('div');
    row.className = 'detail-row';
    appendTextElement(row, 'span', label, 'detail-label');
    appendTextElement(row, 'strong', value, 'detail-value');
    els.keyDetailCard.appendChild(row);
  }

  clearChildren(els.keyDetailActions);
  els.keyDetailActions.hidden = false;
  els.keyDetailForm.hidden = false;
  els.keyDetailForm.dataset.keyId = apiKey.publicId || '';
  els.keyDetailActions.appendChild(renderKeyActionButtons(apiKey));

  els.keyDetailName.value = apiKey.name || '';
  els.keyDetailScopes.value = Array.isArray(apiKey.scopes) ? apiKey.scopes.join(', ') : '';
  els.keyDetailNotes.value = apiKey.notes || '';
  els.keyDetailExpiresAt.value = apiKey.expiresAt ? String(apiKey.expiresAt).slice(0, 16) : '';
  els.keyDetailAccessFields.value = Array.isArray(apiKey.accessPolicy?.apartments?.fields)
    ? apiKey.accessPolicy.apartments.fields.join(', ')
    : '';
  setStatus(els.keyDetailStatus, apiKey.isActive ? 'active' : 'revoked', apiKey.isActive);
}

export function renderApiKeys(apiKeys) {
  setApiKeys(apiKeys);
  ensureSelectedApiKey();

  clearChildren(els.keysTable);

  if (!getApiKeys().length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty';
    cell.textContent = 'No API keys found.';
    row.appendChild(cell);
    els.keysTable.appendChild(row);
    renderKeyDetail(null);
    return;
  }

  for (const apiKey of getApiKeys()) {
    const row = document.createElement('tr');
    row.dataset.keyId = apiKey.publicId;
    row.classList.toggle('selected', apiKey.publicId === getSelectedApiKeyId());

    appendTextElement(row, 'td', apiKey.partnerId || '-');
    appendTextElement(row, 'td', apiKey.name || '-');

    const keyPrefixCell = document.createElement('td');
    appendTextElement(keyPrefixCell, 'code', apiKey.keyPrefix || '-');
    row.appendChild(keyPrefixCell);

    const statusCell = document.createElement('td');
    statusCell.appendChild(statusBadge(apiKey));
    row.appendChild(statusCell);

    appendTextElement(row, 'td', apiKey.lastUsedAt || '-');

    els.keysTable.appendChild(row);
  }

  renderKeyDetail(findSelectedApiKey());
}
