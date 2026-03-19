'use strict';

const { API_KEY_SCOPES } = require('../api-keys/api-key-scopes');

const FIELD_PATH_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/;

class PartnerAccessPolicyValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PartnerAccessPolicyValidationError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizePartnerApartmentFieldAllowlist(input, options = {}) {
  const { allowUndefined = true } = options;

  if (input === undefined) {
    return allowUndefined ? undefined : [];
  }

  if (input === null) return [];
  if (!Array.isArray(input)) {
    throw new PartnerAccessPolicyValidationError('accessPolicy.apartments.fields must be an array.');
  }

  const normalizedFields = Array.from(
    new Set(
      input
        .map((fieldPath) => String(fieldPath || '').trim())
        .filter(Boolean)
    )
  );

  const invalidFields = normalizedFields.filter((fieldPath) => !FIELD_PATH_PATTERN.test(fieldPath));
  if (invalidFields.length > 0) {
    throw new PartnerAccessPolicyValidationError(
      `Unsupported accessPolicy.apartments.fields values: ${invalidFields.join(', ')}.`
    );
  }

  return normalizedFields;
}

function normalizePartnerAccessPolicy(input, options = {}) {
  const { allowUndefined = true } = options;

  if (input === undefined) {
    return allowUndefined ? undefined : {};
  }

  if (input === null) return {};
  if (!isPlainObject(input)) {
    throw new PartnerAccessPolicyValidationError('accessPolicy must be an object.');
  }

  if (input.apartments === undefined || input.apartments === null) {
    return {};
  }

  if (!isPlainObject(input.apartments)) {
    throw new PartnerAccessPolicyValidationError('accessPolicy.apartments must be an object.');
  }

  const fields = normalizePartnerApartmentFieldAllowlist(input.apartments.fields, { allowUndefined: false });
  if (fields.length === 0) {
    return {};
  }

  return {
    apartments: {
      fields,
    },
  };
}

function resolveApartmentFieldAllowlist(actor) {
  if (Array.isArray(actor?.apartmentFieldAllowlist)) {
    return actor.apartmentFieldAllowlist;
  }

  if (Array.isArray(actor?.accessPolicy?.apartments?.fields)) {
    return actor.accessPolicy.apartments.fields;
  }

  return [];
}

function buildPartnerApartmentAccessPolicy(actor) {
  const scopes = Array.isArray(actor?.scopes)
    ? actor.scopes.map((scope) => String(scope || '').trim()).filter(Boolean)
    : [];
  const accessPolicy = normalizePartnerAccessPolicy(actor?.accessPolicy, { allowUndefined: false });
  const apartmentFieldAllowlist = normalizePartnerApartmentFieldAllowlist(
    resolveApartmentFieldAllowlist({
      ...actor,
      accessPolicy,
    }),
    { allowUndefined: false }
  );

  const canReadAllApartments = scopes.includes(API_KEY_SCOPES.APARTMENTS_READ);
  const canReadRentalApartments =
    canReadAllApartments || scopes.includes(API_KEY_SCOPES.APARTMENTS_RENTAL_READ);
  const canReadSaleApartments =
    canReadAllApartments || scopes.includes(API_KEY_SCOPES.APARTMENTS_SALE_READ);

  return {
    actorType: actor?.type || null,
    actorId: actor?.id || null,
    partnerId: String(actor?.partnerId || '').trim() || null,
    scopes,
    canReadApartments: canReadAllApartments || canReadRentalApartments || canReadSaleApartments,
    canReadAllApartments,
    canReadRentalApartments,
    canReadSaleApartments,
    accessPolicy,
    apartmentFieldAllowlist,
    projectionMode: apartmentFieldAllowlist.length > 0 ? 'allowlist' : 'full',
  };
}

module.exports = {
  buildPartnerApartmentAccessPolicy,
  normalizePartnerAccessPolicy,
  PartnerAccessPolicyValidationError,
};
