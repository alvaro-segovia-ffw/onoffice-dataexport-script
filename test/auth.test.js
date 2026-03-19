'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { userHasAdminConsoleAccess } = require('../lib/admin/admin-access');
const { hashPassword, verifyPassword } = require('../lib/auth/password');
const { getJwtConfig, signAccessToken, verifyAccessToken } = require('../lib/auth/jwt');
const {
  buildRefreshTokenExpiry,
  generateRefreshToken,
  getRefreshTokenConfig,
  hashRefreshToken,
} = require('../lib/auth/refresh-token');

test('password helpers hash and verify passwords', async () => {
  const hash = await hashPassword('S3cret!');

  assert.notEqual(hash, 'S3cret!');
  assert.equal(await verifyPassword('S3cret!', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('jwt helpers sign and verify access tokens', () => {
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const previousTtl = process.env.JWT_ACCESS_TTL;

  process.env.JWT_ACCESS_SECRET = 'test-secret';
  process.env.JWT_ACCESS_TTL = '15m';

  const token = signAccessToken({ sub: 'user-1', roles: ['admin'] });
  const payload = verifyAccessToken(token);

  assert.equal(payload.sub, 'user-1');
  assert.deepEqual(payload.roles, ['admin']);
  assert.equal(getJwtConfig().accessTtl, '15m');

  if (previousSecret === undefined) {
    delete process.env.JWT_ACCESS_SECRET;
  } else {
    process.env.JWT_ACCESS_SECRET = previousSecret;
  }

  if (previousTtl === undefined) {
    delete process.env.JWT_ACCESS_TTL;
  } else {
    process.env.JWT_ACCESS_TTL = previousTtl;
  }
});

test('userHasAdminConsoleAccess allows admin and developer roles only', () => {
  assert.equal(userHasAdminConsoleAccess({ roles: ['admin'] }), true);
  assert.equal(userHasAdminConsoleAccess({ roles: ['developer'] }), true);
  assert.equal(userHasAdminConsoleAccess({ roles: ['client'] }), false);
});

test('refresh token helpers generate hashable tokens and support ttl override', () => {
  const previousTtlDays = process.env.AUTH_REFRESH_TOKEN_TTL_DAYS;
  process.env.AUTH_REFRESH_TOKEN_TTL_DAYS = '14';

  const token = generateRefreshToken();
  const hashA = hashRefreshToken(token);
  const hashB = hashRefreshToken(token);
  const expiry = buildRefreshTokenExpiry(new Date('2026-03-13T00:00:00.000Z'));

  assert.ok(token.length > 20);
  assert.equal(hashA, hashB);
  assert.equal(hashA.length, 64);
  assert.equal(getRefreshTokenConfig().ttlDays, 14);
  assert.equal(expiry.toISOString(), '2026-03-27T00:00:00.000Z');

  if (previousTtlDays === undefined) {
    delete process.env.AUTH_REFRESH_TOKEN_TTL_DAYS;
  } else {
    process.env.AUTH_REFRESH_TOKEN_TTL_DAYS = previousTtlDays;
  }
});
