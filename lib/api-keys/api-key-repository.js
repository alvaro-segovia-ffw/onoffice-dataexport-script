'use strict';

const { getPool, query } = require('../db');

const BASE_SELECT_COLUMNS = `
  id,
  owner_user_id,
  partner_id,
  name,
  environment,
  key_prefix,
  role,
  scopes,
  notes,
  access_policy,
  is_active,
  last_used_at,
  expires_at,
  revoked_at,
  created_at
`;

const BASE_SELECT_COLUMNS_WITH_HASH = `
  ${BASE_SELECT_COLUMNS},
  key_hash
`;

function buildUpdateApiKeyStatement(input = {}) {
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

  if (input.accessPolicy !== undefined) {
    fields.push(`access_policy = $${index++}::jsonb`);
    params.push(JSON.stringify(input.accessPolicy || {}));
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

  return {
    fields,
    params,
    nextParamIndex: index,
  };
}

async function createApiKeyRecord(input) {
  const result = await query(
    `
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
        access_policy,
        is_active,
        expires_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, true, $11)
      returning ${BASE_SELECT_COLUMNS}
    `,
    [
      input.ownerUserId || null,
      input.partnerId,
      input.name,
      input.environment,
      input.keyPrefix,
      input.keyHash,
      input.role,
      JSON.stringify(input.scopes),
      input.notes,
      JSON.stringify(input.accessPolicy || {}),
      input.expiresAt || null,
    ]
  );

  return result.rows[0] || null;
}

async function listApiKeyRecords() {
  const result = await query(
    `
      select ${BASE_SELECT_COLUMNS}
      from api_keys
      order by created_at desc
    `
  );

  return result.rows;
}

async function findApiKeyRecordById(id) {
  const result = await query(
    `
      select ${BASE_SELECT_COLUMNS}
      from api_keys
      where id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function findApiKeyRecordByIdentifier(identifier) {
  const normalizedIdentifier = String(identifier || '').trim();
  const result = await query(
    `
      select ${BASE_SELECT_COLUMNS}
      from api_keys
      where id::text = $1 or key_prefix = $1
      limit 1
    `,
    [normalizedIdentifier]
  );

  return result.rows[0] || null;
}

async function findApiKeyRecordByPrefix(keyPrefix) {
  const result = await query(
    `
      select ${BASE_SELECT_COLUMNS_WITH_HASH}
      from api_keys
      where key_prefix = $1
      limit 1
    `,
    [keyPrefix]
  );

  return result.rows[0] || null;
}

async function touchApiKeyLastUsed(apiKeyId) {
  await query('update api_keys set last_used_at = now() where id = $1', [apiKeyId]);
}

async function revokeApiKeyRecord(identifier) {
  const result = await query(
    `
      update api_keys
      set is_active = false, revoked_at = now()
      where id::text = $1 or key_prefix = $1
      returning ${BASE_SELECT_COLUMNS}
    `,
    [identifier]
  );

  return result.rows[0] || null;
}

async function reactivateApiKeyRecord(identifier) {
  const result = await query(
    `
      update api_keys
      set is_active = true, revoked_at = null
      where id::text = $1 or key_prefix = $1
      returning ${BASE_SELECT_COLUMNS}
    `,
    [identifier]
  );

  return result.rows[0] || null;
}

async function updateApiKeyRecord(identifier, input) {
  const statement = buildUpdateApiKeyStatement(input);
  if (statement.fields.length === 0) {
    return findApiKeyRecordByIdentifier(identifier);
  }

  const result = await query(
    `
      update api_keys
      set ${statement.fields.join(', ')}
      where id::text = $${statement.nextParamIndex} or key_prefix = $${statement.nextParamIndex}
      returning ${BASE_SELECT_COLUMNS}
    `,
    [...statement.params, identifier]
  );

  return result.rows[0] || null;
}

async function deleteApiKeyRecord(identifier) {
  const result = await query(
    `
      delete from api_keys
      where id::text = $1 or key_prefix = $1
      returning ${BASE_SELECT_COLUMNS}
    `,
    [identifier]
  );

  return result.rows[0] || null;
}

async function rotateApiKeyRecord(identifier, replacement) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('begin');

    const existingResult = await client.query(
      `
        select ${BASE_SELECT_COLUMNS}
        from api_keys
        where id::text = $1 or key_prefix = $1
        limit 1
      `,
      [identifier]
    );
    const existing = existingResult.rows[0] || null;

    if (!existing) {
      await client.query('rollback');
      return null;
    }

    const insertedResult = await client.query(
      `
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
          access_policy,
          is_active,
          expires_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, true, $11)
        returning ${BASE_SELECT_COLUMNS}
      `,
      [
        existing.owner_user_id,
        existing.partner_id,
        existing.name,
        existing.environment,
        replacement.keyPrefix,
        replacement.keyHash,
        existing.role,
        JSON.stringify(existing.scopes || []),
        existing.notes,
        JSON.stringify(existing.access_policy || {}),
        existing.expires_at,
      ]
    );

    await client.query(
      'update api_keys set is_active = false, revoked_at = now() where id::text = $1 or key_prefix = $1',
      [identifier]
    );

    await client.query('commit');

    return {
      previous: existing,
      current: insertedResult.rows[0] || null,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function getApiKeyAggregateStats() {
  const keyStatsResult = await query(
    `
      select
        count(*)::int as total_keys,
        count(*) filter (where is_active = true and revoked_at is null)::int as active_keys,
        count(*) filter (where is_active = false or revoked_at is not null)::int as revoked_keys,
        count(*) filter (where expires_at is not null and expires_at <= now())::int as expired_keys,
        max(last_used_at) as last_key_use_at
      from api_keys
    `
  );

  const auditStatsResult = await query(
    `
      select
        count(*) filter (where action = 'api_key_used' and created_at >= now() - interval '24 hours')::int as api_key_used_24h,
        count(*) filter (where action = 'api_key_auth_failed' and created_at >= now() - interval '24 hours')::int as api_key_auth_failed_24h
      from audit_logs
    `
  );

  return {
    keyStats: keyStatsResult.rows[0] || {},
    auditStats: auditStatsResult.rows[0] || {},
  };
}

module.exports = {
  createApiKeyRecord,
  deleteApiKeyRecord,
  findApiKeyRecordById,
  findApiKeyRecordByIdentifier,
  findApiKeyRecordByPrefix,
  getApiKeyAggregateStats,
  listApiKeyRecords,
  reactivateApiKeyRecord,
  revokeApiKeyRecord,
  rotateApiKeyRecord,
  touchApiKeyLastUsed,
  updateApiKeyRecord,
};
