'use strict';

const { buildPartnerApartmentAccessPolicy } = require('../partners/partner-access-policy');
const { projectApartments } = require('./apartment-projector');
const {
  fetchApartmentsLive,
  fetchOnSaleApartmentsLive,
  fetchRentalApartmentsLive,
} = require('./apartment-service');

async function loadPartnerApartmentsLive(actor, options = {}) {
  const accessPolicy = buildPartnerApartmentAccessPolicy(actor);
  if (!accessPolicy.canReadApartments) {
    throw new Error('Partner apartment access requires apartments:read scope.');
  }

  const fetchApartments = options.fetchApartments || fetchApartmentsLive;
  const apartments = await fetchApartments(options.fetchOptions || {});

  return {
    apartments,
    accessPolicy,
    dataSource: 'live-onoffice',
  };
}

async function listPartnerApartmentsLive(actor, options = {}) {
  const result = await loadPartnerApartmentsLive(actor, options);

  return {
    apartments: projectApartments(result.apartments, result.accessPolicy),
    accessPolicy: result.accessPolicy,
    dataSource: result.dataSource,
  };
}

async function listPartnerRentalApartmentsLive(actor, options = {}) {
  const result = await loadPartnerApartmentsLive(actor, {
    ...options,
    fetchApartments: options.fetchApartments || fetchRentalApartmentsLive,
  });

  return {
    apartments: projectApartments(result.apartments, result.accessPolicy),
    accessPolicy: result.accessPolicy,
    dataSource: result.dataSource,
  };
}

async function listPartnerOnSaleApartmentsLive(actor, options = {}) {
  const result = await loadPartnerApartmentsLive(actor, {
    ...options,
    fetchApartments: options.fetchApartments || fetchOnSaleApartmentsLive,
  });

  return {
    apartments: projectApartments(result.apartments, result.accessPolicy),
    accessPolicy: result.accessPolicy,
    dataSource: result.dataSource,
  };
}

async function findPartnerApartmentLiveById(actor, apartmentId, options = {}) {
  const normalizedApartmentId = String(apartmentId || '').trim();
  const result = await loadPartnerApartmentsLive(actor, options);
  const apartment = result.apartments.find((item) => String(item?.id || '').trim() === normalizedApartmentId) || null;

  return {
    apartment: apartment ? projectApartments([apartment], result.accessPolicy)[0] || null : null,
    accessPolicy: result.accessPolicy,
    dataSource: result.dataSource,
  };
}

async function listPartnerApartmentsLiveByCity(actor, city, options = {}) {
  const normalizedCity = String(city || '')
    .trim()
    .toLowerCase();
  const result = await loadPartnerApartmentsLive(actor, options);
  const filteredApartments = result.apartments.filter(
    (apartment) => String(apartment?.address?.city || '').trim().toLowerCase() === normalizedCity
  );

  return {
    apartments: projectApartments(filteredApartments, result.accessPolicy),
    accessPolicy: result.accessPolicy,
    dataSource: result.dataSource,
  };
}

module.exports = {
  findPartnerApartmentLiveById,
  listPartnerApartmentsLiveByCity,
  listPartnerApartmentsLive,
  listPartnerOnSaleApartmentsLive,
  listPartnerRentalApartmentsLive,
};
