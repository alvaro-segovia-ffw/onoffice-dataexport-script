'use strict';

const crypto = require('crypto');

const DEFAULT_API_URL = 'https://api.onoffice.de/api/stable/api.php';
const LIST_LIMIT = 100;
const LIST_OFFSET = 0;
const PICS_BATCH_SIZE = 100;

function getEstateLanguage() {
  return process.env.ONOFFICE_ESTATE_LANGUAGE || 'ENG';
}

function unixTs() {
  return Math.floor(Date.now() / 1000);
}

function buildHmacV2({ secret, token, timestamp, actionid, resourcetype }) {
  const base = `${timestamp}${token}${resourcetype}${actionid}`;
  return crypto.createHmac('sha256', secret).update(base, 'utf8').digest('base64');
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function extractEstateRecords(result) {
  const records = result?.data?.records;
  return Array.isArray(records) ? records : [];
}

function extractPicturesRecords(result) {
  const r1 = result?.data?.records;
  const r2 = result?.data;
  const r3 = result?.records;
  if (Array.isArray(r1)) return r1;
  if (Array.isArray(r2)) return r2;
  if (Array.isArray(r3)) return r3;
  return [];
}

function getOnOfficeConfig() {
  const apiUrl = process.env.ONOFFICE_URL || DEFAULT_API_URL;
  const token = process.env.ONOFFICE_TOKEN;
  const secret = process.env.ONOFFICE_SECRET;

  if (!apiUrl || !token || !secret) {
    throw new Error('Missing ONOFFICE_URL / ONOFFICE_TOKEN / ONOFFICE_SECRET');
  }

  return { apiUrl, token, secret };
}

async function postSmart({ apiUrl, token }, actions, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const body = { token, request: { actions } };

  const res = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}. ${txt}`);
  }

  const json = await res.json();
  if (json?.status?.code !== 200) {
    throw new Error(`API status != 200: ${JSON.stringify(json?.status)}`);
  }

  return json;
}

function buildEstateReadParameters(options = {}) {
  const estateLanguage = getEstateLanguage();

  return {
    data: [
      'Id',
      'objektnr_extern',
      'strasse',
      'hausnummer',
      'plz',
      'ort',
      'breitengrad',
      'laengengrad',
      'anzahl_schlafzimmer',
      'anzahl_badezimmer',
      'anzahl_zimmer',
      'wohnflaeche',
      'objektbeschreibung',
      'lage',
      'ausstatt_beschr',
      'abdatum',
      'bisdatum',
      'warmmiete',
      'kaltmiete',
      'kaution',
      'etage',
      'fahrstuhl',
      'balkon',
      'moebliert',
      'objektart',
      'objekttyp',
    ],
    estatelanguage: estateLanguage,
    outputlanguage: estateLanguage,
    addestatelanguage: true,
    filter: {
      status: [{ op: '=', val: '1' }],
      veroeffentlichen: [{ op: '=', val: '1' }],
      objektart: [{ op: '=', val: 'wohnung' }],
      ...(options.filter || {}),
    },
    listlimit: LIST_LIMIT,
    listoffset: LIST_OFFSET,
    sortby: { kaufpreis: 'ASC', warmmiete: 'ASC' },
  };
}

async function fetchEstates(config, options = {}) {
  const ts = unixTs();
  const parameters = buildEstateReadParameters(options);

  const action = {
    actionid: 'urn:onoffice-de-ns:smart:2.5:smartml:action:read',
    identifier: 'estates_list',
    resourceid: '',
    resourcetype: 'estate',
    timestamp: ts,
    hmac_version: 2,
    parameters,
  };

  action.hmac = buildHmacV2({
    secret: config.secret,
    token: config.token,
    timestamp: action.timestamp,
    actionid: action.actionid,
    resourcetype: action.resourcetype,
  });

  const json = await postSmart(config, [action], options);
  const result = json?.response?.results?.[0];
  if (result?.status?.errorcode) {
    throw new Error(`estate read error: ${result.status.errorcode} ${result.status.message}`);
  }

  return extractEstateRecords(result);
}

async function fetchRentalEstates(config, options = {}) {
  return fetchEstates(config, {
    ...options,
    filter: {
      ...(options.filter || {}),
      nutzungsart: [{ op: '=', val: 'waz' }],
    },
  });
}

async function fetchOnSaleEstates(config, options = {}) {
  return fetchEstates(config, {
    ...options,
    filter: {
      ...(options.filter || {}),
      exclusive: [{ op: '=', val: '1' }],
      veroeffentlichen: [{ op: '=', val: '1' }],
    },
  });
}

async function fetchPicturesForEstateIds(config, estateIds, options = {}) {
  const allRecords = [];

  for (const batch of chunk(estateIds, PICS_BATCH_SIZE)) {
    const ts = unixTs();
    const parameters = {
      categories: ['Titelbild', 'Foto', 'Grundriss'],
      estateids: batch.map((x) => Number(x)),
      language: 'DEU',
      size: 'original',
    };

    const action = {
      actionid: 'urn:onoffice-de-ns:smart:2.5:smartml:action:get',
      identifier: `pics_${batch[0]}_${batch[batch.length - 1]}`,
      resourceid: '',
      resourcetype: 'estatepictures',
      timestamp: ts,
      hmac_version: 2,
      parameters,
    };

    action.hmac = buildHmacV2({
      secret: config.secret,
      token: config.token,
      timestamp: action.timestamp,
      actionid: action.actionid,
      resourcetype: action.resourcetype,
    });

    const json = await postSmart(config, [action], options);
    const result = json?.response?.results?.[0];

    if (result?.status?.errorcode) {
      throw new Error(`estatepictures get error: ${result.status.errorcode} ${result.status.message}`);
    }

    const records = extractPicturesRecords(result);
    allRecords.push(...records);
  }

  return allRecords;
}

module.exports = {
  buildHmacV2,
  chunk,
  extractEstateRecords,
  extractPicturesRecords,
  fetchEstates,
  fetchOnSaleEstates,
  fetchRentalEstates,
  fetchPicturesForEstateIds,
  getEstateLanguage,
  getOnOfficeConfig,
  postSmart,
};
