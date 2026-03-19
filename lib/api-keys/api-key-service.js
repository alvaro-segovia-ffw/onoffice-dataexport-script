'use strict';

const { isDatabaseConfigured } = require('../db');
const { generateApiKey, hashApiKey, normalizeApiKeyEnvironment, parseApiKey } = require('./api-key');
const { validateApiKeyScopes } = require('./api-key-scopes');
const { mapApiKeyRow } = require('./api-key-mapper');
const { normalizePartnerAccessPolicy } = require('../partners/partner-access-policy');
const {
  createApiKeyRecord,
  deleteApiKeyRecord,
  findApiKeyRecordById,
  findApiKeyRecordByIdentifier,
  findApiKeyRecordByPrefix,
  getApiKeyAggregateStats,
  listApiKeyRecords,
  reactivateApiKeyRecord,
  revokeApiKeyRecord,
  rotateApiKeyRecord,
  touchApiKeyLastUsed,
  updateApiKeyRecord,
} = require('./api-key-repository');
const { safeCompare } = require('../safe-compare');

function isApiKeyServiceConfigured() {
  return isDatabaseConfigured();
}

async function createApiKey(input) {
  const partnerId = String(input.partnerId || '').trim();
  const name = String(input.name || '').trim();
  const role = String(input.role || 'client').trim() || 'client';
  const scopes = validateApiKeyScopes(input.scopes, { required: true });
  const accessPolicy = normalizePartnerAccessPolicy(input.accessPolicy, { allowUndefined: true });

  if (!partnerId) throw new Error('partnerId is required.');
  if (!name) throw new Error('name is required.');

  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const generated = generateApiKey({ environment: input.environment });
  const row = await createApiKeyRecord({
    ownerUserId: input.ownerUserId || null,
    partnerId,
    name,
    environment: normalizeApiKeyEnvironment(input.environment),
    keyPrefix: generated.keyPrefix,
    keyHash: generated.keyHash,
    role,
    scopes,
    notes: input.notes ? String(input.notes) : null,
    accessPolicy,
    expiresAt: input.expiresAt || null,
  });

  return {
    apiKey: mapApiKeyRow(row),
    secret: generated.rawKey,
  };
}

async function listApiKeys() {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const rows = await listApiKeyRecords();
  return rows.map(mapApiKeyRow);
}

async function findApiKeyById(id) {
  const row = await findApiKeyRecordById(id);
  return mapApiKeyRow(row);
}

async function findApiKeyByIdentifier(identifier) {
  const row = await findApiKeyRecordByIdentifier(identifier);
  return mapApiKeyRow(row);
}

async function findStoredApiKeyByPrefix(keyPrefix) {
  return findApiKeyRecordByPrefix(keyPrefix);
}

function isApiKeyUsable(row, now = new Date()) {
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.is_active === false) return { ok: false, reason: 'inactive' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, reason: 'active' };
}

async function verifyApiKey(rawKey) {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const parsed = parseApiKey(rawKey);
  if (!parsed) {
    return { ok: false, reason: 'invalid_format' };
  }

  const row = await findStoredApiKeyByPrefix(parsed.keyPrefix);
  const usable = isApiKeyUsable(row);
  if (!usable.ok) {
    return { ok: false, reason: usable.reason };
  }

  const incomingHash = hashApiKey(parsed.rawKey);
  if (!safeCompare(incomingHash, row.key_hash)) {
    return { ok: false, reason: 'invalid_secret' };
  }

  await touchApiKeyLastUsed(row.id);

  return {
    ok: true,
    reason: 'active',
    apiKey: mapApiKeyRow(row),
  };
}

async function revokeApiKey(id) {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const row = await revokeApiKeyRecord(id);
  return mapApiKeyRow(row);
}

async function reactivateApiKey(id) {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const row = await reactivateApiKeyRecord(id);
  return mapApiKeyRow(row);
}

async function updateApiKey(id, input) {
  let normalizedInput = input;

  if (input.scopes !== undefined) {
    normalizedInput = {
      ...normalizedInput,
      scopes: validateApiKeyScopes(input.scopes, { required: true }),
    };
  }

  if (input.accessPolicy !== undefined) {
    normalizedInput = {
      ...normalizedInput,
      accessPolicy: normalizePartnerAccessPolicy(input.accessPolicy, { allowUndefined: true }),
    };
  }

  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const row = await updateApiKeyRecord(id, normalizedInput);
  return mapApiKeyRow(row);
}

async function rotateApiKey(id) {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const existing = await findApiKeyByIdentifier(id);
  if (!existing) return null;

  const generated = generateApiKey({ environment: existing.environment });
  const rotated = await rotateApiKeyRecord(id, {
    keyPrefix: generated.keyPrefix,
    keyHash: generated.keyHash,
  });
  if (!rotated) return null;

  return {
    previousApiKeyId: rotated.previous.key_prefix || id,
    apiKey: mapApiKeyRow(rotated.current),
    secret: generated.rawKey,
  };
}

async function deleteApiKey(id) {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const row = await deleteApiKeyRecord(id);
  return mapApiKeyRow(row);
}

async function getApiKeyStats() {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const { keyStats, auditStats } = await getApiKeyAggregateStats();

  return {
    totalKeys: keyStats.total_keys ?? 0,
    activeKeys: keyStats.active_keys ?? 0,
    revokedKeys: keyStats.revoked_keys ?? 0,
    expiredKeys: keyStats.expired_keys ?? 0,
    lastKeyUseAt: keyStats.last_key_use_at ? new Date(keyStats.last_key_use_at).toISOString() : null,
    apiKeyUsed24h: auditStats.api_key_used_24h ?? 0,
    apiKeyAuthFailed24h: auditStats.api_key_auth_failed_24h ?? 0,
  };
}

module.exports = {
  createApiKey,
  deleteApiKey,
  findApiKeyByIdentifier,
  findApiKeyById,
  getApiKeyStats,
  isApiKeyServiceConfigured,
  isApiKeyUsable,
  listApiKeys,
  reactivateApiKey,
  revokeApiKey,
  rotateApiKey,
  updateApiKey,
  verifyApiKey,
};
