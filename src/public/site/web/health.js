'use strict';

(function bootstrapHealthPage() {
  const els = {
    statusBadge: document.getElementById('statusBadge'),
    statusValue: document.getElementById('statusValue'),
    statusMessage: document.getElementById('statusMessage'),
    uptimeValue: document.getElementById('uptimeValue'),
    serverTimeValue: document.getElementById('serverTimeValue'),
    checkedAtValue: document.getElementById('checkedAtValue'),
    refreshHealthButton: document.getElementById('refreshHealthButton'),
  };

  function setStatusAppearance(ok, label) {
    els.statusBadge.textContent = label;
    els.statusBadge.classList.remove('is-ok', 'is-err');
    if (ok === true) els.statusBadge.classList.add('is-ok');
    if (ok === false) els.statusBadge.classList.add('is-err');
  }

  function formatUptime(seconds) {
    const total = Number(seconds || 0);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = Math.floor(total % 60);
    const parts = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes || hours) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
  }

  function formatDate(value) {
    try {
      return new Date(value).toLocaleString();
    } catch (_err) {
      return String(value || '-');
    }
  }

  async function loadHealth() {
    setStatusAppearance(null, 'Checking…');
    els.statusMessage.textContent = 'Loading current health payload.';
    if (els.refreshHealthButton) {
      els.refreshHealthButton.disabled = true;
      els.refreshHealthButton.textContent = 'Refreshing...';
    }

    try {
      const res = await fetch('/health.json', {
        headers: { Accept: 'application/json' },
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload?.message || `HTTP ${res.status}`);
      }

      const isOk = String(payload.status || '').toLowerCase() === 'ok';
      setStatusAppearance(isOk, isOk ? 'Operational' : 'Attention');
      els.statusValue.textContent = payload.status || '-';
      els.statusMessage.textContent = isOk
        ? 'The API responded normally to the health probe.'
        : 'The API reported a non-healthy status.';
      els.uptimeValue.textContent = formatUptime(payload.uptimeSec);
      els.serverTimeValue.textContent = formatDate(payload.now);
      els.checkedAtValue.textContent = formatDate(new Date().toISOString());
    } catch (err) {
      setStatusAppearance(false, 'Unavailable');
      els.statusValue.textContent = 'error';
      els.statusMessage.textContent = err.message || 'Failed to load health payload.';
      els.uptimeValue.textContent = '-';
      els.serverTimeValue.textContent = '-';
      els.checkedAtValue.textContent = formatDate(new Date().toISOString());
    } finally {
      if (els.refreshHealthButton) {
        els.refreshHealthButton.disabled = false;
        els.refreshHealthButton.textContent = 'Refresh Status';
      }
    }
  }

  if (els.refreshHealthButton) {
    els.refreshHealthButton.addEventListener('click', loadHealth);
  }

  loadHealth();
})();
