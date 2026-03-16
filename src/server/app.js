'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  loginWithPassword,
  getUserProfile,
  isAuthConfigured,
  refreshUserSession,
  revokeRefreshToken,
} = require('../../lib/auth-service');
const {
  createApiKey,
  findApiKeyByIdentifier,
  findApiKeyById,
  getApiKeyStats,
  isApiKeyServiceConfigured,
  listApiKeys,
  reactivateApiKey,
  revokeApiKey,
  rotateApiKey,
  updateApiKey,
} = require('../../lib/api-key-service');
const { listAuditLogs, writeAuditLog } = require('../../lib/audit-service');
const { requireApiKey } = require('./middlewares/require-api-key');
const { serializeCookie } = require('../../lib/cookies');
const { loadDotEnv } = require('../../lib/load-dotenv');
const { fetchApartmentsLive } = require('../../lib/apartment-export');
const { requireDocsAccess } = require('./middlewares/docs-access');
const { createInMemoryRateLimit } = require('./middlewares/request-rate-limit');
const {
  adminCookieName,
  requireAdminOperator,
  requireAdminPageSession,
  userHasAdminConsoleAccess,
} = require('./middlewares/require-admin-operator');
const { requireConfiguredAuth } = require('./middlewares/require-configured-auth');
const { requireAuth } = require('./middlewares/require-auth');

loadDotEnv(path.join(process.cwd(), '.env'));

const PORT = Number(process.env.PORT || process.env.EXPORT_API_PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

let isLiveRequestRunning = false;

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

function toApiKeyResponse(apiKey) {
  if (!apiKey) return null;
  const { id: _internalId, ...publicApiKey } = apiKey;
  return publicApiKey;
}

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
    authEnabled: AUTH_ENABLED,
  };
}

function requestOrigin(req) {
  const forwardedProto = String(req.header('x-forwarded-proto') || '')
    .split(',')[0]
    .trim();
  const proto = forwardedProto || req.protocol || (IS_PRODUCTION ? 'https' : 'http');
  const host = String(req.header('x-forwarded-host') || req.header('host') || '').trim();
  if (!host) return null;
  return `${proto}://${host}`;
}

function buildOpenApiPayload(spec, req, explicitUrl) {
  const serverUrl = String(explicitUrl || '').trim() || requestOrigin(req);
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

app.use(express.json());
app.use('/site', express.static(siteDir));

app.get('/', (_req, res) => {
  return res.sendFile(path.join(siteDir, 'index.html'));
});

const adminStatic = express.static(adminDir, { index: false });
app.use('/admin', (req, res, next) => {
  if (/\.html$/i.test(req.path)) {
    return res.status(404).json({
      error: 'NotFound',
      message: 'Not found.',
    });
  }
  return adminStatic(req, res, next);
});
app.get('/admin', (_req, res) => {
  return res.redirect('/admin/dashboard');
});
app.get('/admin/dashboard', requireConfiguredAuth, requireAdminPageSession, (_req, res) => {
  res.sendFile(path.join(adminDir, 'index.html'));
});
app.get('/admin/login', (_req, res) => {
  res.sendFile(path.join(adminDir, 'login.html'));
});
app.get('/admin/session', requireConfiguredAuth, requireAdminOperator, (req, res) => {
  return res.json({ user: req.adminAuth.user });
});
app.post('/admin/login', loginRateLimitMiddleware, requireConfiguredAuth, async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'email and password are required.',
    });
  }

  try {
    const session = await loginWithPassword(email, password, { issueRefreshToken: false });
    if (!session) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password.',
      });
    }
    if (!userHasAdminConsoleAccess(session.user)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admin or developer users can access the admin console.',
      });
    }

    setAdminSessionCookie(res, session.accessToken);
    return res.json({ user: session.user });
  } catch (err) {
    return res.status(500).json({
      error: 'AdminLoginFailed',
      message: err.message || 'Unknown error',
    });
  }
});
app.post('/admin/logout', (_req, res) => {
  clearAdminSessionCookie(res);
  return res.status(204).end();
});

app.get('/openapi.json', requireConfiguredAuth, requireDocsAccess, (req, res) => {
  res.type('application/json');
  return res.send(buildOpenApiPayload(openApiSpec, req, process.env.OPENAPI_SERVER_URL));
});

app.get('/openapi.public.json', (req, res) => {
  res.type('application/json');
  return res.send(
    buildOpenApiPayload(publicOpenApiSpec, req, process.env.OPENAPI_PUBLIC_SERVER_URL)
  );
});

app.get('/docs', requireConfiguredAuth, requireDocsAccess, (_req, res) => {
  return res.sendFile(swaggerUiPath);
});

app.get('/docs/public', (_req, res) => {
  return res.sendFile(publicSwaggerUiPath);
});

app.get('/health.json', (_req, res) => {
  return res.json(buildHealthPayload());
});

app.get('/health', (req, res) => {
  const accepts = String(req.headers.accept || '');
  if (accepts.includes('text/html')) {
    return res.sendFile(healthPagePath);
  }
  return res.json(buildHealthPayload());
});

app.post('/auth/login', loginRateLimitMiddleware, requireConfiguredAuth, async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'email and password are required.',
    });
  }

  try {
    const session = await loginWithPassword(email, password);
    if (!session) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password.',
      });
    }

    return res.json({
      accessToken: session.accessToken,
      tokenType: 'Bearer',
      expiresIn: session.accessTokenTtl,
      refreshToken: session.refreshToken,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
      refreshTokenTtlDays: session.refreshTokenTtlDays,
      user: session.user,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'AuthLoginFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.post('/auth/refresh', requireConfiguredAuth, async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || '').trim();
  if (!refreshToken) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'refreshToken is required.',
    });
  }

  try {
    const session = await refreshUserSession(refreshToken);
    if (!session) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid, expired or revoked refresh token.',
      });
    }

    return res.json({
      accessToken: session.accessToken,
      tokenType: 'Bearer',
      expiresIn: session.accessTokenTtl,
      refreshToken: session.refreshToken,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
      refreshTokenTtlDays: session.refreshTokenTtlDays,
      user: session.user,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'AuthRefreshFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.post('/auth/logout', requireConfiguredAuth, async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || '').trim();
  if (!refreshToken) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'refreshToken is required.',
    });
  }

  try {
    await revokeRefreshToken(refreshToken);
    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({
      error: 'AuthLogoutFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.get('/auth/me', requireConfiguredAuth, requireAuth, async (req, res) => {
  try {
    const user = await getUserProfile(req.auth.sub);
    if (!user) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'User not found.',
      });
    }

    return res.json({ user });
  } catch (err) {
    return res.status(500).json({
      error: 'AuthProfileFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.get('/api-keys', requireConfiguredAuth, requireAdminOperator, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  try {
    const apiKeys = await listApiKeys();
    return res.json({ apiKeys: apiKeys.map(toApiKeyResponse) });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeysListFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.get('/api-keys/stats', requireConfiguredAuth, requireAdminOperator, async (_req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  try {
    const stats = await getApiKeyStats();
    return res.json({ stats });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyStatsFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.get('/audit-logs', requireConfiguredAuth, requireAdminOperator, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'AuditServiceNotConfigured',
      message: 'Audit service requires DATABASE_URL.',
    });
  }

  try {
    const logs = await listAuditLogs({
      action: req.query.action,
      resourceType: req.query.resourceType,
      resourceId: req.query.resourceId,
      actorUserId: req.query.actorUserId,
      actorApiKeyId: req.query.actorApiKeyId,
      partnerId: req.query.partnerId,
      limit: req.query.limit,
    });
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({
      error: 'AuditLogsFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.get('/api-keys/:id', requireConfiguredAuth, requireAdminOperator, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  try {
    const apiKey = await findApiKeyByIdentifier(req.params.id);
    if (!apiKey) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'API key not found.',
      });
    }
    return res.json({ apiKey: toApiKeyResponse(apiKey) });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyReadFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.post('/api-keys', requireConfiguredAuth, requireAdminOperator, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  const partnerId = String(req.body?.partnerId || '').trim();
  const name = String(req.body?.name || '').trim();

  if (!partnerId || !name) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'partnerId and name are required.',
    });
  }

  try {
    const created = await createApiKey({
      ownerUserId: req.auth.sub,
      partnerId,
      name,
      environment: req.body?.environment,
      role: req.body?.role,
      scopes: req.body?.scopes,
      notes: req.body?.notes,
      expiresAt: req.body?.expiresAt,
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
      apiKey: toApiKeyResponse(created.apiKey),
      secret: created.secret,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyCreateFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.post('/api-keys/:id/revoke', requireConfiguredAuth, requireAdminOperator, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  try {
    const existing = await findApiKeyByIdentifier(req.params.id);
    if (!existing) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'API key not found.',
      });
    }

    const revoked = await revokeApiKey(req.params.id);
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

    return res.json({ apiKey: toApiKeyResponse(revoked) });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyRevokeFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.post('/api-keys/:id/reactivate', requireConfiguredAuth, requireAdminOperator, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  try {
    const existing = await findApiKeyByIdentifier(req.params.id);
    if (!existing) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'API key not found.',
      });
    }

    const apiKey = await reactivateApiKey(req.params.id);
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

    return res.json({ apiKey: toApiKeyResponse(apiKey) });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyReactivateFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.post('/api-keys/:id/rotate', requireConfiguredAuth, requireAdminOperator, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  try {
    const rotated = await rotateApiKey(req.params.id);
    if (!rotated) {
      return res.status(404).json({
        error: 'NotFound',
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

    return res.json({
      previousApiKeyId: rotated.previousApiKeyId,
      apiKey: toApiKeyResponse(rotated.apiKey),
      secret: rotated.secret,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyRotateFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.patch('/api-keys/:id', requireConfiguredAuth, requireAdminOperator, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  try {
    const existing = await findApiKeyByIdentifier(req.params.id);
    if (!existing) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'API key not found.',
      });
    }

    const apiKey = await updateApiKey(req.params.id, {
      name: req.body?.name,
      role: req.body?.role,
      scopes: req.body?.scopes,
      notes: req.body?.notes,
      expiresAt: req.body?.expiresAt,
      isActive: req.body?.isActive,
    });

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

    return res.json({ apiKey: toApiKeyResponse(apiKey) });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyUpdateFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.get('/apartments', rateLimitMiddleware, requireApiKey, async (req, res) => {
  if (isLiveRequestRunning) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Another live onOffice sync is already running.',
    });
  }

  isLiveRequestRunning = true;
  const startedAt = new Date();

  try {
    const apartments = await fetchApartmentsLive();
    const finishedAt = new Date();

    res.setHeader('x-data-source', 'live-onoffice');
    return res.json({
      apartments,
      meta: {
        requestedBy: req.authActor.partnerId,
        authType: req.authActor.type,
        count: apartments.length,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: 'LiveFetchFailed',
      message: err.message || 'Unknown error',
    });
  } finally {
    isLiveRequestRunning = false;
  }
});

let isShuttingDown = false;

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
