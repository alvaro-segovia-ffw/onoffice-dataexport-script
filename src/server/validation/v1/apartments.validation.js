'use strict';

const { PublicError } = require('../../errors/public-error');

function validateApartmentIdParam(params = {}) {
  const apartmentId = String(params.id || '').trim();
  if (!apartmentId) {
    throw new PublicError({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'id is required.',
    });
  }

  return apartmentId;
}

function validateApartmentCityParam(params = {}) {
  const city = String(params.city || '').trim();
  if (!city) {
    throw new PublicError({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'city is required.',
    });
  }

  return city;
}

module.exports = {
  validateApartmentCityParam,
  validateApartmentIdParam,
};
