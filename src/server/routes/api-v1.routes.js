'use strict';

const { Router } = require('express');

const { buildApartmentsV1Router } = require('./v1/apartments.routes');

function buildApiV1Router({ asyncHandler, liveSyncState, rateLimitMiddleware }) {
  const router = Router();

  router.use(
    '/apartments',
    buildApartmentsV1Router({
      asyncHandler,
      liveSyncState,
      rateLimitMiddleware,
    })
  );

  return router;
}

module.exports = {
  buildApiV1Router,
};
