'use strict';

const { mapEstateToApartment, mapEstateToGeocodeRecord } = require('./apartment-mapper');
const { fetchApartmentEstateRecords, fetchApartmentPictureRecords } = require('./apartment-source');
const { attachApartmentPhotos, enrichApartmentCoordinates } = require('./apartment-enrichment');

async function fetchApartmentAddressRecordsLive(options = {}) {
  const estateRecords = await fetchApartmentEstateRecords(options);
  return estateRecords.map(mapEstateToGeocodeRecord);
}

async function fetchApartmentsLive(options = {}) {
  const estateRecords = await fetchApartmentEstateRecords(options);
  const apartments = estateRecords.map(mapEstateToApartment);

  await enrichApartmentCoordinates(apartments, options);

  const estateIds = apartments.map((x) => x.id).filter(Boolean);
  const pictureRecords = await fetchApartmentPictureRecords(estateIds, options);
  attachApartmentPhotos(apartments, pictureRecords);

  return apartments;
}

module.exports = {
  fetchApartmentAddressRecordsLive,
  fetchApartmentsLive,
};
