'use strict';

const { parseApiKey } = require('../../../lib/api-keys/api-key');
const { writeAuditLog } = require('../../../lib/audit/audit-service');

function getRequestMetadata(req) {
  return {
    ip: req.ip,
    userAgent: typeof req.header === 'function' ? req.header('user-agent') : null,
  };
}

function getActorUserId(req) {
  return req.auth?.sub || req.adminAuth?.user?.id || null;
}

async function recordApiKeyCreated(req, createdApiKey) {
  return writeAuditLog({
    actorUserId: getActorUserId(req),
    action: 'api_key_created',
    resourceType: 'api_key',
    resourceId: createdApiKey.id,
    ...getRequestMetadata(req),
    metadata: {
      partnerId: createdApiKey.partnerId,
      keyPrefix: createdApiKey.keyPrefix,
      role: createdApiKey.role,
    },
  });
}

async function recordApiKeyRevoked(req, apiKey) {
  return writeAuditLog({
    actorUserId: getActorUserId(req),
    action: 'api_key_revoked',
    resourceType: 'api_key',
    resourceId: apiKey.id,
    ...getRequestMetadata(req),
    metadata: {
      partnerId: apiKey.partnerId,
      keyPrefix: apiKey.keyPrefix,
    },
  });
}

async function recordApiKeyReactivated(req, apiKey) {
  return writeAuditLog({
    actorUserId: getActorUserId(req),
    action: 'api_key_reactivated',
    resourceType: 'api_key',
    resourceId: apiKey.id,
    ...getRequestMetadata(req),
    metadata: {
      partnerId: apiKey.partnerId,
      keyPrefix: apiKey.keyPrefix,
    },
  });
}

async function recordApiKeyRotated(req, rotated) {
  return writeAuditLog({
    actorUserId: getActorUserId(req),
    action: 'api_key_rotated',
    resourceType: 'api_key',
    resourceId: rotated.apiKey.id,
    ...getRequestMetadata(req),
    metadata: {
      previousApiKeyId: rotated.previousApiKeyId,
      partnerId: rotated.apiKey.partnerId,
      keyPrefix: rotated.apiKey.keyPrefix,
    },
  });
}

async function recordApiKeyUpdated(req, apiKey) {
  return writeAuditLog({
    actorUserId: getActorUserId(req),
    action: 'api_key_updated',
    resourceType: 'api_key',
    resourceId: apiKey.id,
    ...getRequestMetadata(req),
    metadata: {
      partnerId: apiKey.partnerId,
      keyPrefix: apiKey.keyPrefix,
    },
  });
}

async function recordApiKeyDeleted(req, apiKey) {
  return writeAuditLog({
    actorUserId: getActorUserId(req),
    action: 'api_key_deleted',
    resourceType: 'api_key',
    resourceId: apiKey.id,
    ...getRequestMetadata(req),
    metadata: {
      partnerId: apiKey.partnerId,
      keyPrefix: apiKey.keyPrefix,
    },
  });
}

async function recordApiKeyAuthFailed(req, rawKey, reason) {
  const parsed = parseApiKey(rawKey);

  return writeAuditLog({
    action: 'api_key_auth_failed',
    resourceType: 'api_key',
    ...getRequestMetadata(req),
    metadata: {
      reason,
      keyPrefix: parsed?.keyPrefix || null,
    },
  });
}

async function recordApiKeyUsed(req, apiKey) {
  return writeAuditLog({
    actorApiKeyId: apiKey.id,
    action: 'api_key_used',
    resourceType: 'api_key',
    resourceId: apiKey.id,
    ...getRequestMetadata(req),
    metadata: {
      partnerId: apiKey.partnerId,
      keyPrefix: apiKey.keyPrefix,
    },
  });
}

function buildApiKeyScopeDeniedAuditEntry(req, requiredScope) {
  const apiKey = req.apiKey || {};
  const scopes = Array.isArray(req.apiKey?.scopes)
    ? req.apiKey.scopes
    : Array.isArray(req.authActor?.scopes)
      ? req.authActor.scopes
      : [];

  return {
    actorApiKeyId: apiKey.id || req.authActor?.id || null,
    action: 'api_key_scope_denied',
    resourceType: 'api_key',
    resourceId: apiKey.id || req.authActor?.id || null,
    ...getRequestMetadata(req),
    metadata: {
      partnerId: apiKey.partnerId || req.authActor?.partnerId || null,
      keyPrefix: apiKey.keyPrefix || null,
      requiredScope,
      scopes,
      enforced: true,
      method: req.method || null,
      route: req.originalUrl || req.url || null,
    },
  };
}

module.exports = {
  buildApiKeyScopeDeniedAuditEntry,
  recordApiKeyAuthFailed,
  recordApiKeyCreated,
  recordApiKeyDeleted,
  recordApiKeyReactivated,
  recordApiKeyRevoked,
  recordApiKeyRotated,
  recordApiKeyUpdated,
  recordApiKeyUsed,
};
