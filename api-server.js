'use strict';

const express = require('express');
const path = require('path');
const { loginWithPassword, getUserProfile, isAuthConfigured } = require('./lib/auth-service');
const {
  createApiKey,
  findApiKeyById,
  isApiKeyServiceConfigured,
  listApiKeys,
  reactivateApiKey,
  revokeApiKey,
  rotateApiKey,
  updateApiKey,
} = require('./lib/api-key-service');
const { writeAuditLog } = require('./lib/audit-service');
const { loadDotEnv } = require('./lib/load-dotenv');
const { fetchApartmentsLive } = require('./lib/apartment-export');
const { safeCompare } = require('./lib/safe-compare');
const { docsAvailabilityMiddleware, requireDocsAccess } = require('./middlewares/docs-access');
const { requireConfiguredAuth } = require('./middlewares/require-configured-auth');
const { requireAuth } = require('./middlewares/require-auth');
const { requireLegacyOrApiKeyAuth } = require('./middlewares/require-legacy-or-api-key-auth');
const { requireRole } = require('./middlewares/require-role');

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

const ENABLE_PLAYGROUND = parseEnvBool(process.env.EXPORT_API_ENABLE_PLAYGROUND, !IS_PRODUCTION);
const DOCS_ENABLED = parseEnvBool(process.env.DOCS_ENABLED, !IS_PRODUCTION);
const RATE_LIMIT_ENABLED = parseEnvBool(process.env.EXPORT_API_RATE_LIMIT_ENABLED, true);
const RATE_LIMIT_WINDOW_SEC = parseEnvPositiveInt(process.env.EXPORT_API_RATE_LIMIT_WINDOW_SEC, 60);
const RATE_LIMIT_MAX_REQUESTS = parseEnvPositiveInt(
  process.env.EXPORT_API_RATE_LIMIT_MAX_REQUESTS,
  60
);
const rateLimitState = new Map();
const AUTH_ENABLED = isAuthConfigured();

function parseUsers(raw) {
  if (!raw) {
    return new Map();
  }

  let users;
  try {
    users = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid EXPORT_API_USERS JSON: ${err.message}`);
  }

  if (!Array.isArray(users) || users.length === 0) {
    return new Map();
  }

  const byToken = new Map();
  for (const entry of users) {
    const id = String(entry?.id || '');
    const token = String(entry?.token || '');
    const secret = String(entry?.secret || '');

    if (!id || !token || !secret) {
      throw new Error('Each EXPORT_API_USERS item requires id, token and secret.');
    }
    if (byToken.has(token)) {
      throw new Error(`Duplicated token in EXPORT_API_USERS: ${token}`);
    }
    byToken.set(token, { id, token, secret });
  }

  return byToken;
}

const usersByToken = parseUsers(process.env.EXPORT_API_USERS);

function authMiddleware(req, res, next) {
  const token = String(req.header('x-api-token') || '').trim();
  const secret = String(req.header('x-api-secret') || '').trim();

  if (!token || !secret) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing x-api-token or x-api-secret headers.',
    });
  }

  const user = usersByToken.get(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token.' });
  }

  if (!safeCompare(user.secret, secret)) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid secret.' });
  }

  req.authUser = { id: user.id, token: user.token };
  return next();
}

function buildRateLimitKey(req) {
  const token = String(req.header('x-api-token') || '').trim();
  if (token) return `token:${token}`;
  return `ip:${req.ip || 'unknown'}`;
}

function rateLimitMiddleware(req, res, next) {
  if (!RATE_LIMIT_ENABLED) return next();

  const nowMs = Date.now();
  const windowMs = RATE_LIMIT_WINDOW_SEC * 1000;
  const windowStart = Math.floor(nowMs / windowMs) * windowMs;
  const key = buildRateLimitKey(req);
  const current = rateLimitState.get(key);

  const entry =
    current && current.windowStart === windowStart
      ? current
      : { windowStart, count: 0 };

  entry.count += 1;
  rateLimitState.set(key, entry);

  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count);
  const resetSec = Math.ceil((windowStart + windowMs - nowMs) / 1000);

  res.setHeader('x-ratelimit-limit', String(RATE_LIMIT_MAX_REQUESTS));
  res.setHeader('x-ratelimit-remaining', String(remaining));
  res.setHeader('x-ratelimit-reset', String(resetSec));

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    res.setHeader('retry-after', String(resetSec));
    return res.status(429).json({
      error: 'TooManyRequests',
      message: `Rate limit exceeded. Max ${RATE_LIMIT_MAX_REQUESTS} requests per ${RATE_LIMIT_WINDOW_SEC}s.`,
    });
  }

  return next();
}

const app = express();
const playgroundDir = path.join(process.cwd(), 'playground', 'web');
const docsDir = path.join(process.cwd(), 'docs');
const swaggerUiPath = path.join(docsDir, 'swagger', 'index.html');
const openApiSpecPath = path.join(docsDir, 'openapi.json');
const requireDocsAvailability = docsAvailabilityMiddleware(DOCS_ENABLED);
const requirePartnerAccess = requireLegacyOrApiKeyAuth(authMiddleware);
const requireApiKeyAdmin = [requireConfiguredAuth, requireAuth, requireRole('admin', 'developer')];

app.use(express.json());

if (ENABLE_PLAYGROUND) {
  app.use('/playground', express.static(playgroundDir));
  app.get('/playground', (_req, res) => {
    res.sendFile(path.join(playgroundDir, 'index.html'));
  });
}

app.get('/openapi.json', requireDocsAvailability, requireConfiguredAuth, requireDocsAccess, (_req, res) => {
  res.type('application/json');
  return res.sendFile(openApiSpecPath);
});

app.get('/docs', requireDocsAvailability, requireConfiguredAuth, requireDocsAccess, (_req, res) => {
  return res.sendFile(swaggerUiPath);
});

app.get('/health', (_req, res) => {
  return res.json({
    status: 'ok',
    uptimeSec: Math.floor(process.uptime()),
    now: new Date().toISOString(),
    authEnabled: AUTH_ENABLED,
  });
});

app.post('/auth/login', requireConfiguredAuth, async (req, res) => {
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
      user: session.user,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'AuthLoginFailed',
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

app.get('/api-keys', ...requireApiKeyAdmin, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  try {
    const apiKeys = await listApiKeys();
    return res.json({ apiKeys });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeysListFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.get('/api-keys/:id', ...requireApiKeyAdmin, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  try {
    const apiKey = await findApiKeyById(req.params.id);
    if (!apiKey) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'API key not found.',
      });
    }
    return res.json({ apiKey });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyReadFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.post('/api-keys', ...requireApiKeyAdmin, async (req, res) => {
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

    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyCreateFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.post('/api-keys/:id/revoke', ...requireApiKeyAdmin, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  try {
    const existing = await findApiKeyById(req.params.id);
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

    return res.json({ apiKey: revoked });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyRevokeFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.post('/api-keys/:id/reactivate', ...requireApiKeyAdmin, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  try {
    const existing = await findApiKeyById(req.params.id);
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

    return res.json({ apiKey });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyReactivateFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.post('/api-keys/:id/rotate', ...requireApiKeyAdmin, async (req, res) => {
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

    return res.json(rotated);
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyRotateFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.patch('/api-keys/:id', ...requireApiKeyAdmin, async (req, res) => {
  if (!isApiKeyServiceConfigured()) {
    return res.status(503).json({
      error: 'ApiKeyServiceNotConfigured',
      message: 'API key service requires DATABASE_URL.',
    });
  }

  try {
    const existing = await findApiKeyById(req.params.id);
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

    return res.json({ apiKey });
  } catch (err) {
    return res.status(500).json({
      error: 'ApiKeyUpdateFailed',
      message: err.message || 'Unknown error',
    });
  }
});

app.get('/apartments', rateLimitMiddleware, requirePartnerAccess, async (req, res) => {
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
        requestedBy: req.authActor?.partnerId || req.authUser.id,
        authType: req.authActor?.type || 'legacy',
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
  console.log(
    `Playground ${ENABLE_PLAYGROUND ? 'enabled' : 'disabled'} (NODE_ENV=${process.env.NODE_ENV || 'development'})`
  );
  console.log(`Docs ${DOCS_ENABLED ? 'enabled' : 'disabled'}${DOCS_ENABLED ? ' (JWT + roles protected)' : ''}`);
  console.log(`App auth ${AUTH_ENABLED ? 'enabled' : 'disabled'}${AUTH_ENABLED ? ' (database + JWT)' : ''}`);
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
