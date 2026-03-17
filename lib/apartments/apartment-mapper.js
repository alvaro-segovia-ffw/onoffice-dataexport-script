'use strict';

function parseBool(v) {
  if (v === true || v === 1 || v === '1') return true;
  if (v === false || v === 0 || v === '0') return false;

  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'ja' || s === 'yes' || s === 'true') return true;
    if (s === 'nein' || s === 'no' || s === 'false') return false;
  }
  return null;
}

function parseNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function toSqFtFromSqm(val) {
  const n = parseNumber(val);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10.7639 * 100) / 100;
}

function normalizeElevator(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.length) return [v];
  return [];
}

function normalizeDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s === '0000-00-00') return null;
  return s;
}

function mapEstateToApartment(record) {
  const e = record?.elements || {};
  const id = String(e?.Id ?? record?.id ?? '');
  const bedrooms = parseNumber(e?.anzahl_schlafzimmer);
  const bathrooms = parseNumber(e?.anzahl_badezimmer);
  const roomsTotal =
    parseNumber(e?.anzahl_zimmer) ??
    parseNumber(e?.anzahl_raeume) ??
    (bedrooms ?? null);

  const address = {
    buildingNumber: e?.hausnummer || null,
    streetName: e?.strasse || null,
    neighborhood:
      Array.isArray(e?.regionaler_zusatz) && e.regionaler_zusatz.length
        ? e.regionaler_zusatz
        : null,
    city: e?.ort || null,
    zipCode: e?.plz || null,
  };

  const features = {
    elevator: normalizeElevator(e?.fahrstuhl),
    balcony: parseBool(e?.balkon) ?? false,
    furnished: parseBool(e?.moebliert),
  };

  const availability = {
    from: normalizeDate(e?.abdatum),
    until: normalizeDate(e?.bisdatum),
  };

  const rent = {
    warmRent: parseNumber(e?.warmmiete),
    coldRent: parseNumber(e?.kaltmiete),
    currency: 'EUR',
  };

  return {
    id,
    address,
    latitude: parseNumber(e?.breitengrad),
    longitude: parseNumber(e?.laengengrad),
    roomsTotal,
    bedrooms: bedrooms ?? null,
    bathrooms: bathrooms ?? null,
    areaSqft: toSqFtFromSqm(e?.wohnflaeche),
    photos: [],
    features,
    description: e?.objektbeschreibung || null,
    locationDescription: e?.lage || null,
    equipmentDescription: e?.ausstatt_beschr || null,
    availability,
    rent,
    deposit: e?.kaution || null,
    floorLevel: e?.etage || null,
  };
}

function mapEstateToGeocodeRecord(record) {
  const e = record?.elements || {};
  const id = String(e?.Id ?? record?.id ?? '');
  const immoNr = String(e?.objektnr_extern ?? '').trim() || null;

  return {
    id,
    immoNr,
    address: {
      streetName: e?.strasse || null,
      buildingNumber: e?.hausnummer || null,
      zipCode: e?.plz || null,
      city: e?.ort || null,
    },
    latitude: parseNumber(e?.breitengrad),
    longitude: parseNumber(e?.laengengrad),
  };
}

module.exports = {
  mapEstateToApartment,
  mapEstateToGeocodeRecord,
  normalizeDate,
  parseBool,
  parseNumber,
  toSqFtFromSqm,
};
