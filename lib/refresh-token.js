'use strict';

const crypto = require('crypto');

function parsePositiveInt(raw, fallback) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getRefreshTokenConfig() {
  return {
    ttlDays: parsePositiveInt(process.env.AUTH_REFRESH_TOKEN_TTL_DAYS, 30),
  };
}

function buildRefreshTokenExpiry(now = new Date()) {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + getRefreshTokenConfig().ttlDays);
  return expiresAt;
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

module.exports = {
  buildRefreshTokenExpiry,
  generateRefreshToken,
  getRefreshTokenConfig,
  hashRefreshToken,
};
