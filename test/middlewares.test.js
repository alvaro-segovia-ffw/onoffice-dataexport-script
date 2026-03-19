'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { API_KEY_SCOPES } = require('../lib/api-keys/api-key-scopes');
const { parseCookieHeader } = require('../lib/cookies');
const {
  DEVELOPER_INTERNAL_PERMISSION_SET,
  FULL_INTERNAL_PERMISSION_SET,
  INTERNAL_PERMISSIONS,
  getPermissionsForRoles,
} = require('../src/server/authz/internal-permissions');
const { PublicError } = require('../src/server/errors/public-error');
const {
  adminCookieName,
  clearAdminSessionCookie,
  extractAdminToken,
  requireAdminOperator,
} = require('../src/server/middlewares/require-admin-operator');
const { DOCS_REQUIRED_PERMISSION } = require('../src/server/middlewares/docs-access');
const {
  requireConfiguredApiKeyService,
  requireConfiguredAuditService,
  requireConfiguredAuth,
} = require('../src/server/middlewares/require-configured-service');
const { errorHandler } = require('../src/server/middlewares/error-handler');
const { requirePermission } = require('../src/server/middlewares/require-permission');
const {
  getSourceOrigin,
  requireSameOrigin,
  requireSameOriginForCookieAuth,
} = require('../src/server/middlewares/require-same-origin');
const { requireRole } = require('../src/server/middlewares/require-role');
const { requireApiKeyScope } = require('../src/server/middlewares/require-api-key-scope');
const { createInMemoryRateLimit } = require('../src/server/middlewares/request-rate-limit');

function createResponseDouble() {
  return {
    statusCode: 200,
    payload: null,
    contentType: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
    type(value) {
      this.contentType = value;
      return this;
    },
    send(body) {
      this.payload = body;
      return this;
    },
  };
}

function createRequestDouble(overrides = {}) {
  return {
    method: 'GET',
    originalUrl: '/test',
    url: '/test',
    ip: '127.0.0.1',
    ...overrides,
  };
}

function runErrorHandler(err, req, res) {
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    errorHandler(err, req, res, () => {});
  } finally {
    console.error = originalConsoleError;
  }
}

async function runMiddleware(middleware, req, res) {
  return new Promise((resolve) => {
    middleware(req, res, (err) => resolve(err));
  });
}

test('requireRole allows matching roles', () => {
  const req = { auth: { roles: ['developer'] } };
  const res = createResponseDouble();
  let nextCalled = false;

  requireRole('admin', 'developer')(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('requireRole blocks non-matching roles', () => {
  const req = { auth: { roles: ['client'] } };
  const res = createResponseDouble();
  let forwardedError = null;

  requireRole('admin')(req, res, (err) => {
    forwardedError = err;
  });

  assert.equal(forwardedError instanceof PublicError, true);

  runErrorHandler(forwardedError, createRequestDouble(), res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.status, 'error');
  assert.equal(res.payload.code, 'FORBIDDEN');
  assert.equal(res.payload.message, 'Insufficient role.');
});

test('docs access now requires explicit internal permission', () => {
  assert.equal(DOCS_REQUIRED_PERMISSION, INTERNAL_PERMISSIONS.DOCS_READ_INTERNAL);
});

test('requireConfiguredAuth yields 503 when auth is not configured', () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousJwtSecret = process.env.JWT_ACCESS_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.JWT_ACCESS_SECRET;

  const res = createResponseDouble();
  let forwardedError = null;

  requireConfiguredAuth({}, res, (err) => {
    forwardedError = err;
  });

  assert.equal(forwardedError instanceof PublicError, true);
  assert.equal(forwardedError.code, 'AUTH_NOT_CONFIGURED');

  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (previousJwtSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
  else process.env.JWT_ACCESS_SECRET = previousJwtSecret;
});

test('requireConfiguredApiKeyService yields 503 when database is not configured', () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  const res = createResponseDouble();
  let forwardedError = null;

  requireConfiguredApiKeyService({}, res, (err) => {
    forwardedError = err;
  });

  assert.equal(forwardedError instanceof PublicError, true);
  assert.equal(forwardedError.code, 'API_KEY_SERVICE_NOT_CONFIGURED');

  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

test('requireConfiguredAuditService yields 503 when database is not configured', () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  const res = createResponseDouble();
  let forwardedError = null;

  requireConfiguredAuditService({}, res, (err) => {
    forwardedError = err;
  });

  assert.equal(forwardedError instanceof PublicError, true);
  assert.equal(forwardedError.code, 'AUDIT_SERVICE_NOT_CONFIGURED');

  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

test('extractAdminToken ignores cookie sessions when bearer auth is required', () => {
  const req = {
    header(name) {
      if (String(name).toLowerCase() === 'authorization') return '';
      return '';
    },
    headers: {
      cookie: `${adminCookieName}=session-token`,
    },
  };

  assert.equal(extractAdminToken(req), 'session-token');
  assert.equal(extractAdminToken(req, { allowCookie: false }), null);
});

test('clearAdminSessionCookie expires the admin session cookie', () => {
  const res = createResponseDouble();
  clearAdminSessionCookie(res);

  assert.match(String(res.headers['set-cookie'] || ''), /hope_admin_session=/);
  assert.match(String(res.headers['set-cookie'] || ''), /Max-Age=0/);
});

test('parseCookieHeader ignores malformed cookie encoding', () => {
  assert.doesNotThrow(() => parseCookieHeader('good=value; broken=%E0%A4%A'));
  assert.deepEqual(parseCookieHeader('good=value; broken=%E0%A4%A'), {
    good: 'value',
  });
});

test('requireSameOrigin allows same-host origin and rejects cross-origin requests', () => {
  const allowedReq = {
    header(name) {
      const normalized = String(name).toLowerCase();
      if (normalized === 'origin') return 'https://admin.example.com';
      if (normalized === 'host') return 'admin.example.com';
      return '';
    },
  };
  const blockedReq = {
    header(name) {
      const normalized = String(name).toLowerCase();
      if (normalized === 'origin') return 'https://evil.example.com';
      if (normalized === 'host') return 'admin.example.com';
      return '';
    },
  };

  let allowedNextCalled = false;
  let blockedError = null;

  requireSameOrigin(allowedReq, createResponseDouble(), (err) => {
    assert.equal(err, undefined);
    allowedNextCalled = true;
  });

  requireSameOrigin(blockedReq, createResponseDouble(), (err) => {
    blockedError = err;
  });

  assert.equal(allowedNextCalled, true);
  assert.equal(blockedError instanceof PublicError, true);
  assert.equal(blockedError.message, 'Cross-origin request blocked.');
});

test('getSourceOrigin falls back to referer origin', () => {
  const req = {
    header(name) {
      const normalized = String(name).toLowerCase();
      if (normalized === 'referer') return 'https://admin.example.com/dashboard';
      return '';
    },
  };

  assert.equal(getSourceOrigin(req)?.origin, 'https://admin.example.com');
});

test('requireSameOriginForCookieAuth only checks cookie-authenticated admin requests', () => {
  const bearerReq = {
    adminAuth: { authMethod: 'bearer' },
    header() {
      return '';
    },
  };
  const cookieReq = {
    adminAuth: { authMethod: 'cookie' },
    header(name) {
      const normalized = String(name).toLowerCase();
      if (normalized === 'host') return 'admin.example.com';
      return '';
    },
  };

  let bearerNextCalled = false;
  let cookieError = null;

  requireSameOriginForCookieAuth(bearerReq, createResponseDouble(), (err) => {
    assert.equal(err, undefined);
    bearerNextCalled = true;
  });

  requireSameOriginForCookieAuth(cookieReq, createResponseDouble(), (err) => {
    cookieError = err;
  });

  assert.equal(bearerNextCalled, true);
  assert.equal(cookieError instanceof PublicError, true);
});

test('admin role resolves the full internal permission set', () => {
  assert.deepEqual(getPermissionsForRoles(['admin']), FULL_INTERNAL_PERMISSION_SET);
});

test('developer role is restricted to read-oriented internal permissions', () => {
  assert.deepEqual(getPermissionsForRoles(['developer']), DEVELOPER_INTERNAL_PERMISSION_SET);
  assert.equal(
    getPermissionsForRoles(['developer']).includes(INTERNAL_PERMISSIONS.DOCS_READ_INTERNAL),
    true
  );
  assert.equal(
    getPermissionsForRoles(['developer']).includes(INTERNAL_PERMISSIONS.API_KEYS_READ),
    true
  );
  assert.equal(
    getPermissionsForRoles(['developer']).includes(INTERNAL_PERMISSIONS.AUDIT_LOGS_READ),
    true
  );
  assert.equal(
    getPermissionsForRoles(['developer']).includes(INTERNAL_PERMISSIONS.API_KEYS_CREATE),
    false
  );
  assert.equal(
    getPermissionsForRoles(['developer']).includes(INTERNAL_PERMISSIONS.API_KEYS_UPDATE),
    false
  );
  assert.equal(
    getPermissionsForRoles(['developer']).includes(INTERNAL_PERMISSIONS.API_KEYS_ROTATE),
    false
  );
  assert.equal(
    getPermissionsForRoles(['developer']).includes(INTERNAL_PERMISSIONS.API_KEYS_REVOKE),
    false
  );
  assert.equal(
    getPermissionsForRoles(['developer']).includes(INTERNAL_PERMISSIONS.API_KEYS_DELETE),
    false
  );
});

test('requirePermission allows user with required permission', () => {
  const req = {
    adminAuth: {
      user: {
        roles: ['admin'],
      },
    },
  };
  const res = createResponseDouble();
  let nextCalled = false;

  requirePermission(INTERNAL_PERMISSIONS.API_KEYS_CREATE)(req, res, (err) => {
    assert.equal(err, undefined);
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(Array.isArray(req.internalPermissions), true);
  assert.equal(req.internalPermissions.includes(INTERNAL_PERMISSIONS.API_KEYS_CREATE), true);
});

test('requirePermission allows developer to read internal docs and audit logs', () => {
  const docsReq = {
    adminAuth: {
      user: {
        roles: ['developer'],
      },
    },
  };
  const auditReq = {
    adminAuth: {
      user: {
        roles: ['developer'],
      },
    },
  };
  const docsRes = createResponseDouble();
  const auditRes = createResponseDouble();
  let docsNextCalled = false;
  let auditNextCalled = false;

  requirePermission(INTERNAL_PERMISSIONS.DOCS_READ_INTERNAL)(docsReq, docsRes, (err) => {
    assert.equal(err, undefined);
    docsNextCalled = true;
  });
  requirePermission(INTERNAL_PERMISSIONS.AUDIT_LOGS_READ)(auditReq, auditRes, (err) => {
    assert.equal(err, undefined);
    auditNextCalled = true;
  });

  assert.equal(docsNextCalled, true);
  assert.equal(auditNextCalled, true);
});

test('requirePermission blocks developer from API key write operations', () => {
  const req = {
    adminAuth: {
      user: {
        roles: ['developer'],
      },
    },
  };
  const res = createResponseDouble();
  let forwardedError = null;

  requirePermission(INTERNAL_PERMISSIONS.API_KEYS_CREATE)(req, res, (err) => {
    forwardedError = err;
  });

  assert.equal(forwardedError instanceof PublicError, true);

  runErrorHandler(forwardedError, createRequestDouble({ originalUrl: '/api-keys' }), res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, {
    status: 'error',
    code: 'FORBIDDEN',
    message: 'Insufficient permission.',
  });
});

test('requirePermission blocks user without permission and yields 403', () => {
  const req = {
    auth: {
      roles: ['client'],
    },
  };
  const res = createResponseDouble();
  let forwardedError = null;

  requirePermission(INTERNAL_PERMISSIONS.AUDIT_LOGS_READ)(req, res, (err) => {
    forwardedError = err;
  });

  assert.equal(forwardedError instanceof PublicError, true);

  runErrorHandler(forwardedError, createRequestDouble({ originalUrl: '/audit-logs' }), res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, {
    status: 'error',
    code: 'FORBIDDEN',
    message: 'Insufficient permission.',
  });
});

test('in-memory rate limit blocks requests beyond configured max', () => {
  const middleware = createInMemoryRateLimit({
    enabled: true,
    windowSec: 60,
    maxRequests: 2,
    keyBuilder: (req) => req.ip,
    errorCode: 'TooManyLoginAttempts',
  });

  const req = { ip: '127.0.0.1' };
  const res1 = createResponseDouble();
  const res2 = createResponseDouble();
  const res3 = createResponseDouble();
  let nextCalls = 0;
  let rateLimitError = null;

  middleware(req, res1, () => {
    nextCalls += 1;
  });
  middleware(req, res2, () => {
    nextCalls += 1;
  });
  middleware(req, res3, (err) => {
    if (err) {
      rateLimitError = err;
      return;
    }
    nextCalls += 1;
  });

  assert.equal(nextCalls, 2);
  assert.equal(rateLimitError instanceof PublicError, true);

  runErrorHandler(rateLimitError, createRequestDouble(), res3);

  assert.equal(res3.statusCode, 429);
  assert.equal(res3.payload.code, 'TooManyLoginAttempts');
  assert.ok(res3.headers['retry-after']);
});

function createApiKeyScopeRequest(scopes = []) {
  return {
    ip: '127.0.0.1',
    method: 'GET',
    originalUrl: '/apartments',
    apiKey: {
      id: 'key-1',
      partnerId: 'partner-a',
      keyPrefix: 'hop_live_abc123def456',
      scopes,
    },
    authActor: {
      id: 'key-1',
      partnerId: 'partner-a',
      scopes,
    },
    header(name) {
      if (String(name).toLowerCase() === 'user-agent') return 'test-agent';
      return null;
    },
  };
}

test('requireApiKeyScope allows a valid key with the required scope', async () => {
  const middleware = requireApiKeyScope(API_KEY_SCOPES.APARTMENTS_READ, {
    auditLogWriter: async () => {
      throw new Error('audit should not be called');
    },
  });

  const req = createApiKeyScopeRequest([API_KEY_SCOPES.APARTMENTS_READ]);
  const res = createResponseDouble();
  let nextCalled = false;

  await middleware(req, res, (err) => {
    assert.equal(err, undefined);
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload, null);
});

test('requireApiKeyScope rejects a valid key without the required scope and records scope denial', async () => {
  const auditEntries = [];
  const middleware = requireApiKeyScope(API_KEY_SCOPES.APARTMENTS_READ, {
    auditLogWriter: async (entry) => {
      auditEntries.push(entry);
    },
  });

  const req = createApiKeyScopeRequest([]);
  const res = createResponseDouble();
  let forwardedError = null;

  await middleware(req, res, (err) => {
    forwardedError = err;
  });

  assert.equal(forwardedError instanceof PublicError, true);

  runErrorHandler(forwardedError, req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.status, 'error');
  assert.equal(res.payload.code, 'FORBIDDEN');
  assert.equal(res.payload.message, `Missing required API key scope: ${API_KEY_SCOPES.APARTMENTS_READ}.`);
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0].action, 'api_key_scope_denied');
  assert.equal(auditEntries[0].metadata.requiredScope, API_KEY_SCOPES.APARTMENTS_READ);
  assert.equal(auditEntries[0].metadata.enforced, true);
});

test('requireApiKeyScope allows a valid key with any accepted apartment subtype scope', async () => {
  const middleware = requireApiKeyScope(
    [API_KEY_SCOPES.APARTMENTS_READ, API_KEY_SCOPES.APARTMENTS_RENTAL_READ],
    {
      match: 'any',
      auditLogWriter: async () => {
        throw new Error('audit should not be called');
      },
    }
  );

  const req = createApiKeyScopeRequest([API_KEY_SCOPES.APARTMENTS_RENTAL_READ]);
  const res = createResponseDouble();
  let nextCalled = false;

  await middleware(req, res, (err) => {
    assert.equal(err, undefined);
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload, null);
});

test('requireApiKeyScope rejects when none of the accepted apartment subtype scopes are present', async () => {
  const auditEntries = [];
  const middleware = requireApiKeyScope(
    [API_KEY_SCOPES.APARTMENTS_READ, API_KEY_SCOPES.APARTMENTS_SALE_READ],
    {
      match: 'any',
      auditRequiredScope: 'apartments:read|apartments:sale:read',
      auditLogWriter: async (entry) => {
        auditEntries.push(entry);
      },
    }
  );

  const req = createApiKeyScopeRequest([API_KEY_SCOPES.APARTMENTS_RENTAL_READ]);
  const res = createResponseDouble();
  let forwardedError = null;

  await middleware(req, res, (err) => {
    forwardedError = err;
  });

  assert.equal(forwardedError instanceof PublicError, true);

  runErrorHandler(forwardedError, req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.status, 'error');
  assert.equal(res.payload.code, 'FORBIDDEN');
  assert.equal(
    res.payload.message,
    `Missing required API key scope: ${API_KEY_SCOPES.APARTMENTS_READ} or ${API_KEY_SCOPES.APARTMENTS_SALE_READ}.`
  );
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0].metadata.requiredScope, 'apartments:read|apartments:sale:read');
  assert.deepEqual(auditEntries[0].metadata.scopes, [API_KEY_SCOPES.APARTMENTS_RENTAL_READ]);
});

test('requireAdminOperator clears invalid admin session cookie for stale cookie auth', async () => {
  const previousJwtSecret = process.env.JWT_ACCESS_SECRET;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.JWT_ACCESS_SECRET = 'test-secret';
  process.env.DATABASE_URL = 'postgres://configured.example/test';

  const req = {
    headers: {
      cookie: `${adminCookieName}=stale-token`,
    },
    header(name) {
      const normalized = String(name).toLowerCase();
      if (normalized === 'authorization') return '';
      return '';
    },
  };
  const res = createResponseDouble();
  const forwardedError = await runMiddleware(requireAdminOperator, req, res);

  assert.equal(forwardedError instanceof PublicError, true);
  assert.equal(forwardedError.statusCode, 401);
  assert.match(String(res.headers['set-cookie'] || ''), /Max-Age=0/);

  if (previousJwtSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
  else process.env.JWT_ACCESS_SECRET = previousJwtSecret;
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

test('errorHandler serializes PublicError with safe public fields', () => {
  const req = createRequestDouble({ method: 'POST', originalUrl: '/api-keys' });
  const res = createResponseDouble();
  const err = new PublicError({
    statusCode: 400,
    code: 'INVALID_SCOPES',
    message: 'Invalid API key scopes.',
  });

  runErrorHandler(err, req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, {
    status: 'error',
    code: 'INVALID_SCOPES',
    message: 'Invalid API key scopes.',
  });
});

test('errorHandler does not log expected public 4xx errors', () => {
  const req = createRequestDouble({ method: 'GET', originalUrl: '/admin/session' });
  const res = createResponseDouble();
  let consoleCalls = 0;
  const originalConsoleError = console.error;
  console.error = () => {
    consoleCalls += 1;
  };

  try {
    errorHandler(
      new PublicError({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid access token.',
      }),
      req,
      res,
      () => {}
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(consoleCalls, 0);
  assert.equal(res.statusCode, 401);
});

test('errorHandler hides internal details for generic errors', () => {
  const req = createRequestDouble({ method: 'GET', originalUrl: '/apartments' });
  const res = createResponseDouble();
  const err = new Error('database connection exploded');
  err.stack = 'very sensitive stack trace';

  runErrorHandler(err, req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.payload, {
    status: 'error',
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
  assert.equal(JSON.stringify(res.payload).includes('database connection exploded'), false);
  assert.equal(JSON.stringify(res.payload).includes('very sensitive stack trace'), false);
});

test('errorHandler serves an html error page for browser 404 requests', () => {
  const req = createRequestDouble({
    method: 'GET',
    originalUrl: '/missing-page',
    headers: {
      accept: 'text/html,application/xhtml+xml',
    },
  });
  const res = createResponseDouble();
  const err = new PublicError({
    statusCode: 404,
    code: 'NOT_FOUND',
    message: 'Not found.',
  });

  runErrorHandler(err, req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.contentType, 'html');
  assert.match(String(res.payload), /Page Not Found/);
  assert.match(String(res.payload), /\/missing-page/);
});

test('errorHandler keeps json responses for api requests with generic accept headers', () => {
  const req = createRequestDouble({
    method: 'GET',
    originalUrl: '/api-keys',
    headers: {
      accept: '*/*',
    },
  });
  const res = createResponseDouble();
  const err = new PublicError({
    statusCode: 403,
    code: 'FORBIDDEN',
    message: 'Forbidden.',
  });

  runErrorHandler(err, req, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.payload, {
    status: 'error',
    code: 'FORBIDDEN',
    message: 'Forbidden.',
  });
});
