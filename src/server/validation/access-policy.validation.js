'use strict';

const {
  normalizePartnerAccessPolicy,
  PartnerAccessPolicyValidationError,
} = require('../../../lib/partners/partner-access-policy');
const { badRequest } = require('./validation-utils');

function validatePartnerAccessPolicy(input) {
  try {
    return normalizePartnerAccessPolicy(input, { allowUndefined: true });
  } catch (err) {
    if (err instanceof PartnerAccessPolicyValidationError) {
      throw badRequest(err.message, 'INVALID_ACCESS_POLICY');
    }
    throw err;
  }
}

module.exports = {
  validatePartnerAccessPolicy,
};
