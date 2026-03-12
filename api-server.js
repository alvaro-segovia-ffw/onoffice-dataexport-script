'use strict';

const crypto = require('crypto');
const express = require('express');
const path = require('path');
const { loginWithPassword, getUserProfile, isAuthConfigured } = require('./lib/auth-service');
const { verifyAccessToken } = require('./lib/jwt');
const { loadDotEnv } = require('./lib/load-dotenv');
const { fetchApartmentsLive } = require('./lib/apartment-export');

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
const DOCS_BASIC_AUTH_ENABLED = parseEnvBool(process.env.DOCS_BASIC_AUTH_ENABLED, DOCS_ENABLED);
const RATE_LIMIT_ENABLED = parseEnvBool(process.env.EXPORT_API_RATE_LIMIT_ENABLED, true);
const RATE_LIMIT_WINDOW_SEC = parseEnvPositiveInt(process.env.EXPORT_API_RATE_LIMIT_WINDOW_SEC, 60);
const RATE_LIMIT_MAX_REQUESTS = parseEnvPositiveInt(
  process.env.EXPORT_API_RATE_LIMIT_MAX_REQUESTS,
  60
);
const rateLimitState = new Map();
const DOCS_BASIC_AUTH_USER = String(process.env.DOCS_BASIC_AUTH_USER || '').trim();
const DOCS_BASIC_AUTH_PASSWORD = String(process.env.DOCS_BASIC_AUTH_PASSWORD || '');
const AUTH_ENABLED = isAuthConfigured();

function parseUsers(raw) {
  if (!raw) {
    throw new Error('Missing EXPORT_API_USERS env var. Provide a JSON array of users.');
  }

  let users;
  try {
    users = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid EXPORT_API_USERS JSON: ${err.message}`);
  }

  if (!Array.isArray(users) || users.length === 0) {
    throw new Error('EXPORT_API_USERS must be a non-empty JSON array.');
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

function safeCompare(a, b) {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

if (DOCS_ENABLED && DOCS_BASIC_AUTH_ENABLED) {
  if (!DOCS_BASIC_AUTH_USER || !DOCS_BASIC_AUTH_PASSWORD) {
    throw new Error(
      'Missing DOCS_BASIC_AUTH_USER / DOCS_BASIC_AUTH_PASSWORD while docs protection is enabled.'
    );
  }
}

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

function docsAvailabilityMiddleware(_req, res, next) {
  if (!DOCS_ENABLED) {
    return res.status(404).json({ error: 'NotFound', message: 'Documentation is disabled.' });
  }
  return next();
}

function docsBasicAuthMiddleware(req, res, next) {
  if (!DOCS_BASIC_AUTH_ENABLED) return next();

  const header = String(req.header('authorization') || '');
  if (!header.startsWith('Basic ')) {
    res.setHeader('www-authenticate', 'Basic realm="Hope Apartments Docs"');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing Basic Authorization header.',
    });
  }

  let decoded = '';
  try {
    decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  } catch (_err) {
    res.setHeader('www-authenticate', 'Basic realm="Hope Apartments Docs"');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid Basic Authorization header.',
    });
  }

  const separatorIndex = decoded.indexOf(':');
  const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : '';
  const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';

  if (!safeCompare(username, DOCS_BASIC_AUTH_USER) || !safeCompare(password, DOCS_BASIC_AUTH_PASSWORD)) {
    res.setHeader('www-authenticate', 'Basic realm="Hope Apartments Docs"');
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid docs credentials.' });
  }

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

function requireConfiguredAuth(_req, res, next) {
  if (!AUTH_ENABLED) {
    return res.status(503).json({
      error: 'AuthNotConfigured',
      message: 'Auth requires DATABASE_URL and JWT_ACCESS_SECRET.',
    });
  }
  return next();
}

function extractBearerToken(req) {
  const header = String(req.header('authorization') || '');
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

function jwtAuthMiddleware(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing Bearer token.',
    });
  }

  try {
    req.auth = verifyAccessToken(token);
    return next();
  } catch (err) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: err.message || 'Invalid access token.',
    });
  }
}

const app = express();
const playgroundDir = path.join(process.cwd(), 'playground', 'web');
const docsDir = path.join(process.cwd(), 'docs');
const swaggerUiPath = path.join(docsDir, 'swagger', 'index.html');
const openApiSpecPath = path.join(docsDir, 'openapi.json');

app.use(express.json());

if (ENABLE_PLAYGROUND) {
  app.use('/playground', express.static(playgroundDir));
  app.get('/playground', (_req, res) => {
    res.sendFile(path.join(playgroundDir, 'index.html'));
  });
}

app.get('/openapi.json', docsAvailabilityMiddleware, docsBasicAuthMiddleware, (_req, res) => {
  res.type('application/json');
  return res.sendFile(openApiSpecPath);
});

app.get('/docs', docsAvailabilityMiddleware, docsBasicAuthMiddleware, (_req, res) => {
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

app.get('/auth/me', requireConfiguredAuth, jwtAuthMiddleware, async (req, res) => {
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

app.get('/apartments', rateLimitMiddleware, authMiddleware, async (req, res) => {
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
        requestedBy: req.authUser.id,
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
  console.log(`Docs ${DOCS_ENABLED ? 'enabled' : 'disabled'}${DOCS_ENABLED && DOCS_BASIC_AUTH_ENABLED ? ' (Basic Auth protected)' : ''}`);
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
