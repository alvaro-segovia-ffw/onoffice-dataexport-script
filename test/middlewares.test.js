'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { API_KEY_SCOPES } = require('../lib/api-key-scopes');
const { DOCS_ALLOWED_ROLES } = require('../middlewares/docs-access');
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
  let nextCalled = false;

  requireRole('admin')(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.error, 'Forbidden');
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

  middleware(req, res1, () => {
    nextCalls += 1;
  });
  middleware(req, res2, () => {
    nextCalls += 1;
  });
  middleware(req, res3, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 2);
  assert.equal(res3.statusCode, 429);
  assert.equal(res3.payload.error, 'TooManyLoginAttempts');
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

  await middleware(req, res, () => {
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
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.error, 'Forbidden');
  assert.equal(res.payload.message, `Missing required API key scope: ${API_KEY_SCOPES.APARTMENTS_READ}.`);
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0].action, 'api_key_scope_denied');
  assert.equal(auditEntries[0].metadata.requiredScope, API_KEY_SCOPES.APARTMENTS_READ);
  assert.equal(auditEntries[0].metadata.enforced, true);
});
