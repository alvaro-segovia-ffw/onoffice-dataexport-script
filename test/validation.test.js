'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PublicError } = require('../src/server/errors/public-error');
const {
  validateApiKeyIdentifierParam,
  validateCreateApiKeyInput,
  validateUpdateApiKeyInput,
} = require('../src/server/validation/api-key.validation');
const {
  validateLoginInput,
  validateRefreshTokenInput,
} = require('../src/server/validation/auth.validation');
const { validateAuditLogFilters } = require('../src/server/validation/audit.validation');

function assertPublicError(err, expected) {
  assert.equal(err instanceof PublicError, true);
  assert.equal(err.statusCode, expected.statusCode || 400);
  assert.equal(err.code, expected.code || 'BAD_REQUEST');
  assert.equal(err.publicMessage, expected.message);
}

test('validateCreateApiKeyInput normalizes a valid API key payload', () => {
  const result = validateCreateApiKeyInput({
    partnerId: ' partner-a ',
    name: ' Partner A ',
    environment: ' live ',
    role: ' client ',
    scopes: ['apartments:read', 'apartments:read'],
    notes: ' internal note ',
    expiresAt: ' 2026-04-01T00:00:00.000Z ',
  });

  assert.deepEqual(result, {
    partnerId: 'partner-a',
    name: 'Partner A',
    environment: 'live',
    role: 'client',
    scopes: ['apartments:read'],
    notes: 'internal note',
    expiresAt: '2026-04-01T00:00:00.000Z',
  });
});

test('validateCreateApiKeyInput rejects missing required fields', () => {
  assert.throws(
    () => validateCreateApiKeyInput({ partnerId: 'partner-a' }),
    (err) => {
      assertPublicError(err, {
        message: 'partnerId and name are required.',
      });
      return true;
    }
  );
});

test('validateCreateApiKeyInput rejects invalid scope payloads', () => {
  assert.throws(
    () =>
      validateCreateApiKeyInput({
        partnerId: 'partner-a',
        name: 'Partner A',
        scopes: [],
      }),
    (err) => {
      assertPublicError(err, {
        code: 'INVALID_SCOPES',
        message: 'Invalid API key scopes.',
      });
      return true;
    }
  );
});

test('validateUpdateApiKeyInput rejects invalid field types', () => {
  assert.throws(
    () =>
      validateUpdateApiKeyInput({
        name: '',
      }),
    (err) => {
      assertPublicError(err, {
        message: 'name must not be empty.',
      });
      return true;
    }
  );

  assert.throws(
    () =>
      validateUpdateApiKeyInput({
        isActive: 'true',
      }),
    (err) => {
      assertPublicError(err, {
        message: 'isActive must be a boolean.',
      });
      return true;
    }
  );
});

test('validateUpdateApiKeyInput normalizes optional values', () => {
  const result = validateUpdateApiKeyInput({
    notes: '   ',
    expiresAt: null,
    isActive: false,
  });

  assert.deepEqual(result, {
    name: undefined,
    role: undefined,
    scopes: undefined,
    notes: null,
    expiresAt: null,
    isActive: false,
  });
});

test('validateApiKeyIdentifierParam rejects empty identifiers', () => {
  assert.throws(
    () => validateApiKeyIdentifierParam({ id: '   ' }),
    (err) => {
      assertPublicError(err, {
        message: 'API key id is required.',
      });
      return true;
    }
  );
});

test('validateLoginInput requires string credentials', () => {
  assert.throws(
    () => validateLoginInput({ email: 'user@example.com' }),
    (err) => {
      assertPublicError(err, {
        message: 'email and password are required.',
      });
      return true;
    }
  );

  assert.throws(
    () => validateLoginInput({ email: ['user@example.com'], password: 'secret' }),
    (err) => {
      assertPublicError(err, {
        message: 'email and password are required.',
      });
      return true;
    }
  );
});

test('validateRefreshTokenInput requires a non-empty string token', () => {
  assert.throws(
    () => validateRefreshTokenInput({ refreshToken: '' }),
    (err) => {
      assertPublicError(err, {
        message: 'refreshToken is required.',
      });
      return true;
    }
  );
});

test('validateAuditLogFilters normalizes valid query filters', () => {
  const result = validateAuditLogFilters({
    action: ' api_key_created ',
    partnerId: ' partner-a ',
    limit: '250',
  });

  assert.deepEqual(result, {
    action: 'api_key_created',
    resourceType: undefined,
    resourceId: undefined,
    actorUserId: undefined,
    actorApiKeyId: undefined,
    partnerId: 'partner-a',
    limit: 200,
  });
});

test('validateAuditLogFilters rejects invalid query values', () => {
  assert.throws(
    () =>
      validateAuditLogFilters({
        action: ['api_key_created'],
      }),
    (err) => {
      assertPublicError(err, {
        message: 'action must be a single string value.',
      });
      return true;
    }
  );

  assert.throws(
    () =>
      validateAuditLogFilters({
        limit: 'not-a-number',
      }),
    (err) => {
      assertPublicError(err, {
        message: 'limit must be a positive integer.',
      });
      return true;
    }
  );
});
