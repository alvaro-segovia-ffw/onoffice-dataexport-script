'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  API_KEY_PREFIX,
  buildApiKeyPrefix,
  generateApiKey,
  hashApiKey,
  normalizeApiKeyEnvironment,
  parseApiKey,
} = require('../lib/api-key');
const { API_KEY_SCOPES, SUPPORTED_API_KEY_SCOPES, isApiKeyScopeValidationError } = require('../lib/api-key-scopes');
const { createApiKey, isApiKeyUsable, mapApiKeyRow, updateApiKey } = require('../lib/api-key-service');

test('generateApiKey creates parseable live key by default', () => {
  const generated = generateApiKey();
  const parsed = parseApiKey(generated.rawKey);

  assert.equal(generated.rawKey.startsWith(`${API_KEY_PREFIX}_live_`), true);
  assert.equal(parsed.keyPrefix, generated.keyPrefix);
  assert.equal(parsed.environment, 'live');
  assert.equal(generated.keyHash, hashApiKey(generated.rawKey));
});

test('normalizeApiKeyEnvironment limits values to supported environments', () => {
  assert.equal(normalizeApiKeyEnvironment('test'), 'test');
  assert.equal(normalizeApiKeyEnvironment('live'), 'live');
  assert.equal(normalizeApiKeyEnvironment('unknown'), 'live');
});

test('buildApiKeyPrefix uses consistent format', () => {
  assert.equal(buildApiKeyPrefix('test', 'a1b2c3d4e5f6'), 'hop_test_a1b2c3d4e5f6');
});

test('parseApiKey rejects invalid formats', () => {
  assert.equal(parseApiKey(''), null);
  assert.equal(parseApiKey('hop_live_short_bad'), null);
  assert.equal(parseApiKey('Bearer something'), null);
});

test('isApiKeyUsable rejects revoked, inactive and expired keys', () => {
  const now = new Date('2026-03-12T12:00:00.000Z');

  assert.deepEqual(isApiKeyUsable(null, now), { ok: false, reason: 'not_found' });
  assert.deepEqual(isApiKeyUsable({ is_active: false }, now), { ok: false, reason: 'inactive' });
  assert.deepEqual(isApiKeyUsable({ is_active: true, revoked_at: '2026-03-11T00:00:00.000Z' }, now), {
    ok: false,
    reason: 'revoked',
  });
  assert.deepEqual(
    isApiKeyUsable({ is_active: true, revoked_at: null, expires_at: '2026-03-10T00:00:00.000Z' }, now),
    { ok: false, reason: 'expired' }
  );
  assert.deepEqual(
    isApiKeyUsable({ is_active: true, revoked_at: null, expires_at: '2026-03-13T00:00:00.000Z' }, now),
    { ok: true, reason: 'active' }
  );
});

test('mapApiKeyRow normalizes database fields to API contract', () => {
  const mapped = mapApiKeyRow({
    id: 'k1',
    owner_user_id: 'u1',
    partner_id: 'partner-a',
    name: 'Partner A',
    environment: 'live',
    key_prefix: 'hop_live_abc123def456',
    role: 'client',
    scopes: ['apartments:read'],
    notes: 'note',
    is_active: true,
    last_used_at: '2026-03-12T10:00:00.000Z',
    expires_at: null,
    revoked_at: null,
    created_at: '2026-03-11T10:00:00.000Z',
  });

  assert.equal(mapped.partnerId, 'partner-a');
  assert.equal(mapped.publicId, 'hop_live_abc123def456');
  assert.equal(mapped.keyPrefix, 'hop_live_abc123def456');
  assert.equal(mapped.role, 'client');
  assert.deepEqual(mapped.scopes, ['apartments:read']);
});

test('supported API key scopes are centrally defined', () => {
  assert.deepEqual(SUPPORTED_API_KEY_SCOPES, [API_KEY_SCOPES.APARTMENTS_READ]);
});

test('createApiKey requires explicit valid scopes', async () => {
  await assert.rejects(
    createApiKey({
      partnerId: 'partner-a',
      name: 'Partner A',
      scopes: [],
    }),
    (err) => {
      assert.equal(isApiKeyScopeValidationError(err), true);
      assert.equal(err.message, 'At least one API key scope is required.');
      return true;
    }
  );

  await assert.rejects(
    createApiKey({
      partnerId: 'partner-a',
      name: 'Partner A',
      scopes: ['unknown:scope'],
    }),
    (err) => {
      assert.equal(isApiKeyScopeValidationError(err), true);
      assert.equal(err.message, 'Unsupported API key scopes: unknown:scope.');
      return true;
    }
  );
});

test('updateApiKey validates provided scopes against the supported allowlist', async () => {
  await assert.rejects(
    updateApiKey('hop_live_abc123def456', {
      scopes: [],
    }),
    (err) => {
      assert.equal(isApiKeyScopeValidationError(err), true);
      assert.equal(err.message, 'At least one API key scope is required.');
      return true;
    }
  );

  await assert.rejects(
    updateApiKey('hop_live_abc123def456', {
      scopes: ['apartments:read', 'unknown:scope'],
    }),
    (err) => {
      assert.equal(isApiKeyScopeValidationError(err), true);
      assert.equal(err.message, 'Unsupported API key scopes: unknown:scope.');
      return true;
    }
  );
});
