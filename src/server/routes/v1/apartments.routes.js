'use strict';

const { Router } = require('express');

const { API_KEY_SCOPES } = require('../../../../lib/api-keys/api-key-scopes');
const {
  findPartnerApartmentLiveById,
  listPartnerApartmentsLive,
  listPartnerOnSaleApartmentsLive,
  listPartnerRentalApartmentsLive,
  listPartnerApartmentsLiveByCity,
} = require('../../../../lib/apartments/partner-apartment-service');
const { PublicError } = require('../../errors/public-error');
const { requireApiKey } = require('../../middlewares/require-api-key');
const { requireApiKeyScope } = require('../../middlewares/require-api-key-scope');
const {
  serializeApartmentListResponse,
  serializeApartmentResponse,
} = require('../../serializers/v1/apartments.serializer');
const {
  validateApartmentCityParam,
  validateApartmentIdParam,
} = require('../../validation/v1/apartments.validation');

function buildApartmentReadGuards(rateLimitMiddleware) {
  return {
    all: [
      rateLimitMiddleware,
      requireApiKey,
      requireApiKeyScope(API_KEY_SCOPES.APARTMENTS_READ),
    ],
    rental: [
      rateLimitMiddleware,
      requireApiKey,
      requireApiKeyScope(
        [API_KEY_SCOPES.APARTMENTS_READ, API_KEY_SCOPES.APARTMENTS_RENTAL_READ],
        {
          match: 'any',
          auditRequiredScope: 'apartments:read|apartments:rental:read',
        }
      ),
    ],
    onsale: [
      rateLimitMiddleware,
      requireApiKey,
      requireApiKeyScope(
        [API_KEY_SCOPES.APARTMENTS_READ, API_KEY_SCOPES.APARTMENTS_SALE_READ],
        {
          match: 'any',
          auditRequiredScope: 'apartments:read|apartments:sale:read',
        }
      ),
    ],
  };
}

async function runLiveApartmentCollection({ req, res, liveSyncState, handler, serializerExtra = {} }) {
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
    const result = await handler();
    const finishedAt = new Date();

    res.setHeader('x-data-source', result.dataSource);
    return res.json(
      serializeApartmentListResponse(req, result.apartments, startedAt, finishedAt, serializerExtra)
    );
  } finally {
    liveSyncState.isRunning = false;
  }
}

function buildApartmentsV1Router({ asyncHandler, liveSyncState, rateLimitMiddleware }) {
  const router = Router();
  const readGuards = buildApartmentReadGuards(rateLimitMiddleware);

  router.get(
    '/',
    ...readGuards.all,
    asyncHandler(async (req, res) =>
      runLiveApartmentCollection({
        req,
        res,
        liveSyncState,
        handler: () => listPartnerApartmentsLive(req.authActor),
      })
    )
  );

  router.get(
    '/rental',
    ...readGuards.rental,
    asyncHandler(async (req, res) =>
      runLiveApartmentCollection({
        req,
        res,
        liveSyncState,
        handler: () => listPartnerRentalApartmentsLive(req.authActor),
        serializerExtra: { subtype: 'rental' },
      })
    )
  );

  router.get(
    '/onsale',
    ...readGuards.onsale,
    asyncHandler(async (req, res) =>
      runLiveApartmentCollection({
        req,
        res,
        liveSyncState,
        handler: () => listPartnerOnSaleApartmentsLive(req.authActor),
        serializerExtra: { subtype: 'onsale' },
      })
    )
  );

  router.get(
    '/city/:city',
    ...readGuards.all,
    asyncHandler(async (req, res) => {
      const requestedCity = validateApartmentCityParam(req.params);
      const startedAt = new Date();
      const result = await listPartnerApartmentsLiveByCity(req.authActor, requestedCity);
      const finishedAt = new Date();

      res.setHeader('x-data-source', result.dataSource);
      return res.json(
        serializeApartmentListResponse(req, result.apartments, startedAt, finishedAt, {
          city: requestedCity,
        })
      );
    })
  );

  router.get(
    '/:id',
    ...readGuards.all,
    asyncHandler(async (req, res) => {
      const apartmentId = validateApartmentIdParam(req.params);
      const startedAt = new Date();
      const result = await findPartnerApartmentLiveById(req.authActor, apartmentId);
      const finishedAt = new Date();

      if (!result.apartment) {
        throw new PublicError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Apartment not found.',
        });
      }

      res.setHeader('x-data-source', result.dataSource);
      return res.json(
        serializeApartmentResponse(req, result.apartment, startedAt, finishedAt, {
          apartmentId,
        })
      );
    })
  );

  return router;
}

module.exports = {
  buildApartmentsV1Router,
};
