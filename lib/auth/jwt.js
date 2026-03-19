'use strict';

const jwt = require('jsonwebtoken');

function getJwtConfig() {
  return {
    accessSecret: String(process.env.JWT_ACCESS_SECRET || '').trim(),
    accessTtl: String(process.env.JWT_ACCESS_TTL || '15m').trim(),
    issuer: String(process.env.JWT_ISSUER || 'hope-apartments-api').trim(),
    audience: String(process.env.JWT_AUDIENCE || 'hope-apartments-clients').trim(),
  };
}

function isJwtConfigured() {
  return Boolean(getJwtConfig().accessSecret);
}

function signAccessToken(payload) {
  const config = getJwtConfig();
  if (!config.accessSecret) {
    throw new Error('JWT is not configured. Missing JWT_ACCESS_SECRET.');
  }

  return jwt.sign(payload, config.accessSecret, {
    expiresIn: config.accessTtl,
    issuer: config.issuer,
    audience: config.audience,
  });
}

function verifyAccessToken(token) {
  const config = getJwtConfig();
  if (!config.accessSecret) {
    throw new Error('JWT is not configured. Missing JWT_ACCESS_SECRET.');
  }

  return jwt.verify(token, config.accessSecret, {
    issuer: config.issuer,
    audience: config.audience,
  });
}

module.exports = {
  getJwtConfig,
  isJwtConfigured,
  signAccessToken,
  verifyAccessToken,
};
