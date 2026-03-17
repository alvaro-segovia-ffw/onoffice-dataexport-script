'use strict';

const { normalizePartnerAccessPolicy } = require('../partners/partner-access-policy');

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
    accessPolicy: normalizePartnerAccessPolicy(row.access_policy ?? row.accessPolicy, { allowUndefined: false }),
    isActive: row.is_active ?? row.revoked_at === null,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

module.exports = {
  mapApiKeyRow,
};
