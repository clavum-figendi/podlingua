// Added from official API documentation (2026-11-18). Availability, CORS and
// included-credit entitlement are separate; no provider key is bundled.
export const additionalTranslationProviders = [
  {id: 'nvidia', name: 'NVIDIA NIM (backend required)', model: '', endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions', description: 'BYO NVIDIA key and trusted compatible HTTPS backend: direct browser CORS probes failed. Riva translation uses its native language-pair prompt.'},
  {id: 'cerebras', name: 'Cerebras (trial / account)', model: '', endpoint: 'https://api.cerebras.ai/v1/chat/completions', description: 'BYO API account. Conditional trial requires a verified payment method; no permanently free tier is promised. Select a model and set account-side spending limits.'},
  {id: 'sambanova', name: 'SambaNova (backend required)', model: '', endpoint: 'https://api.sambanova.ai/v1/chat/completions', description: 'No-card free tier has small daily quotas. Direct browser CORS probes failed; configure your trusted compatible backend. No shared/public proxy is supplied.'},
  {id: 'deepseek', name: 'DeepSeek (paid API balance)', model: '', endpoint: 'https://api.deepseek.com/chat/completions', description: 'Metered API, not the free consumer chatbot. Use only an explicitly authorized existing balance and account-side limits; no credit purchase or top-up is performed.'},
  {id: 'huggingface', name: 'Hugging Face router (account credits)', model: '', endpoint: 'https://router.huggingface.co/v1/chat/completions', description: 'BYO HF inference token and included/authorized credits. Select an explicit model:provider route; automatic provider failover is not allowed. Ordinary free accounts have no monthly inference credits.'},
];
export function providerSetupIssue(config) {
  let host;
  try { host = new URL(config.endpoint || additionalTranslationProviders.find(p => p.id === config.provider)?.endpoint).hostname; } catch { return ''; }
  if((config.provider === 'nvidia' && host === 'integrate.api.nvidia.com') || (config.provider === 'sambanova' && host === 'api.sambanova.ai')) return 'Direct browser CORS probes failed for this provider. Configure a trusted compatible HTTPS backend in Advanced settings before sending your key or text. The DeepL relay does not forward this provider.';
  return '';
}
export const isRivaTranslation = config => config.provider === 'nvidia' && config.model === 'nvidia/riva-translate-4b-instruct-v2';
const rivaLanguages = new Set(['en','cs','da','de','el','es-es','es-us','fi','fr','hu','it','lt','lv','nl','no','pl','pt-pt','pt-br','ro','ru','sk','sv','zh-cn','zh-tw','ja','hi','ko','et','sl','bg','uk','hr','ar','vi','tr','id','th']);
export function rivaMessages(config, texts) {
  const source = String(config.source || '').toLowerCase(), target = String(config.target || '').toLowerCase();
  if(!rivaLanguages.has(source) || !rivaLanguages.has(target)) throw Error('Riva translation requires an explicit supported source/target language pair (not auto). For Spanish, Portuguese and Chinese choose a regional language tag.');
  if(texts.length !== 1) throw Error('Riva translates one transcript segment per request.');
  return [{role: 'system', content: `${source}-${target}`}, {role: 'user', content: texts[0]}];
}
