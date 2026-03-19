'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { listAuditLogs, writeAuditLog } = require('../lib/audit/audit-service');

test('writeAuditLog returns null when database is not configured', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  const result = await writeAuditLog({ action: 'test_action' });
  assert.equal(result, null);

  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test('listAuditLogs throws when database is not configured', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  await assert.rejects(() => listAuditLogs({ limit: 5 }), /Missing DATABASE_URL/);

  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
