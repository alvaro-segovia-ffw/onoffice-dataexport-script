'use strict';

const API_KEY_SCOPES = Object.freeze({
  APARTMENTS_READ: 'apartments:read',
  APARTMENTS_RENTAL_READ: 'apartments:rental:read',
  APARTMENTS_SALE_READ: 'apartments:sale:read',
});

const SUPPORTED_API_KEY_SCOPES = Object.freeze(Object.values(API_KEY_SCOPES));

class ApiKeyScopeValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApiKeyScopeValidationError';
  }
}

function normalizeApiKeyScopes(input) {
  if (!Array.isArray(input)) {
    throw new ApiKeyScopeValidationError('scopes must be an array.');
  }

  return Array.from(
    new Set(
      input
        .map((scope) => String(scope || '').trim())
        .filter(Boolean)
    )
  );
}

function validateApiKeyScopes(input, options = {}) {
  const scopes = normalizeApiKeyScopes(input);

  if (options.required !== false && scopes.length === 0) {
    throw new ApiKeyScopeValidationError('At least one API key scope is required.');
  }

  const invalidScopes = scopes.filter((scope) => !SUPPORTED_API_KEY_SCOPES.includes(scope));
  if (invalidScopes.length > 0) {
    throw new ApiKeyScopeValidationError(`Unsupported API key scopes: ${invalidScopes.join(', ')}.`);
  }

  return scopes;
}

function isApiKeyScopeValidationError(err) {
  return err instanceof ApiKeyScopeValidationError;
}

module.exports = {
  API_KEY_SCOPES,
  SUPPORTED_API_KEY_SCOPES,
  ApiKeyScopeValidationError,
  isApiKeyScopeValidationError,
  normalizeApiKeyScopes,
  validateApiKeyScopes,
};
