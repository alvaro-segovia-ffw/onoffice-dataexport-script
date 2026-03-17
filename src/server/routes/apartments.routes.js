'use strict';

const { Router } = require('express');

const { API_KEY_SCOPES } = require('../../../lib/api-key-scopes');
const { listPartnerApartmentsLive } = require('../../../lib/apartments/partner-apartment-service');
const { PublicError } = require('../errors/public-error');
const { requireApiKey } = require('../middlewares/require-api-key');
const { requireApiKeyScope } = require('../middlewares/require-api-key-scope');

function buildApartmentsRouter({ asyncHandler, liveSyncState, rateLimitMiddleware }) {
  const router = Router();

  router.get(
    '/',
    rateLimitMiddleware,
    requireApiKey,
    requireApiKeyScope(API_KEY_SCOPES.APARTMENTS_READ),
    asyncHandler(async (req, res) => {
      if (liveSyncState.isRunning) {
        throw new PublicError({
          statusCode: 409,
          code: 'CONFLICT',
          message: 'Another live onOffice sync is already running.',
        });
      }

      liveSyncState.isRunning = true;
      const startedAt = new Date();

      try {
        const result = await listPartnerApartmentsLive(req.authActor);
        const finishedAt = new Date();

        res.setHeader('x-data-source', result.dataSource);
        return res.json({
          apartments: result.apartments,
          meta: {
            requestedBy: req.authActor.partnerId,
            authType: req.authActor.type,
            count: result.apartments.length,
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            durationMs: finishedAt.getTime() - startedAt.getTime(),
          },
        });
      } finally {
        liveSyncState.isRunning = false;
      }
    })
  );

  return router;
}

module.exports = { buildApartmentsRouter };
