'use strict';

const { buildPartnerApartmentAccessPolicy } = require('../partners/partner-access-policy');
const { projectApartments } = require('./apartment-projector');
const { fetchApartmentsLive } = require('./apartment-service');

async function listPartnerApartmentsLive(actor, options = {}) {
  const accessPolicy = buildPartnerApartmentAccessPolicy(actor);
  if (!accessPolicy.canReadApartments) {
    throw new Error('Partner apartment access requires apartments:read scope.');
  }

  const fetchApartments = options.fetchApartments || fetchApartmentsLive;
  const apartments = await fetchApartments(options.fetchOptions || {});

  return {
    apartments: projectApartments(apartments, accessPolicy),
    accessPolicy,
    dataSource: 'live-onoffice',
  };
}

module.exports = {
  listPartnerApartmentsLive,
};
