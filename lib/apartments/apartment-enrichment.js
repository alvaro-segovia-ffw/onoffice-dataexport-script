'use strict';

const { buildPicturesMap, sortPhotos } = require('./picture-utils');
const { enrichApartmentsWithGeocodedCoordinates } = require('../geocoding/geocoder-client');

async function enrichApartmentCoordinates(apartments, options = {}) {
  await enrichApartmentsWithGeocodedCoordinates(apartments, {
    fetchImpl: options.geocoderFetchImpl,
    headers: options.geocoderHeaders,
    timeoutMs: options.geocoderTimeoutMs,
    countryCode: options.geocoderCountryCode,
  });
}

function attachApartmentPhotos(apartments, pictureRecords) {
  const picturesMap = buildPicturesMap(pictureRecords);

  for (const apartment of apartments) {
    const photos = picturesMap.get(String(apartment.id)) || [];
    photos.sort(sortPhotos);
    apartment.photos = photos;
  }
}

module.exports = {
  attachApartmentPhotos,
  enrichApartmentCoordinates,
};
