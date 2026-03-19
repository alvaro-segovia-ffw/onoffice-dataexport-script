'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'));
}

test('internal swagger spec documents admin session reuse in the browser', () => {
  const spec = readJson('docs/openapi.json');

  assert.match(spec.info.description, /logged-in admin browser session/i);
  assert.match(spec.paths['/docs'].get.description, /without manually entering a Bearer token or session cookie/i);
  assert.match(spec.paths['/openapi.json'].get.description, /existing admin session can be used automatically/i);
  assert.match(spec.components.securitySchemes.adminSession.description, /sent automatically/i);
});

test('internal swagger spec exposes manual X-API-Key header input on apartment endpoints', () => {
  const spec = readJson('docs/openapi.json');
  const apartmentPaths = [
    '/api/v1/apartments',
    '/api/v1/apartments/rental',
    '/api/v1/apartments/onsale',
    '/api/v1/apartments/{id}',
  ];

  for (const pathname of apartmentPaths) {
    const operation = spec.paths[pathname].get;
    const apiKeyParameter = Array.isArray(operation.parameters)
      ? operation.parameters.find((parameter) => parameter.name === 'X-API-Key' && parameter.in === 'header')
      : null;

    assert.ok(apiKeyParameter, `${pathname} should expose X-API-Key header input`);
    assert.equal(apiKeyParameter.required, true);
    assert.equal('security' in operation, false);
  }
});
