'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { API_KEY_SCOPES } = require('../lib/api-keys/api-key-scopes');
const {
  findPartnerApartmentLiveById,
  listPartnerApartmentsLive,
  listPartnerOnSaleApartmentsLive,
  listPartnerRentalApartmentsLive,
  listPartnerApartmentsLiveByCity,
} = require('../lib/apartments/partner-apartment-service');
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
  assert.equal(policy.canReadAllApartments, true);
  assert.equal(policy.canReadRentalApartments, true);
  assert.equal(policy.canReadSaleApartments, true);
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

test('listPartnerRentalApartmentsLive uses the rental apartment source and projection policy', async () => {
  const result = await listPartnerRentalApartmentsLive(
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
          id: 'apt-r1',
          rent: { warmRent: 1200, coldRent: 1000 },
          address: { city: 'Berlin' },
        },
      ],
    }
  );

  assert.deepEqual(result.apartments, [
    {
      id: 'apt-r1',
      rent: {
        warmRent: 1200,
      },
    },
  ]);
});

test('listPartnerOnSaleApartmentsLive uses the onsale apartment source and projection policy', async () => {
  const result = await listPartnerOnSaleApartmentsLive(
    {
      type: 'api_key',
      id: 'key-1',
      partnerId: 'partner-a',
      scopes: [API_KEY_SCOPES.APARTMENTS_READ],
      apartmentFieldAllowlist: ['id'],
    },
    {
      fetchApartments: async () => [
        {
          id: 'apt-s1',
          rent: { warmRent: 2200 },
          address: { city: 'Berlin' },
        },
      ],
    }
  );

  assert.deepEqual(result.apartments, [{ id: 'apt-s1' }]);
});

test('buildPartnerApartmentAccessPolicy supports rental-only and sale-only scopes', () => {
  const rentalPolicy = buildPartnerApartmentAccessPolicy({
    partnerId: 'partner-r',
    scopes: [API_KEY_SCOPES.APARTMENTS_RENTAL_READ],
  });
  const salePolicy = buildPartnerApartmentAccessPolicy({
    partnerId: 'partner-s',
    scopes: [API_KEY_SCOPES.APARTMENTS_SALE_READ],
  });

  assert.equal(rentalPolicy.canReadApartments, true);
  assert.equal(rentalPolicy.canReadAllApartments, false);
  assert.equal(rentalPolicy.canReadRentalApartments, true);
  assert.equal(rentalPolicy.canReadSaleApartments, false);

  assert.equal(salePolicy.canReadApartments, true);
  assert.equal(salePolicy.canReadAllApartments, false);
  assert.equal(salePolicy.canReadRentalApartments, false);
  assert.equal(salePolicy.canReadSaleApartments, true);
});

test('findPartnerApartmentLiveById returns one projected apartment when id matches', async () => {
  const actor = {
    partnerId: 'partner-a',
    scopes: ['apartments:read'],
    accessPolicy: {
      apartments: {
        fields: ['id', 'address.city'],
      },
    },
  };

  const result = await findPartnerApartmentLiveById(actor, 'apt-2', {
    fetchApartments: async () => [
      { id: 'apt-1', address: { city: 'Berlin' }, rent: { warmRent: 1200 } },
      { id: 'apt-2', address: { city: 'Hamburg' }, rent: { warmRent: 1500 } },
    ],
  });

  assert.deepEqual(result.apartment, {
    id: 'apt-2',
    address: { city: 'Hamburg' },
  });
});

test('listPartnerApartmentsLiveByCity filters apartments case-insensitively before projection', async () => {
  const actor = {
    partnerId: 'partner-a',
    scopes: ['apartments:read'],
    accessPolicy: {
      apartments: {
        fields: ['id', 'rent.warmRent'],
      },
    },
  };

  const result = await listPartnerApartmentsLiveByCity(actor, 'berlin', {
    fetchApartments: async () => [
      { id: 'apt-1', address: { city: 'Berlin' }, rent: { warmRent: 1200 } },
      { id: 'apt-2', address: { city: 'Hamburg' }, rent: { warmRent: 1500 } },
      { id: 'apt-3', address: { city: 'berlin' }, rent: { warmRent: 1600 } },
    ],
  });

  assert.deepEqual(result.apartments, [
    { id: 'apt-1', rent: { warmRent: 1200 } },
    { id: 'apt-3', rent: { warmRent: 1600 } },
  ]);
});
