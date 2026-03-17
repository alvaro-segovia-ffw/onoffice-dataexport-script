const state = {
  apiKeys: [],
  selectedApiKeyId: null,
};

export function getApiKeys() {
  return state.apiKeys;
}

export function setApiKeys(apiKeys) {
  state.apiKeys = Array.isArray(apiKeys) ? apiKeys : [];
}

export function getSelectedApiKeyId() {
  return state.selectedApiKeyId;
}

export function setSelectedApiKeyId(apiKeyId) {
  state.selectedApiKeyId = apiKeyId || null;
}

export function findSelectedApiKey() {
  return state.apiKeys.find((apiKey) => apiKey.publicId === state.selectedApiKeyId) || null;
}

export function ensureSelectedApiKey() {
  if (!findSelectedApiKey()) {
    state.selectedApiKeyId = state.apiKeys[0]?.publicId || null;
  }
}
