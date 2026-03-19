'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { PublicError } = require('./errors/public-error');
const { isAuthConfigured } = require('../../lib/auth/auth-service');
const { serializeCookie } = require('../../lib/cookies');
const { loadAppEnv } = require('../../lib/load-dotenv');
const { errorHandler } = require('./middlewares/error-handler');
const { notFoundHandler } = require('./middlewares/not-found-handler');
const { adminCookieName } = require('./middlewares/require-admin-operator');
const { createInMemoryRateLimit } = require('./middlewares/request-rate-limit');
const { buildAdminRouter } = require('./routes/admin.routes');
const { buildApiV1Router } = require('./routes/api-v1.routes');
const { buildApiKeysRouter } = require('./routes/api-keys.routes');
const { buildAuditRouter } = require('./routes/audit.routes');
const { buildAuthRouter } = require('./routes/auth.routes');
const { buildDocsRouter } = require('./routes/docs.routes');
const { buildHealthRouter } = require('./routes/health.routes');

loadAppEnv(process.cwd());

const PORT = Number(process.env.PORT || process.env.EXPORT_API_PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const API_V1_BASE_PATH = '/api/v1';

const liveSyncState = { isRunning: false };

function asyncHandler(handler) {
  return function wrappedAsyncHandler(req, res, next) {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function parseEnvBool(raw, fallback) {
  if (raw === undefined) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseEnvPositiveInt(raw, fallback) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

const RATE_LIMIT_ENABLED = parseEnvBool(process.env.EXPORT_API_RATE_LIMIT_ENABLED, true);
const RATE_LIMIT_WINDOW_SEC = parseEnvPositiveInt(process.env.EXPORT_API_RATE_LIMIT_WINDOW_SEC, 60);
const RATE_LIMIT_MAX_REQUESTS = parseEnvPositiveInt(
  process.env.EXPORT_API_RATE_LIMIT_MAX_REQUESTS,
  60
);
const LOGIN_RATE_LIMIT_ENABLED = parseEnvBool(process.env.AUTH_LOGIN_RATE_LIMIT_ENABLED, true);
const LOGIN_RATE_LIMIT_WINDOW_SEC = parseEnvPositiveInt(
  process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SEC,
  300
);
const LOGIN_RATE_LIMIT_MAX_REQUESTS = parseEnvPositiveInt(
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS,
  10
);
const AUTH_ENABLED = isAuthConfigured();
const projectRoot = path.join(__dirname, '..', '..');

function buildRateLimitKey(req) {
  const apiKey = String(req.header('x-api-key') || '').trim();
  if (apiKey) return `api_key:${apiKey}`;
  return `ip:${req.ip || 'unknown'}`;
}

function buildLoginRateLimitKey(req) {
  const ip = String(req.ip || 'unknown');
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  return email ? `login:${ip}:${email}` : `login:${ip}`;
}

const rateLimitMiddleware = createInMemoryRateLimit({
  enabled: RATE_LIMIT_ENABLED,
  windowSec: RATE_LIMIT_WINDOW_SEC,
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
  keyBuilder: buildRateLimitKey,
});

const loginRateLimitMiddleware = createInMemoryRateLimit({
  enabled: LOGIN_RATE_LIMIT_ENABLED,
  windowSec: LOGIN_RATE_LIMIT_WINDOW_SEC,
  maxRequests: LOGIN_RATE_LIMIT_MAX_REQUESTS,
  keyBuilder: buildLoginRateLimitKey,
  errorCode: 'TooManyLoginAttempts',
  messageBuilder: ({ maxRequests, windowSec }) =>
    `Too many login attempts. Max ${maxRequests} requests per ${windowSec}s.`,
});

const app = express();
app.disable('x-powered-by');
const adminDir = path.join(projectRoot, 'src', 'public', 'admin', 'web');
const siteDir = path.join(projectRoot, 'src', 'public', 'site', 'web');
const docsDir = path.join(projectRoot, 'docs');
const swaggerUiPath = path.join(docsDir, 'swagger', 'index.html');
const publicSwaggerUiPath = path.join(docsDir, 'swagger', 'public.html');
const openApiSpecPath = path.join(docsDir, 'openapi.json');
const publicOpenApiSpecPath = path.join(docsDir, 'openapi.public.json');
const healthPagePath = path.join(siteDir, 'health.html');
const openApiSpec = JSON.parse(fs.readFileSync(openApiSpecPath, 'utf8'));
const publicOpenApiSpec = JSON.parse(fs.readFileSync(publicOpenApiSpecPath, 'utf8'));

function buildHealthPayload() {
  return {
    status: 'ok',
    uptimeSec: Math.floor(process.uptime()),
    now: new Date().toISOString(),
  };
}

function buildOpenApiPayload(spec, req, explicitUrl) {
  const serverUrl = String(explicitUrl || '').trim();
  if (!serverUrl) return spec;

  return {
    ...spec,
    servers: [
      {
        url: serverUrl,
        description: 'Current environment',
      },
    ],
  };
}

function setAdminSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(adminCookieName, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: IS_PRODUCTION,
      path: '/',
      maxAge: 60 * 60 * 8,
    })
  );
}

function clearAdminSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(adminCookieName, '', {
      httpOnly: true,
      sameSite: 'Lax',
      secure: IS_PRODUCTION,
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    })
  );
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  return next();
});
app.use(express.json({ limit: '100kb' }));
app.use('/site', express.static(siteDir));

app.get('/', (_req, res) => {
  return res.sendFile(path.join(siteDir, 'index.html'));
});

const adminStatic = express.static(adminDir, { index: false });
app.use('/admin', (req, res, next) => {
  if (/\.html$/i.test(req.path)) {
    return next(
      new PublicError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Not found.',
      })
    );
  }
  return adminStatic(req, res, next);
});
app.use(
  '/admin',
  buildAdminRouter({
    adminDir,
    asyncHandler,
    clearAdminSessionCookie,
    loginRateLimitMiddleware,
    setAdminSessionCookie,
  })
);
app.use(
  buildDocsRouter({
    buildOpenApiPayload,
    openApiSpec,
    publicOpenApiSpec,
    publicSwaggerUiPath,
    swaggerUiPath,
  })
);
app.use(
  buildHealthRouter({
    buildHealthPayload,
    healthPagePath,
  })
);
app.use(
  '/auth',
  buildAuthRouter({
    asyncHandler,
    loginRateLimitMiddleware,
  })
);
app.use(
  '/api-keys',
  buildApiKeysRouter({
    asyncHandler,
  })
);
app.use(
  '/audit-logs',
  buildAuditRouter({
    asyncHandler,
  })
);
app.use(
  API_V1_BASE_PATH,
  buildApiV1Router({
    asyncHandler,
    liveSyncState,
    rateLimitMiddleware,
  })
);

let isShuttingDown = false;

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Hope Apartments API listening on port ${PORT}`);
  console.log('Admin UI enabled');
  console.log('Docs enabled (JWT/session protected)');
  console.log('Public docs enabled');
  console.log(`App auth ${AUTH_ENABLED ? 'enabled' : 'disabled'}${AUTH_ENABLED ? ' (database + JWT)' : ''}`);
  console.log(
    `Login rate limiting ${
      LOGIN_RATE_LIMIT_ENABLED
        ? `enabled (${LOGIN_RATE_LIMIT_MAX_REQUESTS}/${LOGIN_RATE_LIMIT_WINDOW_SEC}s)`
        : 'disabled'
    }`
  );
  console.log(
    `Rate limiting ${
      RATE_LIMIT_ENABLED ? `enabled (${RATE_LIMIT_MAX_REQUESTS}/${RATE_LIMIT_WINDOW_SEC}s)` : 'disabled'
    }`
  );
});

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} received, shutting down gracefully...`);
  server.close((err) => {
    if (err) {
      console.error('Error while closing HTTP server', err);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
