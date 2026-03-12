'use strict';

const { Pool } = require('pg');

let pool = null;

function parseEnvBool(raw, fallback) {
  if (raw === undefined) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function getDatabaseConfig() {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  const sslEnabled = parseEnvBool(process.env.DATABASE_SSL, process.env.NODE_ENV === 'production');

  return {
    connectionString,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  };
}

function isDatabaseConfigured() {
  return Boolean(getDatabaseConfig().connectionString);
}

function getPool() {
  if (!isDatabaseConfigured()) {
    throw new Error('Database is not configured. Missing DATABASE_URL.');
  }

  if (!pool) {
    const config = getDatabaseConfig();
    pool = new Pool({
      connectionString: config.connectionString,
      ssl: config.ssl,
    });
  }

  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

module.exports = {
  getDatabaseConfig,
  getPool,
  isDatabaseConfigured,
  query,
};
