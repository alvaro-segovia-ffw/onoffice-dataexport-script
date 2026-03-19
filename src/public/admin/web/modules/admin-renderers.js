import { els } from './admin-elements.js';
import {
  ensureSelectedAuditLog,
  ensureSelectedApiKey,
  findSelectedAuditLog,
  findSelectedApiKey,
  getAuditLogs,
  getApiKeys,
  getSelectedAuditLogId,
  getSelectedApiKeyId,
  setAuditLogs,
  setApiKeys,
} from './admin-state.js';
import { appendTextElement, clearChildren, setStatus } from './dom-utils.js';

function isExpired(apiKey) {
  return Boolean(apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= Date.now());
}

function isOperationallyActive(apiKey) {
  return Boolean(apiKey?.isActive) && !isExpired(apiKey);
}

function getApiKeyLifecycleLabel(apiKey) {
  if (!apiKey.isActive) return 'revoked';
  if (isExpired(apiKey)) return 'expired';
  return 'active';
}

function formatDateTime(value) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function toLocalDateTimeInputValue(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function matchesStatusFilter(apiKey, statusFilter) {
  if (statusFilter === 'all') return true;
  return getApiKeyLifecycleLabel(apiKey) === statusFilter;
}

function matchesSearch(apiKey, rawSearch) {
  const search = String(rawSearch || '').trim().toLowerCase();
  if (!search) return true;

  return [apiKey.partnerId, apiKey.name, apiKey.keyPrefix, apiKey.publicId]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}

function getFilteredApiKeys(apiKeys) {
  const searchValue = els.keySearchInput?.value || '';
  const statusFilter = els.keyStatusFilter?.value || 'all';

  return apiKeys.filter((apiKey) => matchesStatusFilter(apiKey, statusFilter) && matchesSearch(apiKey, searchValue));
}

function getCurrentAccessFieldDraft() {
  return String(els.keyDetailAccessFields?.value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setSelectedOptions(select, values) {
  if (!select) return;

  const selectedValues = new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );

  for (const option of Array.from(select.options || [])) {
    option.selected = selectedValues.has(option.value);
  }
}

export function renderAccessFieldPreview(apiKey) {
  clearChildren(els.keyDetailAccessPreview);

  const selectedFields = els.keyDetailForm.hidden
    ? Array.isArray(apiKey?.accessPolicy?.apartments?.fields)
      ? apiKey.accessPolicy.apartments.fields
      : []
    : getCurrentAccessFieldDraft();

  els.keyDetailAccessSummary.textContent = selectedFields.length
    ? `${selectedFields.length} field${selectedFields.length === 1 ? '' : 's'} selected`
    : 'Full payload';

  if (!selectedFields.length) {
    appendTextElement(els.keyDetailAccessPreview, 'span', 'Full apartment payload.', 'helper-copy');
  } else {
    for (const field of selectedFields) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'access-field-chip';
      button.dataset.removeAccessField = field;
      button.textContent = field;
      els.keyDetailAccessPreview.appendChild(button);
    }
  }

  const suggestionButtons = document.querySelectorAll('button[data-access-field]');
  for (const button of suggestionButtons) {
    const field = String(button.dataset.accessField || '').trim();
    button.classList.toggle('active', selectedFields.includes(field));
  }

  const presetButtons = els.keyDetailAccessPresets?.querySelectorAll('button[data-access-preset]') || [];
  for (const button of presetButtons) {
    const presetName = String(button.dataset.accessPreset || '').trim();
    const presetFields =
      presetName === 'essentials'
        ? ['id', 'address.city', 'rent.warmRent', 'currency']
        : presetName === 'address'
          ? ['address.street', 'address.city']
          : presetName === 'pricing'
            ? ['rent.coldRent', 'rent.warmRent', 'currency']
            : [];
    button.classList.toggle(
      'active',
      presetFields.length > 0 &&
        presetFields.length === selectedFields.length &&
        presetFields.every((field) => selectedFields.includes(field))
    );
  }
}

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

export function renderAuditPartnerOptions(apiKeys) {
  const currentValue = els.auditPartnerFilter.value;
  const partnerIds = Array.from(
    new Set(
      (Array.isArray(apiKeys) ? apiKeys : [])
        .filter((apiKey) => isOperationallyActive(apiKey))
        .map((apiKey) => String(apiKey?.partnerId || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  clearChildren(els.auditPartnerFilter);

  const activeOption = document.createElement('option');
  activeOption.value = '__active__';
  activeOption.textContent = 'Active partners';
  els.auditPartnerFilter.appendChild(activeOption);

  for (const partnerId of partnerIds) {
    const option = document.createElement('option');
    option.value = partnerId;
    option.textContent = partnerId;
    els.auditPartnerFilter.appendChild(option);
  }

  const historyOption = document.createElement('option');
  historyOption.value = '__history__';
  historyOption.textContent = 'Full history';
  els.auditPartnerFilter.appendChild(historyOption);

  els.auditPartnerFilter.value =
    currentValue === '__history__' || currentValue === '__active__' || partnerIds.includes(currentValue)
      ? currentValue
      : '__active__';
}

function normalizeAuditPartner(log) {
  return (
    log?.metadata?.partnerId ||
    log?.metadata?.requestedBy ||
    log?.resourceId ||
    '-'
  );
}

function normalizeAuditSource(log) {
  if (log?.ip && log?.metadata?.authType) return `${log.metadata.authType} · ${log.ip}`;
  if (log?.ip) return log.ip;
  if (log?.metadata?.authType) return log.metadata.authType;
  return '-';
}

function buildAuditSummary(logs) {
  const authFailed = logs.filter((log) => log.action === 'api_key_auth_failed').length;
  const scopeDenied = logs.filter((log) => log.action === 'api_key_scope_denied').length;
  const uniquePartners = new Set(
    logs.map((log) => normalizeAuditPartner(log)).filter((value) => value && value !== '-')
  ).size;

  return {
    total: logs.length,
    authFailed,
    scopeDenied,
    uniquePartners,
  };
}

function renderAuditSummary(logs) {
  const summary = buildAuditSummary(logs);
  const items = [
    ['Total events', summary.total],
    ['Auth failed', summary.authFailed],
    ['Scope denied', summary.scopeDenied],
    ['Unique partners', summary.uniquePartners],
  ];

  clearChildren(els.auditSummary);
  for (const [label, value] of items) {
    const stat = document.createElement('div');
    stat.className = 'stat';
    appendTextElement(stat, 'span', label);
    appendTextElement(stat, 'strong', String(value ?? '-'));
    els.auditSummary.appendChild(stat);
  }

  if (!logs.length) {
    els.auditSignalText.textContent = 'Load logs to inspect partner activity and control health.';
    setStatus(els.auditSignalBadge, 'idle', null);
    return;
  }

  if (summary.authFailed > 0 || summary.scopeDenied > 0) {
    els.auditSignalText.textContent =
      summary.authFailed > 0
        ? `Attention required: ${summary.authFailed} failed authentication event${summary.authFailed === 1 ? '' : 's'} found in the current slice.`
        : `Permission pressure detected: ${summary.scopeDenied} scope denial event${summary.scopeDenied === 1 ? '' : 's'} found in the current slice.`;
    setStatus(els.auditSignalBadge, 'attention', false);
    return;
  }

  els.auditSignalText.textContent = 'No immediate warning signal in the current slice. Activity looks operationally healthy.';
  setStatus(els.auditSignalBadge, 'healthy', true);
}

function renderAuditDetail(log) {
  clearChildren(els.auditDetailCard);

  if (!log) {
    appendTextElement(els.auditDetailCard, 'p', 'Select an audit event to inspect its details.', 'empty mb-0');
    return;
  }

  const hero = document.createElement('div');
  hero.className = 'audit-hero';
  appendTextElement(hero, 'span', 'Selected Event', 'detail-label');
  appendTextElement(hero, 'h4', log.action || '-', 'key-hero-title');
  appendTextElement(hero, 'p', formatDateTime(log.createdAt), 'helper-copy mb-0');
  els.auditDetailCard.appendChild(hero);

  const grid = document.createElement('div');
  grid.className = 'key-detail-grid';
  const items = [
    ['Partner / requester', normalizeAuditPartner(log)],
    ['Source', normalizeAuditSource(log)],
    ['Resource', log.resourceType || '-'],
    ['Resource ID', log.resourceId || '-'],
    ['Actor user', log.actorUserId || '-'],
    ['Actor key', log.actorApiKeyId || '-'],
  ];

  for (const [label, value] of items) {
    const row = document.createElement('div');
    row.className = 'detail-row';
    appendTextElement(row, 'span', label, 'detail-label');
    appendTextElement(row, 'strong', value, 'detail-value');
    grid.appendChild(row);
  }
  els.auditDetailCard.appendChild(grid);

  const metadataCard = document.createElement('div');
  metadataCard.className = 'detail-row mt-3';
  appendTextElement(metadataCard, 'span', 'Metadata', 'detail-label');
  const pre = document.createElement('pre');
  pre.className = 'audit-metadata';
  pre.textContent = JSON.stringify(log.metadata || {}, null, 2);
  metadataCard.appendChild(pre);
  els.auditDetailCard.appendChild(metadataCard);
}

export function renderAuditLogs(logs) {
  setAuditLogs(logs);
  ensureSelectedAuditLog();
  clearChildren(els.auditTable);

  renderAuditSummary(getAuditLogs());

  if (!getAuditLogs().length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'empty';
    cell.textContent = 'No audit events found for the current filters.';
    row.appendChild(cell);
    els.auditTable.appendChild(row);
    renderAuditDetail(null);
    return;
  }

  for (const log of getAuditLogs()) {
    const row = document.createElement('tr');
    row.dataset.auditId = log.id;
    row.classList.toggle('selected', log.id === getSelectedAuditLogId());

    const eventCell = document.createElement('td');
    const eventWrap = document.createElement('div');
    eventWrap.className = 'key-listing';
    appendTextElement(eventWrap, 'strong', log.action || '-', 'key-listing-title');
    appendTextElement(eventWrap, 'span', log.resourceType || '-', 'key-listing-meta');
    eventCell.appendChild(eventWrap);
    row.appendChild(eventCell);

    appendTextElement(row, 'td', normalizeAuditPartner(log));
    appendTextElement(row, 'td', normalizeAuditSource(log));
    appendTextElement(row, 'td', formatDateTime(log.createdAt));

    els.auditTable.appendChild(row);
  }

  renderAuditDetail(findSelectedAuditLog());
}

function statusBadge(apiKey) {
  const badge = document.createElement('span');
  badge.className = 'badge badge-status';

  if (!apiKey.isActive) {
    badge.classList.add('text-bg-danger');
    badge.textContent = 'revoked';
    return badge;
  }

  if (isExpired(apiKey)) {
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

  actions.appendChild(
    buildKeyActionButton('delete', apiKey.publicId, 'Delete', 'btn btn-sm btn-outline-danger danger')
  );

  return actions;
}

function buildResultCardShell(tone = 'neutral') {
  const card = document.createElement('div');
  card.className = `result-card ${tone}`;
  return card;
}

function appendResultMeta(parent, items) {
  const grid = document.createElement('div');
  grid.className = 'result-meta-grid';

  for (const [label, value] of items) {
    const row = document.createElement('div');
    row.className = 'detail-row';
    appendTextElement(row, 'span', label, 'detail-label');
    appendTextElement(row, 'strong', value, 'detail-value');
    grid.appendChild(row);
  }

  parent.appendChild(grid);
}

function appendSecretBlock(parent, secret, buttonLabel = 'Copy Secret') {
  const shell = document.createElement('div');
  shell.className = 'secret-shell';

  const warning = document.createElement('div');
  warning.className = 'secret-warning';
  appendTextElement(warning, 'strong', 'Store this API secret now.');
  appendTextElement(warning, 'p', 'It is only shown once. After leaving this state you will not be able to read it again.', 'mb-0');
  shell.appendChild(warning);

  const row = document.createElement('div');
  row.className = 'secret-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.readOnly = true;
  input.value = secret || '';
  input.className = 'form-control secret-field';
  row.appendChild(input);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-admin';
  button.dataset.copyValue = secret || '';
  button.dataset.copyLabel = buttonLabel;
  button.textContent = buttonLabel;
  row.appendChild(button);
  shell.appendChild(row);

  parent.appendChild(shell);
}

export function renderCreateResult(payload) {
  clearChildren(els.createOutput);

  if (!payload || payload.error) {
    const card = buildResultCardShell('danger');
    appendTextElement(card, 'p', payload?.error || 'Unable to create the API key.', 'mb-0');
    els.createOutput.appendChild(card);
    return;
  }

  const card = buildResultCardShell('success');
  appendTextElement(card, 'p', 'API key created successfully.', 'result-title');
  appendTextElement(
    card,
    'p',
    `The credential for ${payload.apiKey?.partnerId || 'this partner'} is ready. Save the secret before you leave this screen.`,
    'helper-copy mb-0'
  );
  appendSecretBlock(card, payload.secret, 'Copy New Secret');
  const actions = document.createElement('div');
  actions.className = 'row-actions';
  const openKeyButton = document.createElement('button');
  openKeyButton.type = 'button';
  openKeyButton.className = 'btn btn-outline-admin';
  openKeyButton.dataset.openCreatedKey = 'true';
  openKeyButton.textContent = 'Open In Manage Keys';
  actions.appendChild(openKeyButton);
  card.appendChild(actions);
  appendResultMeta(card, [
    ['Partner', payload.apiKey?.partnerId || '-'],
    ['Key name', payload.apiKey?.name || '-'],
    ['Prefix', payload.apiKey?.keyPrefix || '-'],
    ['Scope', Array.isArray(payload.apiKey?.scopes) && payload.apiKey.scopes.length ? payload.apiKey.scopes.join(', ') : '-'],
  ]);
  els.createOutput.appendChild(card);
}

export function renderKeyActionResult({ action, payload, error }) {
  clearChildren(els.keyActionOutput);

  const tone = error ? 'danger' : action === 'delete' ? 'danger' : 'success';
  const card = buildResultCardShell(tone);

  if (error) {
    appendTextElement(card, 'p', error, 'mb-0');
    els.keyActionOutput.appendChild(card);
    return;
  }

  if (action === 'rotate') {
    appendTextElement(card, 'p', 'Key rotated successfully.', 'result-title');
    appendTextElement(card, 'p', 'The previous key is no longer active. Store the replacement secret now.', 'helper-copy mb-0');
    appendSecretBlock(card, payload.secret, 'Copy Replacement Secret');
    appendResultMeta(card, [
      ['Partner', payload.apiKey?.partnerId || '-'],
      ['New prefix', payload.apiKey?.keyPrefix || '-'],
      ['Previous key', payload.previousApiKeyId || '-'],
    ]);
  } else {
    const verb =
      action === 'revoke'
        ? 'revoked'
        : action === 'reactivate'
          ? 'reactivated'
          : action === 'delete'
            ? 'deleted'
            : 'updated';
    appendTextElement(card, 'p', `Key ${verb} successfully.`, 'result-title');
    appendResultMeta(card, [
      ['Partner', payload.apiKey?.partnerId || '-'],
      ['Key name', payload.apiKey?.name || '-'],
      ['Prefix', payload.apiKey?.keyPrefix || '-'],
      ['Status', action === 'delete' ? 'deleted' : getApiKeyLifecycleLabel(payload.apiKey || {})],
    ]);
  }

  els.keyActionOutput.appendChild(card);
}

export function renderKeyDetail(apiKey) {
  clearChildren(els.keyDetailCard);

  if (!apiKey) {
    els.keyDetailActions.hidden = true;
    els.keyDetailForm.hidden = true;
    els.keyDetailForm.dataset.keyId = '';
    clearChildren(els.keyDetailActions);
    appendTextElement(els.keyDetailCard, 'p', 'Select an API key from the directory.', 'empty mb-0');
    renderAccessFieldPreview(null);
    return;
  }

  const hero = document.createElement('div');
  hero.className = 'key-hero';

  const heroCopy = document.createElement('div');
  heroCopy.className = 'key-hero-copy';
  appendTextElement(heroCopy, 'span', apiKey.partnerId || '-', 'detail-label');
  appendTextElement(heroCopy, 'h4', apiKey.name || 'Unnamed key', 'key-hero-title');

  const heroMeta = document.createElement('div');
  heroMeta.className = 'key-hero-meta';
  heroMeta.appendChild(statusBadge(apiKey));
  const prefix = document.createElement('code');
  prefix.textContent = apiKey.keyPrefix || '-';
  heroMeta.appendChild(prefix);

  hero.appendChild(heroCopy);
  hero.appendChild(heroMeta);
  els.keyDetailCard.appendChild(hero);

  const detailGrid = document.createElement('div');
  detailGrid.className = 'key-detail-grid';

  const detailItems = [
    ['Last used', formatDateTime(apiKey.lastUsedAt)],
    ['Expires', formatDateTime(apiKey.expiresAt)],
    ['Created', formatDateTime(apiKey.createdAt)],
    ['Role', apiKey.role || '-'],
    ['Scopes', Array.isArray(apiKey.scopes) && apiKey.scopes.length ? apiKey.scopes.join(', ') : '-'],
    ['Public ID', apiKey.publicId || '-'],
  ];

  for (const [label, value] of detailItems) {
    const row = document.createElement('div');
    row.className = 'detail-row';
    appendTextElement(row, 'span', label, 'detail-label');
    appendTextElement(row, 'strong', value, 'detail-value');
    detailGrid.appendChild(row);
  }

  els.keyDetailCard.appendChild(detailGrid);

  clearChildren(els.keyDetailActions);
  els.keyDetailActions.hidden = false;
  els.keyDetailForm.hidden = false;
  els.keyDetailForm.dataset.keyId = apiKey.publicId || '';
  els.keyDetailActions.appendChild(renderKeyActionButtons(apiKey));

  els.keyDetailName.value = apiKey.name || '';
  setSelectedOptions(els.keyDetailScopes, Array.isArray(apiKey.scopes) ? apiKey.scopes : []);
  els.keyDetailNotes.value = apiKey.notes || '';
  els.keyDetailExpiresAt.value = toLocalDateTimeInputValue(apiKey.expiresAt);
  els.keyDetailAccessFields.value = Array.isArray(apiKey.accessPolicy?.apartments?.fields)
    ? apiKey.accessPolicy.apartments.fields.join('\n')
    : '';
  renderAccessFieldPreview(apiKey);
  setStatus(els.keyDetailStatus, getApiKeyLifecycleLabel(apiKey), apiKey.isActive && !isExpired(apiKey));
}

export function renderApiKeys(apiKeys) {
  setApiKeys(apiKeys);
  ensureSelectedApiKey();
  renderAuditPartnerOptions(getApiKeys());
  const filteredApiKeys = getFilteredApiKeys(getApiKeys());

  clearChildren(els.keysTable);

  els.keysListMeta.textContent = `${filteredApiKeys.length} of ${getApiKeys().length} keys shown`;

  if (!filteredApiKeys.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'empty';
    cell.textContent = getApiKeys().length ? 'No keys match the current filters.' : 'No API keys found.';
    row.appendChild(cell);
    els.keysTable.appendChild(row);
    renderKeyDetail(findSelectedApiKey());
    return;
  }

  for (const apiKey of filteredApiKeys) {
    const row = document.createElement('tr');
    row.dataset.keyId = apiKey.publicId;
    row.classList.toggle('selected', apiKey.publicId === getSelectedApiKeyId());

    const identityCell = document.createElement('td');
    const identityWrap = document.createElement('div');
    identityWrap.className = 'key-listing';
    appendTextElement(identityWrap, 'strong', apiKey.name || 'Unnamed key', 'key-listing-title');
    appendTextElement(identityWrap, 'span', apiKey.partnerId || '-', 'key-listing-meta');
    const keyCode = document.createElement('code');
    keyCode.textContent = apiKey.keyPrefix || '-';
    identityWrap.appendChild(keyCode);
    identityCell.appendChild(identityWrap);
    row.appendChild(identityCell);

    const statusCell = document.createElement('td');
    statusCell.appendChild(statusBadge(apiKey));
    row.appendChild(statusCell);

    appendTextElement(row, 'td', formatDateTime(apiKey.lastUsedAt));
    appendTextElement(row, 'td', formatDateTime(apiKey.expiresAt));

    els.keysTable.appendChild(row);
  }

  renderKeyDetail(findSelectedApiKey());
}
