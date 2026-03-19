'use strict';

const fs = require('fs/promises');
const path = require('path');

const { fetchApartmentAddressRecordsLive } = require('../lib/export/apartment-export-service');
const {
  buildAddressLabel,
  buildNominatimParams,
  hasAddressParts,
  normalizeCacheKey,
  toGeocodeCsv,
  toOnOfficeImportCsv,
} = require('../lib/geocoding/apartment-geocoding');
const { loadAppEnv } = require('../lib/load-dotenv');

loadAppEnv(process.cwd());

const DEFAULT_PROVIDER = 'nominatim';
const DEFAULT_COUNTRY_CODE = process.env.GEOCODER_COUNTRY_CODE || 'de';
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'exports', 'geocoding');
const DEFAULT_CACHE_FILE = path.join(DEFAULT_OUTPUT_DIR, 'nominatim-cache.json');
const DEFAULT_DELAY_MS = Number(process.env.GEOCODER_DELAY_MS || 1100);
const DEFAULT_BASE_URL =
  process.env.GEOCODER_BASE_URL || 'https://nominatim.openstreetmap.org/search';

function parseArgs(argv) {
  const options = {
    force: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    cacheFile: DEFAULT_CACHE_FILE,
    provider: DEFAULT_PROVIDER,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--output-dir') {
      options.outputDir = path.resolve(argv[i + 1] || '');
      i += 1;
      continue;
    }

    if (arg === '--cache-file') {
      options.cacheFile = path.resolve(argv[i + 1] || '');
      i += 1;
      continue;
    }

    if (arg === '--provider') {
      options.provider = String(argv[i + 1] || '').trim().toLowerCase();
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/geocode-apartments.js [options]

Options:
  --force                 Recalculate coordinates even if the estate already has them
  --output-dir <dir>      Directory for CSV/JSON results
  --cache-file <file>     JSON cache file for geocoding responses
  --provider <name>       Geocoding provider (only "nominatim" is supported)
  --help, -h              Show this help
`);
}

function buildFileTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '_',
    pad(now.getHours()),
    '-',
    pad(now.getMinutes()),
    '-',
    pad(now.getSeconds()),
  ].join('');
}

async function readCache(cacheFile) {
  try {
    const raw = await fs.readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeCache(cacheFile, cache) {
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGeocoderHeaders() {
  const userAgent = String(process.env.GEOCODER_USER_AGENT || '').trim();
  if (!userAgent) {
    throw new Error('Missing GEOCODER_USER_AGENT. Set a descriptive value before geocoding.');
  }

  return {
    Accept: 'application/json',
    'User-Agent': userAgent,
  };
}

async function geocodeWithNominatim(address, headers) {
  const params = buildNominatimParams(address, {
    countryCode: DEFAULT_COUNTRY_CODE,
    email: process.env.GEOCODER_EMAIL,
  });

  const res = await fetch(`${DEFAULT_BASE_URL}?${params.toString()}`, {
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Nominatim HTTP ${res.status}: ${text}`);
  }

  const payload = await res.json();
  const first = Array.isArray(payload) ? payload[0] : null;
  if (!first) return null;

  return {
    latitude: Number(first.lat),
    longitude: Number(first.lon),
    displayName: first.display_name || null,
    raw: first,
  };
}

async function geocodeAddress(address, cache, headers, state) {
  const cacheKey = normalizeCacheKey(address);
  if (cache[cacheKey]) return { ...cache[cacheKey], cacheHit: true };

  const now = Date.now();
  const waitMs = Math.max(0, state.nextAllowedAt - now);
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  const result = await geocodeWithNominatim(address, headers);
  state.nextAllowedAt = Date.now() + DEFAULT_DELAY_MS;

  const cachedValue = {
    latitude: result?.latitude ?? null,
    longitude: result?.longitude ?? null,
    displayName: result?.displayName ?? null,
  };
  cache[cacheKey] = cachedValue;
  return { ...cachedValue, cacheHit: false };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (options.provider !== 'nominatim') {
    throw new Error(`Unsupported provider: ${options.provider}`);
  }

  const headers = getGeocoderHeaders();
  const startedAt = new Date();
  const cache = await readCache(options.cacheFile);
  const estates = await fetchApartmentAddressRecordsLive();
  const results = [];
  const state = { nextAllowedAt: 0 };

  for (const estate of estates) {
    const query = buildAddressLabel(estate.address);
    const hasExistingCoords =
      Number.isFinite(estate.latitude) && Number.isFinite(estate.longitude);

    if (!hasAddressParts(estate.address)) {
      results.push({
        ...estate,
        status: 'missing_address',
        query,
        displayName: null,
      });
      continue;
    }

    if (hasExistingCoords && !options.force) {
      results.push({
        ...estate,
        status: 'skipped_existing',
        query,
        displayName: null,
      });
      continue;
    }

    try {
      const geocoded = await geocodeAddress(estate.address, cache, headers, state);
      results.push({
        ...estate,
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
        status: geocoded.latitude !== null && geocoded.longitude !== null ? 'geocoded' : 'not_found',
        query,
        displayName: geocoded.displayName,
        cacheHit: geocoded.cacheHit,
      });
    } catch (err) {
      results.push({
        ...estate,
        status: 'error',
        query,
        displayName: null,
        error: err.message || 'Unknown error',
      });
    }
  }

  await fs.mkdir(options.outputDir, { recursive: true });
  await writeCache(options.cacheFile, cache);

  const fileStamp = buildFileTimestamp();
  const csvPath = path.join(options.outputDir, `geocoded-apartments_${fileStamp}.csv`);
  const importCsvPath = path.join(
    options.outputDir,
    `geocoded-apartments_${fileStamp}_onoffice-import.csv`
  );
  const jsonPath = path.join(options.outputDir, `geocoded-apartments_${fileStamp}.json`);
  const meta = {
    provider: options.provider,
    force: options.force,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    totals: {
      estates: results.length,
      geocoded: results.filter((item) => item.status === 'geocoded').length,
      skippedExisting: results.filter((item) => item.status === 'skipped_existing').length,
      missingAddress: results.filter((item) => item.status === 'missing_address').length,
      notFound: results.filter((item) => item.status === 'not_found').length,
      errors: results.filter((item) => item.status === 'error').length,
    },
  };

  await fs.writeFile(csvPath, toGeocodeCsv(results), 'utf8');
  await fs.writeFile(importCsvPath, toOnOfficeImportCsv(results), 'utf8');
  await fs.writeFile(jsonPath, JSON.stringify({ meta, results }, null, 2), 'utf8');

  console.log(`CSV written to ${csvPath}`);
  console.log(`Import CSV written to ${importCsvPath}`);
  console.log(`JSON written to ${jsonPath}`);
  console.log(JSON.stringify(meta, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
