'use strict';

function serializeAuthSession(session) {
  if (!session) return null;

  return {
    accessToken: session.accessToken,
    tokenType: 'Bearer',
    expiresIn: session.accessTokenTtl,
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    refreshTokenTtlDays: session.refreshTokenTtlDays,
    user: session.user,
  };
}

module.exports = {
  serializeAuthSession,
};
