'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { runApartmentExport } = require('../lib/export/apartment-export-service');
const {
  mapEstateToApartment,
  mapEstateToGeocodeRecord,
  normalizeDate,
  parseBool,
  parseNumber,
  toSqFtFromSqm,
} = require('../lib/apartments/apartment-mapper');
const { buildPicturesMap, sortPhotos } = require('../lib/apartments/picture-utils');
const { enrichApartmentsWithGeocodedCoordinates } = require('../lib/geocoding/geocoder-client');
const {
  chunk,
  extractEstateRecords,
  extractPicturesRecords,
  fetchEstates,
  fetchOnSaleEstates,
  fetchRentalEstates,
  getEstateLanguage,
} = require('../lib/onoffice/onoffice-client');
const geocoding = require('../lib/geocoding/apartment-geocoding');

test('parseBool supports german/english and numeric values', () => {
  assert.equal(parseBool('ja'), true);
  assert.equal(parseBool('yes'), true);
  assert.equal(parseBool('1'), true);
  assert.equal(parseBool('nein'), false);
  assert.equal(parseBool('no'), false);
  assert.equal(parseBool(0), false);
  assert.equal(parseBool('unknown'), null);
});

test('parseNumber parses decimal comma and invalid values', () => {
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('10.25'), 10.25);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber(null), null);
  assert.equal(parseNumber('foo'), null);
});

test('normalizeDate and toSqFtFromSqm normalize values', () => {
  assert.equal(normalizeDate('2026-03-06'), '2026-03-06');
  assert.equal(normalizeDate('0000-00-00'), null);
  assert.equal(normalizeDate(''), null);
  assert.equal(toSqFtFromSqm('10'), 107.64);
  assert.equal(toSqFtFromSqm('not-a-number'), null);
});

test('mapEstateToApartment maps key fields to output contract', () => {
  const mapped = mapEstateToApartment({
    elements: {
      Id: 123,
      hausnummer: '5A',
      strasse: 'Teststrasse',
      ort: 'Berlin',
      plz: '10115',
      breitengrad: '52.520008',
      laengengrad: '13.404954',
      anzahl_schlafzimmer: '2',
      anzahl_badezimmer: '1',
      anzahl_zimmer: '3',
      wohnflaeche: '50',
      balkon: 'ja',
      moebliert: 'nein',
      warmmiete: '1200',
      kaltmiete: '1000',
      abdatum: '2026-05-01',
      bisdatum: '0000-00-00',
    },
  });

  assert.equal(mapped.id, '123');
  assert.equal(mapped.address.streetName, 'Teststrasse');
  assert.equal(mapped.address.city, 'Berlin');
  assert.equal(mapped.latitude, 52.520008);
  assert.equal(mapped.longitude, 13.404954);
  assert.equal(mapped.roomsTotal, 3);
  assert.equal(mapped.bedrooms, 2);
  assert.equal(mapped.bathrooms, 1);
  assert.equal(mapped.areaSqft, 538.19);
  assert.equal(mapped.features.balcony, true);
  assert.equal(mapped.features.furnished, false);
  assert.equal(mapped.rent.warmRent, 1200);
  assert.equal(mapped.rent.coldRent, 1000);
  assert.equal(mapped.availability.from, '2026-05-01');
  assert.equal(mapped.availability.until, null);
});

test('mapEstateToGeocodeRecord extracts address and current coordinates', () => {
  const mapped = mapEstateToGeocodeRecord({
    elements: {
      Id: 456,
      objektnr_extern: 'A-456',
      strasse: 'Invalidenstrasse',
      hausnummer: '117',
      plz: '10115',
      ort: 'Berlin',
      breitengrad: '52.5321',
      laengengrad: '13.3849',
    },
  });

  assert.equal(mapped.id, '456');
  assert.equal(mapped.immoNr, 'A-456');
  assert.equal(mapped.address.streetName, 'Invalidenstrasse');
  assert.equal(mapped.address.buildingNumber, '117');
  assert.equal(mapped.address.zipCode, '10115');
  assert.equal(mapped.address.city, 'Berlin');
  assert.equal(mapped.latitude, 52.5321);
  assert.equal(mapped.longitude, 13.3849);
});

test('enrichApartmentsWithGeocodedCoordinates keeps existing coordinates and fills missing ones', async () => {
  const apartments = [
    {
      id: '1',
      address: {
        streetName: 'Knownstrasse',
        buildingNumber: '1',
        zipCode: '10115',
        city: 'Berlin',
      },
      latitude: 52.5,
      longitude: 13.4,
    },
    {
      id: '2',
      address: {
        streetName: 'Missingstrasse',
        buildingNumber: '2',
        zipCode: '10117',
        city: 'Berlin',
      },
      latitude: null,
      longitude: null,
    },
  ];

  const calls = [];
  await enrichApartmentsWithGeocodedCoordinates(apartments, {
    headers: { 'User-Agent': 'test-agent' },
    fetchImpl: async (url) => {
      calls.push(url);
      return {
        ok: true,
        async json() {
          return [{ lat: '52.51', lon: '13.41' }];
        },
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(apartments[0].latitude, 52.5);
  assert.equal(apartments[0].longitude, 13.4);
  assert.equal(apartments[1].latitude, 52.51);
  assert.equal(apartments[1].longitude, 13.41);
});

test('enrichApartmentsWithGeocodedCoordinates skips geocoding when headers are missing', async () => {
  const apartments = [
    {
      id: '2',
      address: {
        streetName: 'Missingstrasse',
        buildingNumber: '2',
        zipCode: '10117',
        city: 'Berlin',
      },
      latitude: null,
      longitude: null,
    },
  ];

  await enrichApartmentsWithGeocodedCoordinates(apartments, {
    headers: null,
    fetchImpl: async () => {
      throw new Error('should not be called');
    },
  });

  assert.equal(apartments[0].latitude, null);
  assert.equal(apartments[0].longitude, null);
});

test('buildPicturesMap groups images by estate id', () => {
  const picsMap = buildPicturesMap([
    {
      elements: [
        { estateid: 1, url: 'https://a', type: 'Foto' },
        { estateMainId: 2, url: 'https://b', type: 'Titelbild' },
      ],
    },
    {
      elements: [{ estateid: 1, url: 'https://c', type: 'Grundriss' }],
    },
  ]);

  assert.equal(picsMap.get('1').length, 2);
  assert.equal(picsMap.get('2').length, 1);
});

test('sortPhotos prioritizes Titelbild then Foto then Grundriss and newest modified first', () => {
  const photos = [
    { type: 'Grundriss', modified: 10 },
    { type: 'Foto', modified: 15 },
    { type: 'Titelbild', modified: 1 },
    { type: 'Foto', modified: 20 },
  ];

  photos.sort(sortPhotos);

  assert.deepEqual(
    photos.map((x) => `${x.type}:${x.modified}`),
    ['Titelbild:1', 'Foto:20', 'Foto:15', 'Grundriss:10']
  );
});

test('chunk and extract helpers keep expected behavior', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(extractEstateRecords({ data: { records: [1, 2] } }), [1, 2]);
  assert.deepEqual(extractEstateRecords({ data: {} }), []);

  assert.deepEqual(extractPicturesRecords({ data: { records: [9] } }), [9]);
  assert.deepEqual(extractPicturesRecords({ data: [8] }), [8]);
  assert.deepEqual(extractPicturesRecords({ records: [7] }), [7]);
  assert.deepEqual(extractPicturesRecords({ nope: true }), []);
});

test('fetchEstates no longer hardcodes the rental filter', async () => {
  let capturedBody = null;

  await fetchEstates(
    { apiUrl: 'https://example.test/api', token: 'token', secret: 'secret' },
    {
      fetchImpl: async (_url, request) => {
        capturedBody = JSON.parse(request.body);
        return {
          ok: true,
          async json() {
            return {
              status: { code: 200 },
              response: { results: [{ data: { records: [] } }] },
            };
          },
        };
      },
    }
  );

  const filter = capturedBody.request.actions[0].parameters.filter;
  assert.equal(filter.nutzungsart, undefined);
  assert.deepEqual(filter.status, [{ op: '=', val: '1' }]);
  assert.deepEqual(filter.veroeffentlichen, [{ op: '=', val: '1' }]);
});

test('fetchRentalEstates applies the rental onOffice filter', async () => {
  let capturedBody = null;

  await fetchRentalEstates(
    { apiUrl: 'https://example.test/api', token: 'token', secret: 'secret' },
    {
      fetchImpl: async (_url, request) => {
        capturedBody = JSON.parse(request.body);
        return {
          ok: true,
          async json() {
            return {
              status: { code: 200 },
              response: { results: [{ data: { records: [] } }] },
            };
          },
        };
      },
    }
  );

  const filter = capturedBody.request.actions[0].parameters.filter;
  assert.deepEqual(filter.nutzungsart, [{ op: '=', val: 'waz' }]);
});

test('fetchOnSaleEstates applies the onsale onOffice filter', async () => {
  let capturedBody = null;

  await fetchOnSaleEstates(
    { apiUrl: 'https://example.test/api', token: 'token', secret: 'secret' },
    {
      fetchImpl: async (_url, request) => {
        capturedBody = JSON.parse(request.body);
        return {
          ok: true,
          async json() {
            return {
              status: { code: 200 },
              response: { results: [{ data: { records: [] } }] },
            };
          },
        };
      },
    }
  );

  const filter = capturedBody.request.actions[0].parameters.filter;
  assert.deepEqual(filter.veroeffentlichen, [{ op: '=', val: '1' }]);
  assert.deepEqual(filter.exclusive, [{ op: '=', val: '1' }]);
});

test('getEstateLanguage defaults to ENG and supports env override', () => {
  const previous = process.env.ONOFFICE_ESTATE_LANGUAGE;

  delete process.env.ONOFFICE_ESTATE_LANGUAGE;
  assert.equal(getEstateLanguage(), 'ENG');

  process.env.ONOFFICE_ESTATE_LANGUAGE = 'DEU';
  assert.equal(getEstateLanguage(), 'DEU');

  if (previous === undefined) {
    delete process.env.ONOFFICE_ESTATE_LANGUAGE;
  } else {
    process.env.ONOFFICE_ESTATE_LANGUAGE = previous;
  }
});

test('runApartmentExport orchestrates fetch and write through injectable dependencies', async () => {
  const apartments = [{ id: '1' }, { id: '2' }];
  let fetchCalls = 0;
  let writeCalls = 0;

  const result = await runApartmentExport({
    filePrefix: 'custom-export',
    outputDir: '/tmp/ignored',
    fetchApartments: async (fetchOptions) => {
      fetchCalls += 1;
      assert.deepEqual(fetchOptions, {});
      return apartments;
    },
    writeExportFile: async (payload, options) => {
      writeCalls += 1;
      assert.deepEqual(payload, apartments);
      assert.equal(options.filePrefix, 'custom-export');
      assert.equal(options.outputDir, '/tmp/ignored');
      return {
        outputFileName: 'custom-export_2026-03-17_12-00-00.json',
        outputFilePath: '/tmp/ignored/custom-export_2026-03-17_12-00-00.json',
      };
    },
  });

  assert.equal(fetchCalls, 1);
  assert.equal(writeCalls, 1);
  assert.equal(result.apartments, 2);
  assert.equal(result.outputFileName, 'custom-export_2026-03-17_12-00-00.json');
  assert.equal(result.outputFilePath, '/tmp/ignored/custom-export_2026-03-17_12-00-00.json');
  assert.match(result.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(result.finishedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(Number.isInteger(result.durationMs), true);
});

test('geocoding helpers build provider params and CSV rows', () => {
  const address = {
    streetName: 'Teststrasse',
    buildingNumber: '5A',
    zipCode: '10115',
    city: 'Berlin',
  };

  assert.equal(geocoding.buildAddressLabel(address), 'Teststrasse 5A, 10115, Berlin');
  assert.equal(geocoding.hasAddressParts(address), true);
  assert.equal(geocoding.hasAddressParts({ city: 'Berlin' }), false);

  const params = geocoding.buildNominatimParams(address, {
    countryCode: 'DE',
    email: 'ops@example.com',
  });
  assert.equal(params.get('street'), 'Teststrasse 5A');
  assert.equal(params.get('postalcode'), '10115');
  assert.equal(params.get('city'), 'Berlin');
  assert.equal(params.get('countrycodes'), 'de');
  assert.equal(params.get('email'), 'ops@example.com');

  const csv = geocoding.toGeocodeCsv([
    {
      id: '123',
      immoNr: 'A-123',
      latitude: 52.5,
      longitude: 13.4,
      address,
      status: 'geocoded',
      query: 'Teststrasse 5A, 10115, Berlin',
      displayName: 'Test "Berlin"',
    },
  ]);

  assert.match(csv, /^Id,ImmoNr,breitengrad,laengengrad,/);
  assert.match(csv, /123,A-123,52\.5,13\.4,Teststrasse,5A,10115,Berlin,geocoded/);
  assert.match(csv, /"Test ""Berlin"""/);

  const importCsv = geocoding.toOnOfficeImportCsv([
    {
      immoNr: 'A-123',
      latitude: 52.5,
      longitude: 13.4,
    },
  ]);

  assert.equal(importCsv, 'ImmoNr,breitengrad,laengengrad\nA-123,52.5,13.4\n');
});
