'use strict';

const crypto = require('crypto');

const API_KEY_PREFIX = 'hop';
const API_KEY_ENVIRONMENTS = new Set(['live', 'test']);

function normalizeApiKeyEnvironment(value) {
  const normalized = String(value || 'live').trim().toLowerCase();
  return API_KEY_ENVIRONMENTS.has(normalized) ? normalized : 'live';
}

function generateApiKeyIdPart() {
  return crypto.randomBytes(6).toString('hex');
}

function generateApiKeySecret() {
  return crypto.randomBytes(24).toString('base64url');
}

function buildApiKeyPrefix(environment, idPart) {
  return `${API_KEY_PREFIX}_${normalizeApiKeyEnvironment(environment)}_${idPart}`;
}

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey), 'utf8').digest('hex');
}

function parseApiKey(rawKey) {
  const value = String(rawKey || '').trim();
  const match = value.match(/^hop_(live|test)_([a-f0-9]{12})_([A-Za-z0-9_-]{16,})$/);
  if (!match) return null;

  const environment = match[1];
  const idPart = match[2];
  const secret = match[3];

  return {
    rawKey: value,
    environment,
    idPart,
    secret,
    keyPrefix: buildApiKeyPrefix(environment, idPart),
  };
}

function generateApiKey(options = {}) {
  const environment = normalizeApiKeyEnvironment(options.environment);
  const idPart = generateApiKeyIdPart();
  const secret = generateApiKeySecret();
  const keyPrefix = buildApiKeyPrefix(environment, idPart);
  const rawKey = `${keyPrefix}_${secret}`;

  return {
    rawKey,
    keyPrefix,
    environment,
    idPart,
    keyHash: hashApiKey(rawKey),
  };
}

module.exports = {
  API_KEY_PREFIX,
  buildApiKeyPrefix,
  generateApiKey,
  hashApiKey,
  normalizeApiKeyEnvironment,
  parseApiKey,
};
