'use strict';

const { verifyApiKey, isApiKeyServiceConfigured } = require('../../../lib/api-keys/api-key-service');
const { recordApiKeyAuthFailed, recordApiKeyUsed } = require('../audit/audit-recorder');
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
      await recordApiKeyAuthFailed(req, rawKey, result.reason);
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
      accessPolicy: result.apiKey.accessPolicy,
    };

    await recordApiKeyUsed(req, result.apiKey);

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  extractApiKey,
  requireApiKey,
};
