'use strict';

function serializeApiKey(apiKey) {
  if (!apiKey) return null;

  const { id: _internalId, ...publicApiKey } = apiKey;
  return publicApiKey;
}

function serializeApiKeyList(apiKeys) {
  return Array.isArray(apiKeys) ? apiKeys.map(serializeApiKey) : [];
}

function serializeRotatedApiKey(rotated) {
  if (!rotated) return null;

  return {
    previousApiKeyId: rotated.previousApiKeyId,
    apiKey: serializeApiKey(rotated.apiKey),
    secret: rotated.secret,
  };
}

module.exports = {
  serializeApiKey,
  serializeApiKeyList,
  serializeRotatedApiKey,
};
