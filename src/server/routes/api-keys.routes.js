'use strict';

const { Router } = require('express');

const {
  createApiKey,
  findApiKeyByIdentifier,
  getApiKeyStats,
  isApiKeyServiceConfigured,
  listApiKeys,
  reactivateApiKey,
  revokeApiKey,
  rotateApiKey,
  updateApiKey,
} = require('../../../lib/api-key-service');
const { writeAuditLog } = require('../../../lib/audit-service');
const { INTERNAL_PERMISSIONS } = require('../authz/internal-permissions');
const { PublicError } = require('../errors/public-error');
const { requireAdminOperator } = require('../middlewares/require-admin-operator');
const { requireConfiguredAuth } = require('../middlewares/require-configured-auth');
const { requirePermission } = require('../middlewares/require-permission');
const { requireSameOriginForCookieAuth } = require('../middlewares/require-same-origin');
const {
  serializeApiKey,
  serializeApiKeyList,
  serializeRotatedApiKey,
} = require('../serializers/api-key.serializer');
const {
  validateApiKeyIdentifierParam,
  validateCreateApiKeyInput,
  validateUpdateApiKeyInput,
} = require('../validation/api-key.validation');

function buildApiKeysRouter({ asyncHandler }) {
  const router = Router();

  router.get(
    '/',
    requireConfiguredAuth,
    requireAdminOperator,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_READ),
    asyncHandler(async (_req, res) => {
      if (!isApiKeyServiceConfigured()) {
        throw new PublicError({
          statusCode: 503,
          code: 'API_KEY_SERVICE_NOT_CONFIGURED',
          message: 'API key service requires DATABASE_URL.',
        });
      }

      const apiKeys = await listApiKeys();
      return res.json({ apiKeys: serializeApiKeyList(apiKeys) });
    })
  );

  router.get(
    '/stats',
    requireConfiguredAuth,
    requireAdminOperator,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_READ),
    asyncHandler(async (_req, res) => {
      if (!isApiKeyServiceConfigured()) {
        throw new PublicError({
          statusCode: 503,
          code: 'API_KEY_SERVICE_NOT_CONFIGURED',
          message: 'API key service requires DATABASE_URL.',
        });
      }

      const stats = await getApiKeyStats();
      return res.json({ stats });
    })
  );

  router.get(
    '/:id',
    requireConfiguredAuth,
    requireAdminOperator,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_READ),
    asyncHandler(async (req, res) => {
      if (!isApiKeyServiceConfigured()) {
        throw new PublicError({
          statusCode: 503,
          code: 'API_KEY_SERVICE_NOT_CONFIGURED',
          message: 'API key service requires DATABASE_URL.',
        });
      }

      const apiKeyId = validateApiKeyIdentifierParam(req.params);
      const apiKey = await findApiKeyByIdentifier(apiKeyId);
      if (!apiKey) {
        throw new PublicError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'API key not found.',
        });
      }
      return res.json({ apiKey: serializeApiKey(apiKey) });
    })
  );

  router.post(
    '/',
    requireConfiguredAuth,
    requireAdminOperator,
    requireSameOriginForCookieAuth,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_CREATE),
    asyncHandler(async (req, res) => {
      if (!isApiKeyServiceConfigured()) {
        throw new PublicError({
          statusCode: 503,
          code: 'API_KEY_SERVICE_NOT_CONFIGURED',
          message: 'API key service requires DATABASE_URL.',
        });
      }

      const validatedInput = validateCreateApiKeyInput(req.body);
      const created = await createApiKey({
        ownerUserId: req.auth.sub,
        ...validatedInput,
      });

      await writeAuditLog({
        actorUserId: req.auth.sub,
        action: 'api_key_created',
        resourceType: 'api_key',
        resourceId: created.apiKey.id,
        ip: req.ip,
        userAgent: req.header('user-agent'),
        metadata: {
          partnerId: created.apiKey.partnerId,
          keyPrefix: created.apiKey.keyPrefix,
          role: created.apiKey.role,
        },
      });

      return res.status(201).json({
        apiKey: serializeApiKey(created.apiKey),
        secret: created.secret,
      });
    })
  );

  router.post(
    '/:id/revoke',
    requireConfiguredAuth,
    requireAdminOperator,
    requireSameOriginForCookieAuth,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_REVOKE),
    asyncHandler(async (req, res) => {
      if (!isApiKeyServiceConfigured()) {
        throw new PublicError({
          statusCode: 503,
          code: 'API_KEY_SERVICE_NOT_CONFIGURED',
          message: 'API key service requires DATABASE_URL.',
        });
      }

      const apiKeyId = validateApiKeyIdentifierParam(req.params);
      const existing = await findApiKeyByIdentifier(apiKeyId);
      if (!existing) {
        throw new PublicError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'API key not found.',
        });
      }

      const revoked = await revokeApiKey(apiKeyId);
      await writeAuditLog({
        actorUserId: req.auth.sub,
        action: 'api_key_revoked',
        resourceType: 'api_key',
        resourceId: revoked.id,
        ip: req.ip,
        userAgent: req.header('user-agent'),
        metadata: {
          partnerId: revoked.partnerId,
          keyPrefix: revoked.keyPrefix,
        },
      });

      return res.json({ apiKey: serializeApiKey(revoked) });
    })
  );

  router.post(
    '/:id/reactivate',
    requireConfiguredAuth,
    requireAdminOperator,
    requireSameOriginForCookieAuth,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_UPDATE),
    asyncHandler(async (req, res) => {
      if (!isApiKeyServiceConfigured()) {
        throw new PublicError({
          statusCode: 503,
          code: 'API_KEY_SERVICE_NOT_CONFIGURED',
          message: 'API key service requires DATABASE_URL.',
        });
      }

      const apiKeyId = validateApiKeyIdentifierParam(req.params);
      const existing = await findApiKeyByIdentifier(apiKeyId);
      if (!existing) {
        throw new PublicError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'API key not found.',
        });
      }

      const apiKey = await reactivateApiKey(apiKeyId);
      await writeAuditLog({
        actorUserId: req.auth.sub,
        action: 'api_key_reactivated',
        resourceType: 'api_key',
        resourceId: apiKey.id,
        ip: req.ip,
        userAgent: req.header('user-agent'),
        metadata: {
          partnerId: apiKey.partnerId,
          keyPrefix: apiKey.keyPrefix,
        },
      });

      return res.json({ apiKey: serializeApiKey(apiKey) });
    })
  );

  router.post(
    '/:id/rotate',
    requireConfiguredAuth,
    requireAdminOperator,
    requireSameOriginForCookieAuth,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_ROTATE),
    asyncHandler(async (req, res) => {
      if (!isApiKeyServiceConfigured()) {
        throw new PublicError({
          statusCode: 503,
          code: 'API_KEY_SERVICE_NOT_CONFIGURED',
          message: 'API key service requires DATABASE_URL.',
        });
      }

      const apiKeyId = validateApiKeyIdentifierParam(req.params);
      const rotated = await rotateApiKey(apiKeyId);
      if (!rotated) {
        throw new PublicError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'API key not found.',
        });
      }

      await writeAuditLog({
        actorUserId: req.auth.sub,
        action: 'api_key_rotated',
        resourceType: 'api_key',
        resourceId: rotated.apiKey.id,
        ip: req.ip,
        userAgent: req.header('user-agent'),
        metadata: {
          previousApiKeyId: rotated.previousApiKeyId,
          partnerId: rotated.apiKey.partnerId,
          keyPrefix: rotated.apiKey.keyPrefix,
        },
      });

      return res.json(serializeRotatedApiKey(rotated));
    })
  );

  router.patch(
    '/:id',
    requireConfiguredAuth,
    requireAdminOperator,
    requireSameOriginForCookieAuth,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_UPDATE),
    asyncHandler(async (req, res) => {
      if (!isApiKeyServiceConfigured()) {
        throw new PublicError({
          statusCode: 503,
          code: 'API_KEY_SERVICE_NOT_CONFIGURED',
          message: 'API key service requires DATABASE_URL.',
        });
      }

      const apiKeyId = validateApiKeyIdentifierParam(req.params);
      const existing = await findApiKeyByIdentifier(apiKeyId);
      if (!existing) {
        throw new PublicError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'API key not found.',
        });
      }

      const validatedInput = validateUpdateApiKeyInput(req.body);
      const apiKey = await updateApiKey(apiKeyId, validatedInput);

      await writeAuditLog({
        actorUserId: req.auth.sub,
        action: 'api_key_updated',
        resourceType: 'api_key',
        resourceId: apiKey.id,
        ip: req.ip,
        userAgent: req.header('user-agent'),
        metadata: {
          partnerId: apiKey.partnerId,
          keyPrefix: apiKey.keyPrefix,
        },
      });

      return res.json({ apiKey: serializeApiKey(apiKey) });
    })
  );

  return router;
}

module.exports = { buildApiKeysRouter };
