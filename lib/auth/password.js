'use strict';

const bcrypt = require('bcryptjs');

function getPasswordConfig() {
  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  return {
    rounds: Number.isInteger(rounds) && rounds >= 8 ? rounds : 12,
  };
}

async function hashPassword(password) {
  return bcrypt.hash(password, getPasswordConfig().rounds);
}

async function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

module.exports = {
  getPasswordConfig,
  hashPassword,
  verifyPassword,
};
