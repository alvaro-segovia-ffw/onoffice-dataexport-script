'use strict';

const {
  fetchEstates,
  fetchOnSaleEstates,
  fetchRentalEstates,
  fetchPicturesForEstateIds,
  getOnOfficeConfig,
} = require('../onoffice/onoffice-client');

function resolveSourceConfig(options = {}) {
  return options.config || getOnOfficeConfig();
}

async function fetchApartmentEstateRecords(options = {}) {
  const config = resolveSourceConfig(options);
  return fetchEstates(config, {
    fetchImpl: options.onOfficeFetchImpl,
  });
}

async function fetchRentalApartmentEstateRecords(options = {}) {
  const config = resolveSourceConfig(options);
  return fetchRentalEstates(config, {
    fetchImpl: options.onOfficeFetchImpl,
  });
}

async function fetchOnSaleApartmentEstateRecords(options = {}) {
  const config = resolveSourceConfig(options);
  return fetchOnSaleEstates(config, {
    fetchImpl: options.onOfficeFetchImpl,
  });
}

async function fetchApartmentPictureRecords(estateIds, options = {}) {
  if (!Array.isArray(estateIds) || estateIds.length === 0) {
    return [];
  }

  const config = resolveSourceConfig(options);
  return fetchPicturesForEstateIds(config, estateIds, {
    fetchImpl: options.onOfficeFetchImpl,
  });
}

module.exports = {
  fetchApartmentEstateRecords,
  fetchOnSaleApartmentEstateRecords,
  fetchRentalApartmentEstateRecords,
  fetchApartmentPictureRecords,
};
