'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'));
}

test('public swagger spec includes versioned apartment endpoints', () => {
  const spec = readJson('docs/openapi.public.json');

  assert.ok(spec.paths['/api/v1/apartments']);
  assert.ok(spec.paths['/api/v1/apartments/rental']);
  assert.ok(spec.paths['/api/v1/apartments/onsale']);
  assert.ok(spec.paths['/api/v1/apartments/{id}']);

  assert.equal(spec.paths['/api/v1/apartments'].get.summary, 'Fetch all live apartments');
  assert.equal(spec.paths['/api/v1/apartments/rental'].get.summary, 'Fetch live rental apartments');
  assert.equal(spec.paths['/api/v1/apartments/onsale'].get.summary, 'Fetch live on-sale apartments');
  assert.equal(spec.paths['/api/v1/apartments/{id}'].get.summary, 'Fetch a single apartment by id');
  assert.equal('x-required-scopes' in spec.paths['/api/v1/apartments'].get, false);
  assert.equal('x-required-scopes' in spec.paths['/api/v1/apartments/rental'].get, false);
  assert.equal('x-required-scopes' in spec.paths['/api/v1/apartments/onsale'].get, false);
  assert.match(spec.paths['/api/v1/apartments/onsale'].get.description, /available for sale/i);
  assert.doesNotMatch(
    spec.paths['/api/v1/apartments/onsale'].get.description,
    /exclusive|veroeffentlichen|scope/i
  );
});
