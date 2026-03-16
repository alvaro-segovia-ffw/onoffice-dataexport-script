'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { DOCS_ALLOWED_ROLES } = require('../middlewares/docs-access');
const { requireRole } = require('../middlewares/require-role');
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
