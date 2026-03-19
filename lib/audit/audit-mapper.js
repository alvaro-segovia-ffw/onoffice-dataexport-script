'use strict';

function mapAuditLogRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorApiKeyId: row.actor_api_key_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    ip: row.ip,
    userAgent: row.user_agent,
    metadata: row.metadata || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

module.exports = {
  mapAuditLogRow,
};
