'use strict';

function buildApartmentsMeta(req, startedAt, finishedAt, count, extra = {}) {
  return {
    requestedBy: req.authActor.partnerId,
    authType: req.authActor.type,
    count,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    ...extra,
  };
}

function serializeApartmentListResponse(req, apartments, startedAt, finishedAt, extra = {}) {
  return {
    apartments,
    meta: buildApartmentsMeta(req, startedAt, finishedAt, apartments.length, extra),
  };
}

function serializeApartmentResponse(req, apartment, startedAt, finishedAt, extra = {}) {
  return {
    apartment,
    meta: buildApartmentsMeta(req, startedAt, finishedAt, 1, extra),
  };
}

module.exports = {
  buildApartmentsMeta,
  serializeApartmentListResponse,
  serializeApartmentResponse,
};
