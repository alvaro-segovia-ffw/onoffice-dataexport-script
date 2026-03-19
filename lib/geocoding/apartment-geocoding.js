'use strict';

function buildAddressLabel(address) {
  const parts = [
    [address?.streetName, address?.buildingNumber].filter(Boolean).join(' ').trim(),
    address?.zipCode || null,
    address?.city || null,
  ].filter(Boolean);

  return parts.join(', ');
}

function hasAddressParts(address) {
  return Boolean(address?.streetName && address?.zipCode && address?.city);
}

function buildNominatimParams(address, options = {}) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    addressdetails: '1',
    street: [address?.streetName, address?.buildingNumber].filter(Boolean).join(' ').trim(),
    postalcode: String(address?.zipCode || '').trim(),
    city: String(address?.city || '').trim(),
  });

  const countryCode = String(options.countryCode || '').trim().toLowerCase();
  if (countryCode) params.set('countrycodes', countryCode);

  const email = String(options.email || '').trim();
  if (email) params.set('email', email);

  return params;
}

function normalizeCacheKey(address) {
  return JSON.stringify({
    streetName: String(address?.streetName || '').trim().toLowerCase(),
    buildingNumber: String(address?.buildingNumber || '').trim().toLowerCase(),
    zipCode: String(address?.zipCode || '').trim().toLowerCase(),
    city: String(address?.city || '').trim().toLowerCase(),
  });
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function toGeocodeCsv(rows) {
  const headers = [
    'Id',
    'ImmoNr',
    'breitengrad',
    'laengengrad',
    'strasse',
    'hausnummer',
    'plz',
    'ort',
    'geocode_status',
    'geocode_query',
    'geocode_display_name',
  ];

  const lines = [headers.join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.immoNr,
        row.latitude,
        row.longitude,
        row.address?.streetName,
        row.address?.buildingNumber,
        row.address?.zipCode,
        row.address?.city,
        row.status,
        row.query,
        row.displayName,
      ]
        .map(csvEscape)
        .join(',')
    );
  }

  return `${lines.join('\n')}\n`;
}

function toOnOfficeImportCsv(rows) {
  const headers = ['ImmoNr', 'breitengrad', 'laengengrad'];
  const lines = [headers.join(',')];

  for (const row of rows) {
    lines.push([row.immoNr, row.latitude, row.longitude].map(csvEscape).join(','));
  }

  return `${lines.join('\n')}\n`;
}

module.exports = {
  buildAddressLabel,
  buildNominatimParams,
  hasAddressParts,
  normalizeCacheKey,
  toGeocodeCsv,
  toOnOfficeImportCsv,
  _test: {
    csvEscape,
  },
};
