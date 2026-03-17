'use strict';

const { parseApiKey } = require('../../../lib/api-key');
const { writeAuditLog } = require('../../../lib/audit-service');
const { verifyApiKey, isApiKeyServiceConfigured } = require('../../../lib/api-key-service');
const { PublicError } = require('../errors/public-error');

function extractApiKey(req) {
  return String(req.header('x-api-key') || '').trim();
}

async function requireApiKey(req, res, next) {
  if (!isApiKeyServiceConfigured()) {
    return next(
      new PublicError({
        statusCode: 503,
        code: 'API_KEY_AUTH_NOT_CONFIGURED',
        message: 'API key auth requires DATABASE_URL.',
      })
    );
  }

  const rawKey = extractApiKey(req);
  if (!rawKey) {
    return next(
      new PublicError({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Missing X-API-Key header.',
      })
    );
  }

  try {
    const result = await verifyApiKey(rawKey);
    if (!result.ok) {
      const parsed = parseApiKey(rawKey);
      await writeAuditLog({
        action: 'api_key_auth_failed',
        resourceType: 'api_key',
        ip: req.ip,
        userAgent: req.header('user-agent'),
        metadata: {
          reason: result.reason,
          keyPrefix: parsed?.keyPrefix || null,
        },
      });
      return next(
        new PublicError({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Invalid API key.',
        })
      );
    }

    req.apiKey = result.apiKey;
    req.authActor = {
      type: 'api_key',
      id: result.apiKey.id,
      partnerId: result.apiKey.partnerId,
      scopes: result.apiKey.scopes,
      role: result.apiKey.role,
    };

    await writeAuditLog({
      actorApiKeyId: result.apiKey.id,
      action: 'api_key_used',
      resourceType: 'api_key',
      resourceId: result.apiKey.id,
      ip: req.ip,
      userAgent: req.header('user-agent'),
      metadata: {
        partnerId: result.apiKey.partnerId,
        keyPrefix: result.apiKey.keyPrefix,
      },
    });

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  extractApiKey,
  requireApiKey,
};
