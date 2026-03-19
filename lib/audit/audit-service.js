'use strict';

const { isDatabaseConfigured } = require('../db');
const { mapAuditLogRow } = require('./audit-mapper');
const { createAuditLog, listAuditLogRecords } = require('./audit-repository');

function normalizeAuditEntry(entry) {
  return {
    actorUserId: entry.actorUserId || null,
    actorApiKeyId: entry.actorApiKeyId || null,
    action: String(entry.action || '').trim(),
    resourceType: entry.resourceType ? String(entry.resourceType) : null,
    resourceId: entry.resourceId ? String(entry.resourceId) : null,
    ip: entry.ip ? String(entry.ip) : null,
    userAgent: entry.userAgent ? String(entry.userAgent) : null,
    metadata: entry.metadata || {},
  };
}

async function writeAuditLog(entry) {
  if (!isDatabaseConfigured()) return null;

  const normalizedEntry = normalizeAuditEntry(entry);
  if (!normalizedEntry.action) {
    throw new Error('Audit action is required.');
  }

  return createAuditLog(normalizedEntry);
}

async function listAuditLogs(filters = {}) {
  if (!isDatabaseConfigured()) {
    throw new Error('Audit service is not configured. Missing DATABASE_URL.');
  }

  const rows = await listAuditLogRecords(filters);
  return rows.map(mapAuditLogRow);
}

module.exports = {
  listAuditLogs,
  writeAuditLog,
};
