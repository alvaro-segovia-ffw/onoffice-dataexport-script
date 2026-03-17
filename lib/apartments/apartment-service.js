'use strict';

const { mapEstateToApartment, mapEstateToGeocodeRecord } = require('./apartment-mapper');
const { buildPicturesMap, sortPhotos } = require('./picture-utils');
const { enrichApartmentsWithGeocodedCoordinates } = require('../geocoding/geocoder-client');
const {
  fetchEstates,
  fetchPicturesForEstateIds,
  getOnOfficeConfig,
} = require('../onoffice/onoffice-client');

async function fetchApartmentAddressRecordsLive(options = {}) {
  const config = options.config || getOnOfficeConfig();
  const estateRecords = await fetchEstates(config, {
    fetchImpl: options.onOfficeFetchImpl,
  });
  return estateRecords.map(mapEstateToGeocodeRecord);
}

async function fetchApartmentsLive(options = {}) {
  const config = options.config || getOnOfficeConfig();
  const estateRecords = await fetchEstates(config, {
    fetchImpl: options.onOfficeFetchImpl,
  });
  const apartments = estateRecords.map(mapEstateToApartment);

  await enrichApartmentsWithGeocodedCoordinates(apartments, {
    fetchImpl: options.geocoderFetchImpl,
    headers: options.geocoderHeaders,
    timeoutMs: options.geocoderTimeoutMs,
    countryCode: options.geocoderCountryCode,
  });

  const estateIds = apartments.map((x) => x.id).filter(Boolean);
  const picturesRecords =
    estateIds.length > 0
      ? await fetchPicturesForEstateIds(config, estateIds, {
          fetchImpl: options.onOfficeFetchImpl,
        })
      : [];
  const picturesMap = buildPicturesMap(picturesRecords);

  for (const apartment of apartments) {
    const photos = picturesMap.get(String(apartment.id)) || [];
    photos.sort(sortPhotos);
    apartment.photos = photos;
  }

  return apartments;
}

module.exports = {
  fetchApartmentAddressRecordsLive,
  fetchApartmentsLive,
};
