'use strict';

const { query } = require('../db');

async function createRefreshToken(userId, tokenHash, expiresAt) {
  await query(
    `
      insert into refresh_tokens (user_id, token_hash, expires_at)
      values ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt]
  );
}

async function findRefreshTokenByHash(tokenHash) {
  const result = await query(
    `
      select id, user_id, token_hash, expires_at, revoked_at, created_at
      from refresh_tokens
      where token_hash = $1
      limit 1
    `,
    [tokenHash]
  );

  return result.rows[0] || null;
}

async function revokeRefreshTokenById(tokenId) {
  await query(
    `
      update refresh_tokens
      set revoked_at = now()
      where id = $1 and revoked_at is null
    `,
    [tokenId]
  );
}

module.exports = {
  createRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshTokenById,
};
