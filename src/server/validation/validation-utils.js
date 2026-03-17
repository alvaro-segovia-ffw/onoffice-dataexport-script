'use strict';

const { PublicError } = require('../errors/public-error');

function badRequest(message, code = 'BAD_REQUEST') {
  return new PublicError({
    statusCode: 400,
    code,
    message,
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureBodyObject(body) {
  if (body === undefined) return {};
  if (!isPlainObject(body)) {
    throw badRequest('Request body must be a JSON object.');
  }
  return body;
}

function normalizeRequiredString(value, options = {}) {
  const {
    fieldName = 'value',
    message = `${fieldName} is required.`,
    trim = true,
  } = options;

  if (typeof value !== 'string') {
    throw badRequest(message);
  }

  const normalized = trim ? value.trim() : value;
  if (!normalized) {
    throw badRequest(message);
  }

  return normalized;
}

function normalizeOptionalString(value, options = {}) {
  const {
    fieldName = 'value',
    trim = true,
    allowNull = false,
    emptyToNull = false,
    emptyToUndefined = false,
  } = options;

  if (value === undefined) return undefined;
  if (value === null) {
    if (allowNull) return null;
    throw badRequest(`${fieldName} must be a string.`);
  }
  if (typeof value !== 'string') {
    throw badRequest(`${fieldName} must be a string.`);
  }

  const normalized = trim ? value.trim() : value;
  if (!normalized) {
    if (emptyToNull) return null;
    if (emptyToUndefined) return undefined;
    throw badRequest(`${fieldName} must not be empty.`);
  }

  return normalized;
}

function normalizeOptionalBoolean(value, fieldName) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw badRequest(`${fieldName} must be a boolean.`);
  }
  return value;
}

function normalizeOptionalQueryString(value, fieldName) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    throw badRequest(`${fieldName} must be a single string value.`);
  }
  if (typeof value !== 'string') {
    throw badRequest(`${fieldName} must be a string.`);
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeOptionalQueryPositiveInt(value, fieldName, options = {}) {
  const { max } = options;

  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    throw badRequest(`${fieldName} must be a single integer value.`);
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw badRequest(`${fieldName} must be a positive integer.`);
  }

  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return undefined;

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw badRequest(`${fieldName} must be a positive integer.`);
  }

  if (max !== undefined) {
    return Math.min(parsed, max);
  }

  return parsed;
}

module.exports = {
  badRequest,
  ensureBodyObject,
  normalizeOptionalBoolean,
  normalizeOptionalQueryPositiveInt,
  normalizeOptionalQueryString,
  normalizeOptionalString,
  normalizeRequiredString,
};
