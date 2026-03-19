'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const ROUTE_MODULE_PATH = require.resolve('../src/server/routes/v1/apartments.routes');
const REQUIRE_API_KEY_MODULE_PATH = require.resolve('../src/server/middlewares/require-api-key');
const REQUIRE_API_KEY_SCOPE_MODULE_PATH = require.resolve('../src/server/middlewares/require-api-key-scope');
const PARTNER_APARTMENT_SERVICE_MODULE_PATH = require.resolve('../lib/apartments/partner-apartment-service');

function withMockedModules(mockEntries, load) {
  const previousEntries = new Map();

  for (const [modulePath, exports] of Object.entries(mockEntries)) {
    previousEntries.set(modulePath, require.cache[modulePath]);
    require.cache[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports,
    };
  }

  delete require.cache[ROUTE_MODULE_PATH];

  try {
    return load();
  } finally {
    delete require.cache[ROUTE_MODULE_PATH];
    for (const [modulePath, previousEntry] of previousEntries.entries()) {
      if (previousEntry) {
        require.cache[modulePath] = previousEntry;
      } else {
        delete require.cache[modulePath];
      }
    }
  }
}

async function createTestServer(serviceExports) {
  const actor = {
    type: 'api_key',
    id: 'key-1',
    partnerId: 'partner-a',
    scopes: ['apartments:read'],
    role: 'client',
    accessPolicy: {},
  };

  const { buildApartmentsV1Router } = withMockedModules(
    {
      [REQUIRE_API_KEY_MODULE_PATH]: {
        requireApiKey(req, _res, next) {
          req.apiKey = actor;
          req.authActor = actor;
          next();
        },
      },
      [REQUIRE_API_KEY_SCOPE_MODULE_PATH]: {
        requireApiKeyScope() {
          return function passthrough(_req, _res, next) {
            next();
          };
        },
      },
      [PARTNER_APARTMENT_SERVICE_MODULE_PATH]: serviceExports,
    },
    () => require('../src/server/routes/v1/apartments.routes')
  );

  const app = express();
  app.use(
    '/api/v1/apartments',
    buildApartmentsV1Router({
      asyncHandler(handler) {
        return function wrapped(req, res, next) {
          return Promise.resolve(handler(req, res, next)).catch(next);
        };
      },
      liveSyncState: { isRunning: false },
      rateLimitMiddleware(_req, _res, next) {
        next();
      },
    })
  );
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({
      status: 'error',
      code: err.code || 'INTERNAL_ERROR',
      message: err.publicMessage || err.message || 'Internal server error',
    });
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  return server;
}

async function requestJson(server, pathname) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
  return {
    status: response.status,
    body: await response.json(),
  };
}

test('GET /api/v1/apartments returns all apartments', async () => {
  const server = await createTestServer({
    async listPartnerApartmentsLive() {
      return {
        apartments: [{ id: 'apt-1' }, { id: 'apt-2' }],
        accessPolicy: {},
        dataSource: 'test-source',
      };
    },
    async listPartnerRentalApartmentsLive() {
      throw new Error('not used');
    },
    async listPartnerOnSaleApartmentsLive() {
      throw new Error('not used');
    },
    async listPartnerApartmentsLiveByCity() {
      throw new Error('not used');
    },
    async findPartnerApartmentLiveById() {
      throw new Error('not used');
    },
  });

  try {
    const { status, body } = await requestJson(server, '/api/v1/apartments');
    assert.equal(status, 200);
    assert.deepEqual(body.apartments, [{ id: 'apt-1' }, { id: 'apt-2' }]);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('GET /api/v1/apartments/rental returns rental apartments', async () => {
  const server = await createTestServer({
    async listPartnerApartmentsLive() {
      throw new Error('not used');
    },
    async listPartnerRentalApartmentsLive() {
      return {
        apartments: [{ id: 'apt-r1' }],
        accessPolicy: {},
        dataSource: 'test-source',
      };
    },
    async listPartnerOnSaleApartmentsLive() {
      throw new Error('not used');
    },
    async listPartnerApartmentsLiveByCity() {
      throw new Error('not used');
    },
    async findPartnerApartmentLiveById() {
      throw new Error('not used');
    },
  });

  try {
    const { status, body } = await requestJson(server, '/api/v1/apartments/rental');
    assert.equal(status, 200);
    assert.deepEqual(body.apartments, [{ id: 'apt-r1' }]);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('GET /api/v1/apartments/onsale returns onsale apartments', async () => {
  const server = await createTestServer({
    async listPartnerApartmentsLive() {
      throw new Error('not used');
    },
    async listPartnerRentalApartmentsLive() {
      throw new Error('not used');
    },
    async listPartnerOnSaleApartmentsLive() {
      return {
        apartments: [{ id: 'apt-s1' }],
        accessPolicy: {},
        dataSource: 'test-source',
      };
    },
    async listPartnerApartmentsLiveByCity() {
      throw new Error('not used');
    },
    async findPartnerApartmentLiveById() {
      throw new Error('not used');
    },
  });

  try {
    const { status, body } = await requestJson(server, '/api/v1/apartments/onsale');
    assert.equal(status, 200);
    assert.deepEqual(body.apartments, [{ id: 'apt-s1' }]);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('GET /api/v1/apartments/:id returns a single apartment', async () => {
  const server = await createTestServer({
    async listPartnerApartmentsLive() {
      throw new Error('not used');
    },
    async listPartnerRentalApartmentsLive() {
      throw new Error('not used');
    },
    async listPartnerOnSaleApartmentsLive() {
      throw new Error('not used');
    },
    async listPartnerApartmentsLiveByCity() {
      throw new Error('not used');
    },
    async findPartnerApartmentLiveById(_actor, apartmentId) {
      return {
        apartment: { id: apartmentId },
        accessPolicy: {},
        dataSource: 'test-source',
      };
    },
  });

  try {
    const { status, body } = await requestJson(server, '/api/v1/apartments/apt-42');
    assert.equal(status, 200);
    assert.deepEqual(body.apartment, { id: 'apt-42' });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('GET /api/v1/apartments/rental accepts rental-specific partner scope', async () => {
  const server = await createTestServer({
    async listPartnerApartmentsLive() {
      throw new Error('not used');
    },
    async listPartnerRentalApartmentsLive() {
      return {
        apartments: [{ id: 'apt-r-only' }],
        accessPolicy: {},
        dataSource: 'test-source',
      };
    },
    async listPartnerOnSaleApartmentsLive() {
      throw new Error('not used');
    },
    async listPartnerApartmentsLiveByCity() {
      throw new Error('not used');
    },
    async findPartnerApartmentLiveById() {
      throw new Error('not used');
    },
  });

  try {
    const { status, body } = await requestJson(server, '/api/v1/apartments/rental');
    assert.equal(status, 200);
    assert.deepEqual(body.apartments, [{ id: 'apt-r-only' }]);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
