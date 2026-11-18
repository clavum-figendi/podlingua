// Bounded provider diagnostics. Never display a provider's raw error message:
// services sometimes echo credentials or transcript text in it.
export async function readProviderJSON(response, maxBytes = 8 * 1024 * 1024, signal) {
  const reader = response.body?.getReader();
  if(!reader) throw Error('Provider returned an empty response');
  let total = 0; const chunks = [];
  try {
    while(true) {
      signal?.throwIfAborted();
      const {done, value} = await reader.read();
      if(done) break;
      total += value.byteLength;
      if(total > maxBytes) throw Error('Provider response exceeds its byte limit');
      chunks.push(value);
    }
  } catch(error) { void reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for(const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw Error('Provider returned invalid JSON'); }
}

export async function providerError(response, provider = 'Provider', signal) {
  let data = {};
  try { data = await readProviderJSON(response, 32 * 1024, signal); }
  catch { if(signal?.aborted) throw signal.reason; }
  const detail = data?.error ?? data;
  const rawCode = typeof detail === 'string' ? detail : detail?.code || detail?.status || detail?.type || '';
  const rawMessage = typeof detail?.message === 'string' ? detail.message : typeof data?.message === 'string' ? data.message : '';
  // Use the text only for classification. It never enters the returned error.
  const diagnostic = [rawCode,detail?.status,detail?.type,rawMessage].filter(v=>typeof v==='string'||typeof v==='number').join(' ').toLowerCase();
  const status = response.status;
  const raw = response.headers.get('Retry-After');
  const parsed = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.ceil((Date.parse(raw) - Date.now()) / 1000) : NaN;
  const wait = Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 7 * 86400) : null;
  let code = 'PROVIDER_REQUEST_FAILED', hint;
  if(status === 429) {
    code = rawCode === 'relay_rate_limit' ? 'RELAY_RATE_LIMITED' : 'PROVIDER_RATE_LIMITED';
    hint = `${code === 'RELAY_RATE_LIMITED' ? "Podlingua's relay safety limit was reached. Requests are now paced; resume after the cooldown." : 'The provider rejected the request: rate limit or API quota. Check the account allowance and request/token limits.'} ${wait !== null ? `Wait at least ${wait} seconds before trying again. ` : ''}Choose on-device translation if the allowance is exhausted.`;
  } else if(status === 402 || status === 456 || /quota_exceeded|insufficient_quota|billing_hard_limit/.test(diagnostic)) {
    code = 'PROVIDER_QUOTA_EXHAUSTED'; hint = 'The API allowance is exhausted. Check the provider dashboard or choose on-device translation; the app will not purchase credits.';
  } else if(/failed_precondition|free tier.*(not available|country)|billing.*(required|enable)/.test(diagnostic)) {
    code = 'PROVIDER_REGION_OR_BILLING'; hint = 'This API/free tier is not available for the project or region, or requires billing that is not enabled. The app will not enable billing. Use an already authorized account or on-device translation.';
  } else if([401,403].includes(status) || /api.?key.*(invalid|not valid|expired)|invalid.*api.?key|unauthenticated/.test(diagnostic)) {
    code = 'PROVIDER_AUTH'; hint = 'Check your API key, API entitlement, region and permissions. A chatbot subscription does not necessarily include API access.';
  } else if(status === 404 || /model_not_found|model.*(decommission|retir|not (found|exist|available)|does not exist)|unknown model/.test(diagnostic)) {
    code = 'PROVIDER_MODEL_UNAVAILABLE'; hint = 'The endpoint or model is not available to this account. Load the provider model catalog, explicitly select an available text/chat model, and check the endpoint in Advanced settings.';
  } else if(/context|token.*(limit|exceed)|max_tokens|max_completion_tokens|maxoutputtokens/.test(diagnostic)) {
    code = 'PROVIDER_CONTEXT_LIMIT'; hint = 'The provider rejected the context/output-token budget. Reduce batch characters or output tokens in Translation settings and check the selected model limits.';
  } else if(status === 400 || status === 422) {
    code = 'PROVIDER_INVALID_REQUEST'; hint = 'The provider rejected the model, language or request options. Load the account model catalog and verify the selected model supports text generation; check output-token and language settings.';
  } else {
    hint = 'The service or endpoint is unavailable. Check provider status and configuration; completed translation batches can be resumed.';
  }
  const error = new Error(`${provider} request failed (HTTP ${status}). ${hint} No automatic retry, provider switch or purchase.`);
  Object.assign(error, {code, status, retryAfterSeconds: wait});
  return error;
}
