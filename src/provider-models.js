import {safeEndpoint, translationProviders} from './engines.js';
import {readProviderJSON, providerError} from './provider-http.js';

const compatible = new Set(['openai','groq','together','fireworks','mistral','openrouter','ollama','custom','nvidia','cerebras','sambanova','deepseek','huggingface']);
export const supportsModelCatalog = provider => compatible.has(provider) || provider === 'gemini';
export const needsTranslationModel = provider => supportsModelCatalog(provider) || provider === 'anthropic';
const safeID = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_./:@+-]{0,255}$/.test(id);

export function modelCatalogRequest(config) {
  if(config.allowModelList !== true) throw Error('Explicit permission is required to send your API key for model discovery. No transcript or inference request is needed.');
  if(!supportsModelCatalog(config.provider)) throw Error('This provider does not expose an integrated model catalog. Enter an exact supported model ID manually.');
  const endpoint = config.endpoint || translationProviders.find(p => p.id === config.provider)?.endpoint;
  const url = safeEndpoint(endpoint.replace('{model}', 'catalog-placeholder'));
  const headers = {};
  let catalog = 'compatible';
  if(config.provider === 'gemini') {
    catalog = 'gemini';
    if(!/\/models\/[^/]+:generateContent$/.test(url.pathname)) throw Error('Use a native Gemini generateContent endpoint to load its model catalog.');
    url.pathname = url.pathname.replace(/\/models\/[^/]+:generateContent$/, '/models');
    url.search = ''; url.searchParams.set('pageSize', '100');
    if(config.key) headers['x-goog-api-key'] = config.key;
  } else if(config.provider === 'together' && url.origin === 'https://api.together.ai' && url.pathname === '/v1/chat/completions') {
    catalog = 'together'; url.pathname = '/v2/supported-models'; url.search = '';
    url.searchParams.set('product', 'PRODUCT_SERVERLESS'); url.searchParams.set('modality', 'MODALITY_TEXT'); url.searchParams.set('limit', '100');
    if(config.key) headers.Authorization = `Bearer ${config.key}`;
  } else if(config.provider === 'fireworks' && url.origin === 'https://api.fireworks.ai' && url.pathname === '/inference/v1/chat/completions') {
    catalog = 'fireworks'; url.pathname = '/v1/accounts/fireworks/models'; url.search = '';
    url.searchParams.set('filter', 'supports_serverless=true'); url.searchParams.set('pageSize', '100');
    if(config.key) headers.Authorization = `Bearer ${config.key}`;
  } else {
    if(!/\/chat\/completions\/?$/.test(url.pathname)) throw Error('The configured compatible endpoint must end in /chat/completions to discover its models.');
    url.pathname = url.pathname.replace(/\/chat\/completions\/?$/, '/models');
    if(config.key) headers.Authorization = `Bearer ${config.key}`;
  }
  return {url: url.href, method: 'GET', headers, catalog};
}
export async function listProviderModels(config, {signal, fetchFn = fetch} = {}) {
  const request = modelCatalogRequest(config);
  const {url: baseURL, catalog, ...init} = request;
  const scoped = signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
  const models = new Map(); let pageToken = '', complete = true;
  for(let page = 0; page < 8; page++) {
    scoped.throwIfAborted();
    const url = new URL(baseURL);
    if(pageToken) url.searchParams.set(catalog === 'together' ? 'after' : 'pageToken', pageToken);
    let response;
    try { response = await fetchFn(url.href, {...init, signal: scoped, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store'}); }
    catch(error) { if(scoped.aborted) throw scoped.reason; throw Error('Could not load the model catalog. Check browser CORS, the endpoint and your API key; enter an exact supported model ID manually if this provider blocks browser discovery.'); }
    if(!response.ok) throw await providerError(response, config.provider, scoped);
    const data = await readProviderJSON(response, 2 * 1024 * 1024, scoped);
    const rows = Array.isArray(data) ? data : config.provider === 'gemini' ? data.models : data.data || data.models;
    if(!Array.isArray(rows)) throw Error('Provider returned an invalid model catalog.');
    for(const row of rows) {
      if(row?.active === false || ['embedding','rerank','image','audio','transcription','moderation'].includes(row?.type)) continue;
      if(config.provider === 'gemini' && !row.supportedGenerationMethods?.includes('generateContent')) continue;
      if(catalog === 'together' && ((row.capabilities && !row.capabilities.includes('CAPABILITY_CHAT')) || (row.products && !row.products.includes('PRODUCT_SERVERLESS')) || ['SUPPORTED_MODEL_STATUS_DEPRECATED','SUPPORTED_MODEL_STATUS_HIDDEN'].includes(row.status))) continue;
      if(catalog === 'fireworks' && row.supportsServerless === false) continue;
      if(config.provider === 'mistral' && row.capabilities?.completion_chat === false) continue;
      const id = catalog === 'gemini' && row.name?.startsWith('models/') ? row.name.slice(7) : ['together','fireworks'].includes(catalog) ? row.name : row.id;
      if(!safeID(id)) continue;
      if(config.provider === 'huggingface') {
        for(const provider of row.providers || []) {
          if(provider.status !== 'live' || !/^[a-z0-9_-]{1,64}$/.test(provider.provider)) continue;
          const pinned = `${id}:${provider.provider}`;
          models.set(pinned, {id: pinned, name: `${pinned} · ${provider.is_free === true ? 'promotion: verify terms' : 'paid/account credits'}`});
        }
      } else models.set(id, {id, name: typeof row.displayName === 'string' ? row.displayName.slice(0, 120) : id});
      if(models.size >= 1000) { complete = false; break; }
    }
    const next = catalog === 'together' ? data.next_cursor : ['gemini','fireworks'].includes(catalog) ? data.nextPageToken : '';
    pageToken = typeof next === 'string' ? next : '';
    if(!pageToken || !complete) break;
    if(page === 7) complete = false;
  }
  return {models: [...models.values()].sort((a,b) => a.id.localeCompare(b.id)), complete};
}
