'use strict';

const { Router } = require('express');

const {
  createApiKey,
  deleteApiKey,
  findApiKeyByIdentifier,
  getApiKeyStats,
  listApiKeys,
  reactivateApiKey,
  revokeApiKey,
  rotateApiKey,
  updateApiKey,
} = require('../../../lib/api-keys/api-key-service');
const { INTERNAL_PERMISSIONS } = require('../authz/internal-permissions');
const {
  recordApiKeyCreated,
  recordApiKeyDeleted,
  recordApiKeyReactivated,
  recordApiKeyRevoked,
  recordApiKeyRotated,
  recordApiKeyUpdated,
} = require('../audit/audit-recorder');
const { PublicError } = require('../errors/public-error');
const { requireAdminOperator } = require('../middlewares/require-admin-operator');
const { requireConfiguredAuth } = require('../middlewares/require-configured-auth');
const { requireConfiguredApiKeyService } = require('../middlewares/require-configured-service');
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
    requireConfiguredApiKeyService,
    requireAdminOperator,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_READ),
    asyncHandler(async (_req, res) => {
      const apiKeys = await listApiKeys();
      return res.json({ apiKeys: serializeApiKeyList(apiKeys) });
    })
  );

  router.get(
    '/stats',
    requireConfiguredAuth,
    requireConfiguredApiKeyService,
    requireAdminOperator,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_READ),
    asyncHandler(async (_req, res) => {
      const stats = await getApiKeyStats();
      return res.json({ stats });
    })
  );

  router.get(
    '/:id',
    requireConfiguredAuth,
    requireConfiguredApiKeyService,
    requireAdminOperator,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_READ),
    asyncHandler(async (req, res) => {
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
    requireConfiguredApiKeyService,
    requireAdminOperator,
    requireSameOriginForCookieAuth,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_CREATE),
    asyncHandler(async (req, res) => {
      const validatedInput = validateCreateApiKeyInput(req.body);
      const created = await createApiKey({
        ownerUserId: req.auth.sub,
        ...validatedInput,
      });

      await recordApiKeyCreated(req, created.apiKey);

      return res.status(201).json({
        apiKey: serializeApiKey(created.apiKey),
        secret: created.secret,
      });
    })
  );

  router.post(
    '/:id/revoke',
    requireConfiguredAuth,
    requireConfiguredApiKeyService,
    requireAdminOperator,
    requireSameOriginForCookieAuth,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_REVOKE),
    asyncHandler(async (req, res) => {
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
      await recordApiKeyRevoked(req, revoked);

      return res.json({ apiKey: serializeApiKey(revoked) });
    })
  );

  router.post(
    '/:id/reactivate',
    requireConfiguredAuth,
    requireConfiguredApiKeyService,
    requireAdminOperator,
    requireSameOriginForCookieAuth,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_UPDATE),
    asyncHandler(async (req, res) => {
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
      await recordApiKeyReactivated(req, apiKey);

      return res.json({ apiKey: serializeApiKey(apiKey) });
    })
  );

  router.post(
    '/:id/rotate',
    requireConfiguredAuth,
    requireConfiguredApiKeyService,
    requireAdminOperator,
    requireSameOriginForCookieAuth,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_ROTATE),
    asyncHandler(async (req, res) => {
      const apiKeyId = validateApiKeyIdentifierParam(req.params);
      const rotated = await rotateApiKey(apiKeyId);
      if (!rotated) {
        throw new PublicError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'API key not found.',
        });
      }

      await recordApiKeyRotated(req, rotated);

      return res.json(serializeRotatedApiKey(rotated));
    })
  );

  router.patch(
    '/:id',
    requireConfiguredAuth,
    requireConfiguredApiKeyService,
    requireAdminOperator,
    requireSameOriginForCookieAuth,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_UPDATE),
    asyncHandler(async (req, res) => {
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

      await recordApiKeyUpdated(req, apiKey);

      return res.json({ apiKey: serializeApiKey(apiKey) });
    })
  );

  router.delete(
    '/:id',
    requireConfiguredAuth,
    requireConfiguredApiKeyService,
    requireAdminOperator,
    requireSameOriginForCookieAuth,
    requirePermission(INTERNAL_PERMISSIONS.API_KEYS_DELETE),
    asyncHandler(async (req, res) => {
      const apiKeyId = validateApiKeyIdentifierParam(req.params);
      const existing = await findApiKeyByIdentifier(apiKeyId);
      if (!existing) {
        throw new PublicError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'API key not found.',
        });
      }

      const deleted = await deleteApiKey(apiKeyId);
      await recordApiKeyDeleted(req, deleted);

      return res.json({ apiKey: serializeApiKey(deleted) });
    })
  );

  return router;
}

module.exports = { buildApiKeysRouter };
