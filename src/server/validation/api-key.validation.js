'use strict';

const { validateApiKeyScopes, isApiKeyScopeValidationError } = require('../../../lib/api-key-scopes');
const {
  badRequest,
  ensureBodyObject,
  normalizeOptionalBoolean,
  normalizeOptionalString,
  normalizeRequiredString,
} = require('./validation-utils');

function validateScopes(input) {
  try {
    return validateApiKeyScopes(input, { required: true });
  } catch (err) {
    if (isApiKeyScopeValidationError(err)) {
      throw badRequest('Invalid API key scopes.', 'INVALID_SCOPES');
    }
    throw err;
  }
}

function validateApiKeyIdentifierParam(params) {
  return normalizeRequiredString(params?.id, {
    fieldName: 'id',
    message: 'API key id is required.',
  });
}

function validateCreateApiKeyInput(body) {
  const input = ensureBodyObject(body);

  return {
    partnerId: normalizeRequiredString(input.partnerId, {
      fieldName: 'partnerId',
      message: 'partnerId and name are required.',
    }),
    name: normalizeRequiredString(input.name, {
      fieldName: 'name',
      message: 'partnerId and name are required.',
    }),
    environment: normalizeOptionalString(input.environment, {
      fieldName: 'environment',
      emptyToUndefined: true,
    }),
    role: normalizeOptionalString(input.role, {
      fieldName: 'role',
      emptyToUndefined: true,
    }),
    scopes: validateScopes(input.scopes),
    notes: normalizeOptionalString(input.notes, {
      fieldName: 'notes',
      allowNull: true,
      emptyToNull: true,
    }),
    expiresAt: normalizeOptionalString(input.expiresAt, {
      fieldName: 'expiresAt',
      allowNull: true,
      emptyToNull: true,
    }),
  };
}

function validateUpdateApiKeyInput(body) {
  const input = ensureBodyObject(body);

  return {
    name: normalizeOptionalString(input.name, {
      fieldName: 'name',
    }),
    role: normalizeOptionalString(input.role, {
      fieldName: 'role',
      emptyToUndefined: true,
    }),
    scopes: input.scopes === undefined ? undefined : validateScopes(input.scopes),
    notes: normalizeOptionalString(input.notes, {
      fieldName: 'notes',
      allowNull: true,
      emptyToNull: true,
    }),
    expiresAt: normalizeOptionalString(input.expiresAt, {
      fieldName: 'expiresAt',
      allowNull: true,
      emptyToNull: true,
    }),
    isActive: normalizeOptionalBoolean(input.isActive, 'isActive'),
  };
}

module.exports = {
  validateApiKeyIdentifierParam,
  validateCreateApiKeyInput,
  validateUpdateApiKeyInput,
};
