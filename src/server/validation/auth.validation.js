'use strict';

const { ensureBodyObject, normalizeRequiredString } = require('./validation-utils');

function validateLoginInput(body) {
  const input = ensureBodyObject(body);

  return {
    email: normalizeRequiredString(input.email, {
      fieldName: 'email',
      message: 'email and password are required.',
    }),
    password: normalizeRequiredString(input.password, {
      fieldName: 'password',
      message: 'email and password are required.',
      trim: false,
    }),
  };
}

function validateRefreshTokenInput(body) {
  const input = ensureBodyObject(body);

  return {
    refreshToken: normalizeRequiredString(input.refreshToken, {
      fieldName: 'refreshToken',
      message: 'refreshToken is required.',
    }),
  };
}

module.exports = {
  validateLoginInput,
  validateRefreshTokenInput,
};
