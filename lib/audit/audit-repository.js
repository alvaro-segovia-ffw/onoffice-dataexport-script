'use strict';

const { query } = require('../db');

function buildAuditLogListQuery(filters = {}) {
  const where = [];
  const params = [];
  let index = 1;

  if (filters.action) {
    where.push(`action = $${index++}`);
    params.push(String(filters.action));
  }

  if (filters.resourceType) {
    where.push(`resource_type = $${index++}`);
    params.push(String(filters.resourceType));
  }

  if (filters.resourceId) {
    where.push(`resource_id = $${index++}`);
    params.push(String(filters.resourceId));
  }

  if (filters.actorUserId) {
    where.push(`actor_user_id = $${index++}`);
    params.push(String(filters.actorUserId));
  }

  if (filters.actorApiKeyId) {
    where.push(`actor_api_key_id = $${index++}`);
    params.push(String(filters.actorApiKeyId));
  }

  if (filters.partnerId) {
    where.push(`metadata->>'partnerId' = $${index++}`);
    params.push(String(filters.partnerId));
  }

  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  params.push(limit);

  return {
    sql: `
      select
        id,
        actor_user_id,
        actor_api_key_id,
        action,
        resource_type,
        resource_id,
        ip,
        user_agent,
        metadata,
        created_at
      from audit_logs
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by created_at desc
      limit $${index}
    `,
    params,
  };
}

async function createAuditLog(entry) {
  const result = await query(
    `
      insert into audit_logs (
        actor_user_id,
        actor_api_key_id,
        action,
        resource_type,
        resource_id,
        ip,
        user_agent,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      returning id, created_at
    `,
    [
      entry.actorUserId || null,
      entry.actorApiKeyId || null,
      entry.action,
      entry.resourceType,
      entry.resourceId,
      entry.ip,
      entry.userAgent,
      JSON.stringify(entry.metadata || {}),
    ]
  );

  return result.rows[0] || null;
}

async function listAuditLogRecords(filters = {}) {
  const statement = buildAuditLogListQuery(filters);
  const result = await query(statement.sql, statement.params);
  return result.rows;
}

module.exports = {
  createAuditLog,
  listAuditLogRecords,
};
