'use strict';

const path = require('path');
const { Router } = require('express');

const { userHasAdminConsoleAccess } = require('../../../lib/admin/admin-access');
const { loginWithPassword } = require('../../../lib/auth/auth-service');
const { PublicError } = require('../errors/public-error');
const { requireConfiguredAuth } = require('../middlewares/require-configured-auth');
const {
  requireAdminOperator,
  requireAdminPageSession,
} = require('../middlewares/require-admin-operator');
const { requireSameOrigin } = require('../middlewares/require-same-origin');
const { validateLoginInput } = require('../validation/auth.validation');

function buildAdminRouter({
  adminDir,
  asyncHandler,
  clearAdminSessionCookie,
  loginRateLimitMiddleware,
  setAdminSessionCookie,
}) {
  const router = Router();

  router.get('/', (_req, res) => {
    return res.redirect('/admin/dashboard');
  });

  router.get('/dashboard', requireConfiguredAuth, requireAdminPageSession, (_req, res) => {
    return res.sendFile(path.join(adminDir, 'index.html'));
  });

  router.get('/login', (_req, res) => {
    return res.sendFile(path.join(adminDir, 'login.html'));
  });

  router.get('/session', requireConfiguredAuth, requireAdminOperator, (req, res) => {
    return res.json({ user: req.adminAuth.user });
  });

  router.post(
    '/login',
    requireSameOrigin,
    loginRateLimitMiddleware,
    requireConfiguredAuth,
    asyncHandler(async (req, res) => {
      const { email, password } = validateLoginInput(req.body);

      const session = await loginWithPassword(email, password, { issueRefreshToken: false });
      if (!session) {
        throw new PublicError({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password.',
        });
      }
      if (!userHasAdminConsoleAccess(session.user)) {
        throw new PublicError({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Only admin or developer users can access the admin console.',
        });
      }

      setAdminSessionCookie(res, session.accessToken);
      return res.json({ user: session.user });
    })
  );

  router.post('/logout', requireSameOrigin, (_req, res) => {
    clearAdminSessionCookie(res);
    return res.status(204).end();
  });

  return router;
}

module.exports = { buildAdminRouter };
