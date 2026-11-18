import {html, on} from '../ui/dom.js';
import {ask} from '../ui/feedback.js';
import {prefs, savePrefs, providerOf, getKey, engineConfig} from '../services/prefs.js';
import {listProviderModels, modelCatalogRequest, supportsModelCatalog, needsTranslationModel} from '../provider-models.js';
import {providerSetupIssue} from '../additional-providers.js';

const states = new Map();
const redraw = () => window.dispatchEvent(new Event('podlingua:render'));
const snapshot = kind => ({provider: prefs[kind].provider, endpoint: prefs[kind].endpoint, key: getKey(kind)});
const same = (a, b) => a?.provider === b.provider && a?.endpoint === b.endpoint && a?.key === b.key;
export function modelReady(kind) { return !needsTranslationModel(prefs[kind].provider) || (!providerSetupIssue(prefs[kind]) && /^[A-Za-z0-9][A-Za-z0-9_./:@+-]{0,255}$/.test(prefs[kind].model || '')); }
export function providerModelControls(kind, {limits = false} = {}) {
  const p = providerOf(kind);
  if(kind !== 'translation' || !needsTranslationModel(p.id)) return '';
  const current = prefs[kind], state = states.get(kind), active = same(state, snapshot(kind)) ? state : null;
  const issue = providerSetupIssue(current);
  return html`<div class="provider-model-controls">
    <label class="field"><span>Model</span><input aria-label="Translation model ID" data-change="provider-model-id" data-kind="${kind}" value="${current.model || ''}" placeholder="Select from your account or enter an exact ID" spellcheck="false"></label>
    ${supportsModelCatalog(p.id) ? html`<button type="button" class="btn small" data-act="provider-models-load" data-kind="${kind}" ${active?.busy || issue ? 'disabled' : ''}>${active?.busy ? 'Loading models…' : 'Load available models'}</button>` : ''}
    ${issue ? html`<p class="hint warn">${issue}</p>` : ''}
    ${active?.models?.length ? html`<label class="field"><span>Account model catalog</span><select aria-label="Available translation models" data-change="provider-model-id" data-kind="${kind}"><option value="">Choose a model explicitly</option>${active.models.map(m => html`<option value="${m.id}" ${current.model === m.id ? 'selected' : ''}>${m.name}</option>`)}</select></label>` : ''}
    ${active?.message ? html`<p class="hint" role="status">${active.message}</p>` : ''}
    <p class="fineprint">Model availability and price depend on your API account. Loading a catalog does not run inference or prove free entitlement. No automatic model switch.</p>
    ${!modelReady(kind) ? html`<p class="hint warn">Choose a model before starting.</p>` : ''}
    ${limits ? html`<div class="inline-fields">
      <label class="field"><span>Output tokens</span><input type="number" min="256" max="16384" step="256" value="${current.maxOutputTokens ?? 2048}" aria-label="Maximum translation output tokens" data-change="provider-limit" data-kind="${kind}" data-key="maxOutputTokens"></label>
      <label class="field"><span>Batch characters</span><input type="number" min="4000" max="32000" step="1000" value="${current.batchCharacters ?? 6000}" aria-label="Maximum translation batch characters" data-change="provider-limit" data-kind="${kind}" data-key="batchCharacters"></label>
      <label class="field"><span>Request spacing (ms)</span><input type="number" min="0" max="60000" step="250" value="${current.requestIntervalMs ?? (p.id === 'mistral' ? 2500 : 1500)}" aria-label="Translation request interval milliseconds" data-change="provider-limit" data-kind="${kind}" data-key="requestIntervalMs"></label>
    </div><p class="fineprint">Requests are serialized per origin and share cooldowns across tabs where supported. DeepL's relay always uses at least 1,250 ms spacing. These controls do not increase vendor quotas or cap vendor-side spending.</p>` : ''}
  </div>`;
}

on('click', {
  async 'provider-models-load'(el) {
    const kind = el.dataset.kind, captured = snapshot(kind);
    const config = {...engineConfig(kind), allowModelList: true};
    const request = modelCatalogRequest(config);
    if(!await ask(`Load models from ${providerOf(kind).name}?`, {detail: `Sends your API key to ${new URL(request.url).origin} to list models. No transcript or inference is sent, and no model is selected automatically. Browser access and account entitlement vary.`, confirm: 'Load models'})) return;
    if(!same(captured, snapshot(kind))) return;
    const state = {...captured, busy: true, message: ''}; states.set(kind, state); redraw();
    try {
      const result = await listProviderModels(config);
      if(!same(captured, snapshot(kind))) return;
      Object.assign(state, {models: result.models, message: result.models.length ? `${result.models.length} listed models${result.complete ? '' : ' (catalog truncated)'}. Select a supported text/chat model; check its price and limits.` : 'No supported model IDs were returned. Enter an exact account-supported model manually.'});
    } catch(error) { if(same(captured, snapshot(kind))) state.message = error.message; }
    finally { state.busy = false; redraw(); }
  },
});
on('change', {
  'provider-model-id': el => { if(el.value || el.tagName === 'INPUT') savePrefs({[el.dataset.kind]: {model: el.value}}); },
  'provider-limit': el => {
    const bounds = {maxOutputTokens: [256,16384], batchCharacters: [4000,32000], requestIntervalMs: [0,60000]};
    const range = bounds[el.dataset.key], value = Number(el.value);
    if(!range || !Number.isInteger(value) || value < range[0] || value > range[1]) throw Error('Use a whole number within the displayed provider limit.');
    savePrefs({[el.dataset.kind]: {[el.dataset.key]: value}});
  },
});
