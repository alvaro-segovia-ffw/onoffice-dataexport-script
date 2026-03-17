'use strict';

const {
  normalizeOptionalQueryPositiveInt,
  normalizeOptionalQueryString,
} = require('./validation-utils');

function validateAuditLogFilters(query) {
  return {
    action: normalizeOptionalQueryString(query?.action, 'action'),
    resourceType: normalizeOptionalQueryString(query?.resourceType, 'resourceType'),
    resourceId: normalizeOptionalQueryString(query?.resourceId, 'resourceId'),
    actorUserId: normalizeOptionalQueryString(query?.actorUserId, 'actorUserId'),
    actorApiKeyId: normalizeOptionalQueryString(query?.actorApiKeyId, 'actorApiKeyId'),
    partnerId: normalizeOptionalQueryString(query?.partnerId, 'partnerId'),
    limit: normalizeOptionalQueryPositiveInt(query?.limit, 'limit', { max: 200 }),
  };
}

module.exports = {
  validateAuditLogFilters,
};
