'use strict';

const { getPool, isDatabaseConfigured, query } = require('./db');
const { generateApiKey, hashApiKey, normalizeApiKeyEnvironment, parseApiKey } = require('./api-key');
const { validateApiKeyScopes } = require('./api-key-scopes');
const { safeCompare } = require('./safe-compare');

function isApiKeyServiceConfigured() {
  return isDatabaseConfigured();
}

function mapApiKeyRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    publicId: row.key_prefix,
    ownerUserId: row.owner_user_id ?? row.user_id ?? null,
    partnerId: row.partner_id ?? null,
    name: row.name,
    environment: row.environment ?? 'live',
    keyPrefix: row.key_prefix,
    role: row.role ?? row.role_code ?? 'client',
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    notes: row.notes ?? null,
    isActive: row.is_active ?? row.revoked_at === null,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

async function createApiKey(input) {
  const partnerId = String(input.partnerId || '').trim();
  const name = String(input.name || '').trim();
  const role = String(input.role || 'client').trim() || 'client';
  const scopes = validateApiKeyScopes(input.scopes, { required: true });

  if (!partnerId) throw new Error('partnerId is required.');
  if (!name) throw new Error('name is required.');

  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const generated = generateApiKey({ environment: input.environment });
  const sql = `
    insert into api_keys (
      owner_user_id,
      partner_id,
      name,
      environment,
      key_prefix,
      key_hash,
      role,
      scopes,
      notes,
      is_active,
      expires_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, true, $10)
    returning
      id,
      owner_user_id,
      partner_id,
      name,
      environment,
      key_prefix,
      role,
      scopes,
      notes,
      is_active,
      last_used_at,
      expires_at,
      revoked_at,
      created_at
  `;

  const params = [
    input.ownerUserId || null,
    partnerId,
    name,
    normalizeApiKeyEnvironment(input.environment),
    generated.keyPrefix,
    generated.keyHash,
    role,
    JSON.stringify(scopes),
    input.notes ? String(input.notes) : null,
    input.expiresAt || null,
  ];

  const result = await query(sql, params);

  return {
    apiKey: mapApiKeyRow(result.rows[0]),
    secret: generated.rawKey,
  };
}

async function listApiKeys() {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const sql = `
    select
      id,
      owner_user_id,
      partner_id,
      name,
      environment,
      key_prefix,
      role,
      scopes,
      notes,
      is_active,
      last_used_at,
      expires_at,
      revoked_at,
      created_at
    from api_keys
    order by created_at desc
  `;
  const result = await query(sql);
  return result.rows.map(mapApiKeyRow);
}

async function findApiKeyById(id) {
  const sql = `
    select
      id,
      owner_user_id,
      partner_id,
      name,
      environment,
      key_prefix,
      role,
      scopes,
      notes,
      is_active,
      last_used_at,
      expires_at,
      revoked_at,
      created_at
    from api_keys
    where id = $1
  `;
  const result = await query(sql, [id]);
  return mapApiKeyRow(result.rows[0] || null);
}

async function findApiKeyByIdentifier(identifier) {
  const sql = `
    select
      id,
      owner_user_id,
      partner_id,
      name,
      environment,
      key_prefix,
      role,
      scopes,
      notes,
      is_active,
      last_used_at,
      expires_at,
      revoked_at,
      created_at
    from api_keys
    where id::text = $1 or key_prefix = $1
    limit 1
  `;
  const result = await query(sql, [String(identifier || '').trim()]);
  return mapApiKeyRow(result.rows[0] || null);
}

async function findStoredApiKeyByPrefix(keyPrefix) {
  const sql = `
    select
      id,
      owner_user_id,
      partner_id,
      name,
      environment,
      key_prefix,
      key_hash,
      role,
      scopes,
      notes,
      is_active,
      last_used_at,
      expires_at,
      revoked_at,
      created_at
    from api_keys
    where key_prefix = $1
    limit 1
  `;
  const result = await query(sql, [keyPrefix]);
  return result.rows[0] || null;
}

function isApiKeyUsable(row, now = new Date()) {
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.is_active === false) return { ok: false, reason: 'inactive' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, reason: 'active' };
}

async function touchApiKeyLastUsed(apiKeyId) {
  await query('update api_keys set last_used_at = now() where id = $1', [apiKeyId]);
}

async function verifyApiKey(rawKey) {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const parsed = parseApiKey(rawKey);
  if (!parsed) {
    return { ok: false, reason: 'invalid_format' };
  }

  const row = await findStoredApiKeyByPrefix(parsed.keyPrefix);
  const usable = isApiKeyUsable(row);
  if (!usable.ok) {
    return { ok: false, reason: usable.reason };
  }

  const incomingHash = hashApiKey(parsed.rawKey);
  if (!safeCompare(incomingHash, row.key_hash)) {
    return { ok: false, reason: 'invalid_secret' };
  }

  await touchApiKeyLastUsed(row.id);

  return {
    ok: true,
    reason: 'active',
    apiKey: mapApiKeyRow(row),
  };
}

async function revokeApiKey(id) {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const sql = `
    update api_keys
    set is_active = false, revoked_at = now()
    where id::text = $1 or key_prefix = $1
    returning
      id,
      owner_user_id,
      partner_id,
      name,
      environment,
      key_prefix,
      role,
      scopes,
      notes,
      is_active,
      last_used_at,
      expires_at,
      revoked_at,
      created_at
  `;
  const result = await query(sql, [id]);
  return mapApiKeyRow(result.rows[0] || null);
}

async function reactivateApiKey(id) {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const sql = `
    update api_keys
    set is_active = true, revoked_at = null
    where id::text = $1 or key_prefix = $1
    returning
      id,
      owner_user_id,
      partner_id,
      name,
      environment,
      key_prefix,
      role,
      scopes,
      notes,
      is_active,
      last_used_at,
      expires_at,
      revoked_at,
      created_at
  `;
  const result = await query(sql, [id]);
  return mapApiKeyRow(result.rows[0] || null);
}

async function updateApiKey(id, input) {
  if (input.scopes !== undefined) {
    input = {
      ...input,
      scopes: validateApiKeyScopes(input.scopes, { required: true }),
    };
  }

  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const fields = [];
  const params = [];
  let index = 1;

  if (input.name !== undefined) {
    fields.push(`name = $${index++}`);
    params.push(String(input.name).trim());
  }

  if (input.role !== undefined) {
    fields.push(`role = $${index++}`);
    params.push(String(input.role).trim() || 'client');
  }

  if (input.scopes !== undefined) {
    fields.push(`scopes = $${index++}::jsonb`);
    params.push(JSON.stringify(input.scopes));
  }

  if (input.notes !== undefined) {
    fields.push(`notes = $${index++}`);
    params.push(input.notes ? String(input.notes) : null);
  }

  if (input.expiresAt !== undefined) {
    fields.push(`expires_at = $${index++}`);
    params.push(input.expiresAt || null);
  }

  if (input.isActive !== undefined) {
    fields.push(`is_active = $${index++}`);
    params.push(Boolean(input.isActive));
    if (Boolean(input.isActive)) {
      fields.push('revoked_at = null');
    }
  }

  if (fields.length === 0) {
    return findApiKeyByIdentifier(id);
  }

  params.push(id);
  const sql = `
    update api_keys
    set ${fields.join(', ')}
    where id::text = $${index} or key_prefix = $${index}
    returning
      id,
      owner_user_id,
      partner_id,
      name,
      environment,
      key_prefix,
      role,
      scopes,
      notes,
      is_active,
      last_used_at,
      expires_at,
      revoked_at,
      created_at
  `;
  const result = await query(sql, params);
  return mapApiKeyRow(result.rows[0] || null);
}

async function rotateApiKey(id) {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const existing = await findApiKeyByIdentifier(id);
  if (!existing) return null;

  const generated = generateApiKey({ environment: existing.environment });
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('begin');

    const insertSql = `
      insert into api_keys (
        owner_user_id,
        partner_id,
        name,
        environment,
        key_prefix,
        key_hash,
        role,
        scopes,
        notes,
        is_active,
        expires_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, true, $10)
      returning
        id,
        owner_user_id,
        partner_id,
        name,
        environment,
        key_prefix,
        role,
        scopes,
        notes,
        is_active,
        last_used_at,
        expires_at,
        revoked_at,
        created_at
    `;
    const insertParams = [
      existing.ownerUserId,
      existing.partnerId,
      existing.name,
      existing.environment,
      generated.keyPrefix,
      generated.keyHash,
      existing.role,
      JSON.stringify(existing.scopes || []),
      existing.notes,
      existing.expiresAt,
    ];
    const inserted = await client.query(insertSql, insertParams);

    await client.query(
      'update api_keys set is_active = false, revoked_at = now() where id::text = $1 or key_prefix = $1',
      [id]
    );

    await client.query('commit');

    return {
      previousApiKeyId: existing.publicId || id,
      apiKey: mapApiKeyRow(inserted.rows[0]),
      secret: generated.rawKey,
    };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

async function getApiKeyStats() {
  if (!isApiKeyServiceConfigured()) {
    throw new Error('API key service is not configured. Missing DATABASE_URL.');
  }

  const sql = `
    select
      count(*)::int as total_keys,
      count(*) filter (where is_active = true and revoked_at is null)::int as active_keys,
      count(*) filter (where is_active = false or revoked_at is not null)::int as revoked_keys,
      count(*) filter (where expires_at is not null and expires_at <= now())::int as expired_keys,
      max(last_used_at) as last_key_use_at
    from api_keys
  `;
  const result = await query(sql);
  const row = result.rows[0] || {};

  const auditSql = `
    select
      count(*) filter (where action = 'api_key_used' and created_at >= now() - interval '24 hours')::int as api_key_used_24h,
      count(*) filter (where action = 'api_key_auth_failed' and created_at >= now() - interval '24 hours')::int as api_key_auth_failed_24h
    from audit_logs
  `;
  const auditResult = await query(auditSql);
  const auditRow = auditResult.rows[0] || {};

  return {
    totalKeys: row.total_keys ?? 0,
    activeKeys: row.active_keys ?? 0,
    revokedKeys: row.revoked_keys ?? 0,
    expiredKeys: row.expired_keys ?? 0,
    lastKeyUseAt: row.last_key_use_at ? new Date(row.last_key_use_at).toISOString() : null,
    apiKeyUsed24h: auditRow.api_key_used_24h ?? 0,
    apiKeyAuthFailed24h: auditRow.api_key_auth_failed_24h ?? 0,
  };
}

module.exports = {
  createApiKey,
  findApiKeyByIdentifier,
  findApiKeyById,
  getApiKeyStats,
  isApiKeyServiceConfigured,
  isApiKeyUsable,
  listApiKeys,
  mapApiKeyRow,
  reactivateApiKey,
  revokeApiKey,
  rotateApiKey,
  updateApiKey,
  verifyApiKey,
};
