'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { API_KEY_SCOPES } = require('../lib/api-key-scopes');
const { listPartnerApartmentsLive } = require('../lib/apartments/partner-apartment-service');
const { projectApartment } = require('../lib/apartments/apartment-projector');
const { buildPartnerApartmentAccessPolicy } = require('../lib/partners/partner-access-policy');

test('buildPartnerApartmentAccessPolicy defaults to full projection for apartment readers', () => {
  const policy = buildPartnerApartmentAccessPolicy({
    type: 'api_key',
    id: 'key-1',
    partnerId: 'partner-a',
    scopes: [API_KEY_SCOPES.APARTMENTS_READ],
  });

  assert.equal(policy.partnerId, 'partner-a');
  assert.equal(policy.canReadApartments, true);
  assert.equal(policy.projectionMode, 'full');
  assert.deepEqual(policy.apartmentFieldAllowlist, []);
  assert.deepEqual(policy.accessPolicy, {});
});

test('buildPartnerApartmentAccessPolicy accepts explicit apartment field allowlist', () => {
  const policy = buildPartnerApartmentAccessPolicy({
    type: 'api_key',
    partnerId: 'partner-a',
    scopes: [API_KEY_SCOPES.APARTMENTS_READ],
    accessPolicy: {
      apartments: {
        fields: ['id', 'address.city', 'rent.warmRent', 'rent.warmRent', ''],
      },
    },
  });

  assert.equal(policy.projectionMode, 'allowlist');
  assert.deepEqual(policy.accessPolicy, {
    apartments: {
      fields: ['id', 'address.city', 'rent.warmRent'],
    },
  });
  assert.deepEqual(policy.apartmentFieldAllowlist, ['id', 'address.city', 'rent.warmRent']);
});

test('projectApartment keeps only allowlisted fields when policy restricts apartment fields', () => {
  const apartment = {
    id: 'apt-1',
    address: {
      city: 'Berlin',
      zipCode: '10115',
    },
    rent: {
      warmRent: 1200,
      coldRent: 1000,
    },
    photos: [{ url: 'https://example.test/1.jpg' }],
  };

  const projected = projectApartment(apartment, {
    apartmentFieldAllowlist: ['id', 'address.city', 'rent.warmRent'],
  });

  assert.deepEqual(projected, {
    id: 'apt-1',
    address: {
      city: 'Berlin',
    },
    rent: {
      warmRent: 1200,
    },
  });
});

test('listPartnerApartmentsLive projects fetched apartments using partner access policy', async () => {
  const result = await listPartnerApartmentsLive(
    {
      type: 'api_key',
      id: 'key-1',
      partnerId: 'partner-a',
      scopes: [API_KEY_SCOPES.APARTMENTS_READ],
      apartmentFieldAllowlist: ['id', 'rent.warmRent'],
    },
    {
      fetchApartments: async () => [
        {
          id: 'apt-1',
          rent: { warmRent: 1200, coldRent: 1000 },
          address: { city: 'Berlin' },
        },
      ],
    }
  );

  assert.equal(result.dataSource, 'live-onoffice');
  assert.equal(result.accessPolicy.partnerId, 'partner-a');
  assert.deepEqual(result.apartments, [
    {
      id: 'apt-1',
      rent: {
        warmRent: 1200,
      },
    },
  ]);
});
