'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { API_KEY_SCOPES } = require('../lib/api-key-scopes');
const { PublicError } = require('../src/server/errors/public-error');
const { DOCS_ALLOWED_ROLES } = require('../middlewares/docs-access');
const { errorHandler } = require('../src/server/middlewares/error-handler');
const { requireRole } = require('../middlewares/require-role');
const { requireApiKeyScope } = require('../src/server/middlewares/require-api-key-scope');
const { createInMemoryRateLimit } = require('../src/server/middlewares/request-rate-limit');

function createResponseDouble() {
  return {
    statusCode: 200,
    payload: null,
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

test('docs access no longer allows client role', () => {
  assert.deepEqual(DOCS_ALLOWED_ROLES, ['admin', 'developer']);
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
