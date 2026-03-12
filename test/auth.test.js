'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { hashPassword, verifyPassword } = require('../lib/password');
const { getJwtConfig, signAccessToken, verifyAccessToken } = require('../lib/jwt');

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
