const MODELS_URL = 'https://gen.pollinations.ai/v1/models';
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

let cache = null;
let pendingRequest = null;

export function normalizePollinationsTextModels(payload) {
  const records = Array.isArray(payload) ? payload : payload?.data;
  if (!Array.isArray(records)) return [];

  return records
    .filter((model) => model?.category === 'text'
      && Array.isArray(model.supported_endpoints)
      && model.supported_endpoints.includes('/v1/chat/completions')
      && typeof model.id === 'string'
      && model.id.trim())
    .map((model) => ({
      id: model.id,
      title: typeof model.title === 'string' && model.title.trim() ? model.title : model.id,
      paidOnly: model.paid_only === true,
      ownedBy: typeof model.owned_by === 'string' ? model.owned_by : null,
      description: typeof model.description === 'string' ? model.description : '',
    }))
    .sort((a, b) => Number(a.paidOnly) - Number(b.paidOnly) || a.title.localeCompare(b.title));
}

export async function getPollinationsTextModels({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const currentTime = now();
  if (cache && cache.expiresAt > currentTime) return cache.models;
  if (pendingRequest) return pendingRequest;

  pendingRequest = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(MODELS_URL, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Pollinations model catalog returned ${response.status}`);
      const models = normalizePollinationsTextModels(await response.json());
      if (!models.length) throw new Error('Pollinations model catalog contains no compatible text models');
      cache = { models, expiresAt: now() + CACHE_TTL_MS };
      return models;
    } catch (error) {
      if (cache?.models?.length) return cache.models;
      throw error;
    } finally {
      clearTimeout(timeout);
      pendingRequest = null;
    }
  })();

  return pendingRequest;
}

export function clearPollinationsTextModelsCache() {
  cache = null;
  pendingRequest = null;
}
