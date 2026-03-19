'use strict';

const { Router } = require('express');

const {
  loginWithPassword,
  getUserProfile,
  refreshUserSession,
  revokeRefreshToken,
} = require('../../../lib/auth/auth-service');
const { PublicError } = require('../errors/public-error');
const { requireConfiguredAuth } = require('../middlewares/require-configured-auth');
const { requireAuth } = require('../middlewares/require-auth');
const { serializeAuthSession } = require('../serializers/auth.serializer');
const { validateLoginInput, validateRefreshTokenInput } = require('../validation/auth.validation');

function buildAuthRouter({ asyncHandler, loginRateLimitMiddleware }) {
  const router = Router();

  router.post(
    '/login',
    loginRateLimitMiddleware,
    requireConfiguredAuth,
    asyncHandler(async (req, res) => {
      const { email, password } = validateLoginInput(req.body);

      const session = await loginWithPassword(email, password);
      if (!session) {
        throw new PublicError({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password.',
        });
      }

      return res.json(serializeAuthSession(session));
    })
  );

  router.post(
    '/refresh',
    requireConfiguredAuth,
    asyncHandler(async (req, res) => {
      const { refreshToken } = validateRefreshTokenInput(req.body);

      const session = await refreshUserSession(refreshToken);
      if (!session) {
        throw new PublicError({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Invalid, expired or revoked refresh token.',
        });
      }

      return res.json(serializeAuthSession(session));
    })
  );

  router.post(
    '/logout',
    requireConfiguredAuth,
    asyncHandler(async (req, res) => {
      const { refreshToken } = validateRefreshTokenInput(req.body);

      await revokeRefreshToken(refreshToken);
      return res.status(204).end();
    })
  );

  router.get(
    '/me',
    requireConfiguredAuth,
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = await getUserProfile(req.auth.sub);
      if (!user) {
        throw new PublicError({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'User not found.',
        });
      }

      return res.json({ user });
    })
  );

  return router;
}

module.exports = { buildAuthRouter };
