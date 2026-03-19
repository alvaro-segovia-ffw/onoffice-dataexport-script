'use strict';

const { buildNominatimParams, hasAddressParts } = require('./apartment-geocoding');

const DEFAULT_GEOCODER_BASE_URL =
  process.env.GEOCODER_BASE_URL || 'https://nominatim.openstreetmap.org/search';
const DEFAULT_GEOCODER_COUNTRY_CODE = process.env.GEOCODER_COUNTRY_CODE || 'de';
const DEFAULT_GEOCODER_TIMEOUT_MS = Number(process.env.GEOCODER_TIMEOUT_MS || 4000);

function getGeocoderHeaders() {
  const userAgent = String(process.env.GEOCODER_USER_AGENT || '').trim();
  if (!userAgent) return null;

  return {
    Accept: 'application/json',
    'User-Agent': userAgent,
  };
}

async function geocodeAddress(address, options = {}) {
  if (!hasAddressParts(address)) return null;

  const fetchImpl = options.fetchImpl || fetch;
  const headers = options.headers || getGeocoderHeaders();
  if (!headers) return null;

  const params = buildNominatimParams(address, {
    countryCode: options.countryCode || DEFAULT_GEOCODER_COUNTRY_CODE,
    email: process.env.GEOCODER_EMAIL,
  });

  const controller = new AbortController();
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : DEFAULT_GEOCODER_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(`${DEFAULT_GEOCODER_BASE_URL}?${params.toString()}`, {
      headers,
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const payload = await res.json();
    const first = Array.isArray(payload) ? payload[0] : null;
    if (!first) return null;

    const latitude = Number(first.lat);
    const longitude = Number(first.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch (_err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichApartmentsWithGeocodedCoordinates(apartments, options = {}) {
  if (!Array.isArray(apartments) || apartments.length === 0) return apartments;

  const headers = options.headers || getGeocoderHeaders();
  if (!headers) return apartments;

  for (const apartment of apartments) {
    if (Number.isFinite(apartment?.latitude) && Number.isFinite(apartment?.longitude)) {
      continue;
    }

    const coords = await geocodeAddress(apartment?.address, {
      fetchImpl: options.fetchImpl,
      headers,
      timeoutMs: options.timeoutMs,
      countryCode: options.countryCode,
    });

    if (!coords) continue;
    apartment.latitude = coords.latitude;
    apartment.longitude = coords.longitude;
  }

  return apartments;
}

module.exports = {
  enrichApartmentsWithGeocodedCoordinates,
  geocodeAddress,
  getGeocoderHeaders,
};
