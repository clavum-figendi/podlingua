// Factual, display-only metadata. Never use an offer label to authorize a request.
// Rechecked public documentation, not account entitlement or live API availability.
export const PROVIDERS_VERIFIED_AT = '2026-11-17';
const source = (title, url) => ({title, url});
const docs = {
  whisper: source('OpenAI Whisper: code, weights and license', 'https://github.com/openai/whisper'),
  m2m: source('Meta M2M100 418M model card', 'https://huggingface.co/facebook/m2m100_418M'),
  openai: source('OpenAI API pricing', 'https://platform.openai.com/docs/pricing'),
  openaiASR: source('OpenAI file transcription and speaker diarization', 'https://developers.openai.com/api/docs/guides/speech-to-text'),
  groq: source('Groq rate limits and account limits', 'https://console.groq.com/docs/rate-limits'),
  groqASR: source('Groq speech to text: supported models and free-tier file limits', 'https://console.groq.com/docs/speech-to-text'),
  together: source('Together credits and access requirements', 'https://docs.together.ai/docs/billing'),
  togetherASR: source('Together advanced transcription options', 'https://docs.together.ai/docs/inference/transcription/features'),
  deepgram: source('Deepgram pricing and introductory credit', 'https://deepgram.com/pricing'),
  deepgramASR: source('Deepgram diarization and versioning', 'https://developers.deepgram.com/docs/diarization'),
  assemblyai: source('AssemblyAI pricing and add-ons', 'https://www.assemblyai.com/pricing'),
  assemblyaiASR: source('AssemblyAI speaker diarization', 'https://www.assemblyai.com/docs/pre-recorded-audio/speaker-diarization'),
  gladia: source('Gladia pricing and credit wallet', 'https://www.gladia.io/pricing'),
  gladiaASR: source('Gladia pre-recorded speaker diarization', 'https://docs.gladia.io/chapters/audio-intelligence/speaker-diarization'),
  speechmatics: source('Speechmatics pricing and starter credits', 'https://www.speechmatics.com/pricing'),
  speechmaticsASR: source('Speechmatics diarization modes', 'https://docs.speechmatics.com/speech-to-text/features/diarization'),
  deepl: source('DeepL usage and limits', 'https://developers.deepl.com/docs/resources/usage-limits'),
  deeplCORS: source('DeepL rejects direct browser calls', 'https://developers.deepl.com/docs/best-practices/cors-requests'),
  google: source('Google Cloud Translation pricing: NMT monthly credit', 'https://cloud.google.com/translate/pricing'),
  microsoft: source('Azure Translator F0 and paid pricing tiers', 'https://azure.microsoft.com/en-us/pricing/details/cognitive-services/translator/'),
  libretranslate: source('LibreTranslate self-hosted versus managed hosting', 'https://docs.libretranslate.com/'),
  mymemory: source('MyMemory usage limits', 'https://mymemory.translated.net/doc/usagelimits.php'),
  mymemoryAPI: source('MyMemory API specification', 'https://mymemory.translated.net/doc/spec.php'),
  openrouter: source('OpenRouter FAQ: free models versus paid models', 'https://openrouter.ai/docs/faq'),
  openrouterLimits: source('OpenRouter credit and rate limits', 'https://openrouter.ai/docs/api-reference/limits'),
  fireworks: source('Fireworks serverless API introduction', 'https://docs.fireworks.ai/getting-started/introduction'),
  mistral: source('Mistral Studio: Free mode and API keys', 'https://docs.mistral.ai/'),
  ollama: source('Ollama OpenAI compatibility', 'https://docs.ollama.com/api/openai-compatibility'),
  ollamaAuth: source('Ollama local versus cloud authentication', 'https://docs.ollama.com/api/authentication'),
  ollamaCORS: source('Ollama local-only mode and allowed origins', 'https://docs.ollama.com/faq'),
  gemini: source('Gemini API pricing by exact model and tier', 'https://ai.google.dev/gemini-api/docs/pricing'),
  anthropic: source('Claude API pricing and introductory test credits', 'https://docs.anthropic.com/en/docs/about-claude/pricing'),
};
const card = id => source(`${id} ONNX model card`, `https://huggingface.co/${id}`);
const cloudPrivacy = 'Sends audio (ASR) or transcript text (translation) to your chosen service. Review its retention, training and regional terms before consent; free does not mean private.';
const unknownCors = 'unknown';
const cloudLimits = 'Account entitlement, region, model availability and current quotas must be checked in your dashboard. Browser access and this adapter have not been live-tested with credentials.';
const make = (kind, id, name, offerType, offer, sources, extra = {}) => ({
  kind, id, name, integration: 'integrated', verifiedAt: PROVIDERS_VERIFIED_AT,
  hosting: 'hosted-api', auth: 'api-key-required', keyRequired: true,
  offerType, offer, sources, browserCors: unknownCors,
  privacy: cloudPrivacy, limitations: cloudLimits,
  speakerSupport: kind === 'translation' ? 'not-applicable' : 'none-in-adapter',
  diarization: false, serviceDiarization: false,
  settings: kind === 'translation' ? ['allowCloud','key','endpoint','source','target','timeoutSeconds'] : ['allowCloud','key','endpoint','model','source','maxUploadMB','timeoutSeconds'],
  ...extra,
});
const localExtra = {
  hosting: 'browser-offline', auth: 'no-key', keyRequired: false, browserCors: 'not-applicable',
  privacy: 'Browser inference: audio/text stays on device. Initial model/runtime downloads contact the model host. Offline use requires all assets already cached; browser storage may be evicted.',
  limitations: 'Initial download consent and sufficient memory/storage required. Download bytes are not working RAM. Offline availability is not guaranteed until every needed asset is cached.',
  settings: ['allowDownload','model','source','target'],
};
const togetherOffer = 'Paid prepaid API: official docs say no current free trial; minimum $15 credit purchase and positive balance required. Old signup-credit claims do not establish access.';
const groqOffer = 'Documented rate-limited free tier with account/API key; developer tier is paid. Exact model/organization quotas are dashboard-dependent, not unlimited or keyless.';

/** Unique key is `${kind}:${id}`: IDs such as local/openai occur in both kinds. */
export const providerInfo = [
  make('asr','local','Local Whisper','local-free','No hosted inference charge or API key. Download Whisper Tiny or Base once; run locally thereafter when cached.',[docs.whisper,card('Xenova/whisper-tiny'),card('Xenova/whisper-base')],{...localExtra,speakerSupport:'none',limitations:localExtra.limitations+' Tiny/Base do not perform speaker diarization in Podlingua.'}),
  make('asr','openai','OpenAI','paid','Metered API; do not confuse ChatGPT consumer access with API credits. No recurring free ASR allowance verified.',[docs.openai,docs.openaiASR],{serviceDiarization:true,limitations:cloudLimits+' The current adapter requests whisper-1 verbose_json; it does not request diarized_json or gpt-4o-transcribe-diarize. A diarization setting cannot add that capability.'}),
  make('asr','groq','Groq','free-tier',groqOffer,[docs.groq,docs.groqASR],{limitations:cloudLimits+' Official free-tier audio file cap is 25 MB; developer tier 100 MB. Current Podlingua sends 30-second WAV chunks. No diarization option implemented.'}),
  make('asr','together','Together AI','paid',togetherOffer,[docs.together,docs.togetherASR],{serviceDiarization:true,limitations:cloudLimits+' Service documents diarize=true and speaker_segments for openai/whisper-large-v3, but the current Podlingua chunked adapter does not send that option or parse speaker_segments.'}),
  make('asr','custom','Custom Whisper-compatible','instance-dependent','No universal free allowance. Billing, keys and capabilities belong to your selected server.',[docs.openaiASR],{hosting:'user-endpoint',auth:'instance-dependent',keyRequired:null,limitations:'Requires a compatible audio/transcriptions endpoint with timed verbose_json segments; OpenAI-like URL naming alone does not prove compatibility. Key may be omitted only if your server permits it.'}),
  make('asr','deepgram','Deepgram','trial-credit','Official page advertises $200 initial credit, then pay-as-you-go; not a monthly free tier. Speaker diarization is a separately priced add-on.',[docs.deepgram,docs.deepgramASR],{diarization:true,serviceDiarization:true,speakerSupport:'audio-diarization',settings:['allowCloud','key','endpoint','model','source','diarization','maxUploadMB','timeoutSeconds'],limitations:cloudLimits+' Adapter uses diarize=true, which current docs deprecate in favor of diarize_model and route to the v1 diarizer. Labels are not verified human identities.'}),
  make('asr','assemblyai','AssemblyAI','paid-account-dependent','Metered transcription and separately priced diarization. Trial availability/amount not verified from the retrieved pricing evidence; check your account rather than assuming recurring free hours.',[docs.assemblyai,docs.assemblyaiASR],{diarization:true,serviceDiarization:true,speakerSupport:'audio-diarization',settings:['allowCloud','key','endpoint','model','source','diarization','maxUploadMB','timeoutSeconds'],limitations:cloudLimits+' speaker_labels enables audio diarization and utterances. Generic Speaker A/B labels do not identify a person.'}),
  make('asr','gladia','Gladia','trial-credit','Official Starter plan advertises a one-time €50 credit grant, with no monthly reset. Prepaid wallet thereafter; optional auto top-up is an account setting.',[docs.gladia,docs.gladiaASR],{diarization:true,serviceDiarization:true,speakerSupport:'audio-diarization',settings:['allowCloud','key','endpoint','source','diarization','maxUploadMB','timeoutSeconds'],limitations:cloudLimits+' Enable diarization for speaker-indexed utterances; indices distinguish voices, not real-world identities.'}),
  make('asr','speechmatics','Speechmatics batch','trial-credit','Official pricing advertises $100 starter credits, followed by metered use. Do not assume an old recurring free-hours offer remains active.',[docs.speechmatics,docs.speechmaticsASR],{diarization:true,serviceDiarization:true,speakerSupport:'audio-diarization',settings:['allowCloud','key','endpoint','model','source','diarization','maxUploadMB','timeoutSeconds'],limitations:cloudLimits+' Adapter enables speaker diarization for batch jobs; channel diarization is a different service mode, not this toggle.'}),
  make('translation','local','Local M2M100 / OPUS','local-free','No hosted inference charge or API key. Download M2M100 or a supported directional OPUS model; translate locally when cached.',[docs.m2m,card('Xenova/m2m100_418M'),...['en-fr','fr-en','en-de','de-en'].map(pair=>card('Xenova/opus-mt-'+pair))],{...localExtra,limitations:localExtra.limitations+' Explicit source/target required. Each OPUS model supports only its named direction; M2M100 is multilingual.'}),
  make('translation','deepl','DeepL','free-tier','Free and paid API plans are documented; use your own API account/key and consult its current usage limit. No consumer-app entitlement implied.',[docs.deepl,docs.deeplCORS],{browserCors:'blocked-by-provider',limitations:'Official DeepL docs explicitly reject direct browser calls (403/CORS). This adapter is present but requires a trusted compatible backend/proxy; changing a setting cannot bypass CORS. Do not put a provider secret into a public proxy URL.'}),
  make('translation','google','Google Cloud Translation','free-tier','NMT text translation: first 500,000 characters/month covered by a non-rollover credit up to $10, shared across Basic/Advanced. Excess usage is paid; not a universal credit for all translation models.',[docs.google]),
  make('translation','microsoft','Microsoft Translator','free-tier','Azure F0 lists 2 million characters/month shared across standard translation and custom translation training. Requires an Azure resource/key on the F0 tier; paid S1 is a different entitlement.',[docs.microsoft],{settings:['allowCloud','key','region','endpoint','source','target','timeoutSeconds']}),
  make('translation','libretranslate','LibreTranslate','instance-dependent','Self-host the open-source software at your own compute cost; your instance may allow keyless requests. Official libretranslate.com managed hosting requires a purchased API key. No official universal free public endpoint is promised.',[docs.libretranslate],{hosting:'user-instance-or-hosted',auth:'instance-dependent',keyRequired:null,limitations:'Enter an instance you operate or have permission to use. Keys, rate limits, available language models, CORS and privacy depend on that operator. Optional key support is not proof the default managed endpoint is free.'}),
  make('translation','mymemory','MyMemory','keyless-free','Official anonymous allowance: 5,000 characters/day; 500 UTF-8 bytes maximum per query. Valid email via de can raise allowance to 50,000/day, but this adapter does not send de. No API key needed for public get searches.',[docs.mymemory,docs.mymemoryAPI],{auth:'optional-key',keyRequired:false,limitations:'Explicit source language required. Public translation-memory matches and optional machine translation are not a private/offline service. Optional key accesses private memories; it is not the email/de parameter. Larger partner/whitelist allowances are conditional and not a Podlingua entitlement.'}),
  make('translation','openai','OpenAI','paid','Metered chat API used to translate text by instruction; no recurring free translation quota verified. Consumer ChatGPT subscriptions do not establish API allowance.',[docs.openai]),
  make('translation','groq','Groq','free-tier',groqOffer,[docs.groq]),
  make('translation','together','Together AI','paid',togetherOffer,[docs.together]),
  make('translation','openrouter','OpenRouter','model-dependent','API key required. Free models/router have low, account-dependent limits; the saved openai/gpt-4o-mini default is not evidence of a free route. Select an explicitly free model separately and recheck availability.',[docs.openrouter,docs.openrouterLimits],{limitations:cloudLimits+' Free models may be unsuitable for production. Exact numeric free-model limits did not render in retrieved docs, so no quota is asserted.'}),
  make('translation','fireworks','Fireworks','paid-account-dependent','Serverless pay-per-token API. No recurring free allowance or signup-credit amount verified from the retrieved official introduction; any account promotion is conditional.',[docs.fireworks]),
  make('translation','mistral','Mistral','account-dependent','Official Studio quickstart advertises Free mode and generating an API key. Exact model eligibility, limits and production entitlement were not established; verify your workspace before use.',[docs.mistral],{limitations:cloudLimits+' Legacy Experiment-tier URL returned 404 during research. Do not reuse old quota claims or equate Studio free mode with unlimited API access.'}),
  make('translation','ollama','Ollama local server','local-free','Local API requires no authentication and has no hosted per-request charge for local models. You supply server hardware and downloaded models. Ollama cloud is a separate authenticated route.',[docs.ollama,docs.ollamaAuth,docs.ollamaCORS],{hosting:'local-server',auth:'no-key-local',keyRequired:false,browserCors:'configure-origin',privacy:'Text leaves the browser for your configured Ollama server. It stays local only if that server and selected model are local; disable cloud features if needed.',limitations:'Requires separately installed/running Ollama and a pulled model. Not in-browser inference. Configure OLLAMA_ORIGINS for the app origin; localhost HTTP may be blocked by browser mixed-content or local-network policies.'}),
  make('translation','custom','Custom OpenAI-compatible','instance-dependent','Your selected server determines prices, keys, quotas and model access. OpenAI compatibility does not mean a free or private service.',[docs.ollama,docs.openai],{hosting:'user-endpoint',auth:'instance-dependent',keyRequired:null,limitations:'Must implement chat/completions and return a JSON array of translations in message content. No automatic protocol conversion for arbitrary chatbot APIs.'}),
  make('translation','gemini','Gemini API','free-tier','The official gemini-2.5-flash price row lists free-tier input/output and a separate paid tier. Account/region/rate limits apply; no fixed requests/day inferred from grounding-tool quotas.',[docs.gemini],{limitations:cloudLimits+' Pricing distinguishes data use: free-tier inputs may be used to improve products, paid tier is marked No. This is instruction-based text translation, not the Live Translate audio product.'}),
  make('translation','anthropic','Anthropic Claude','trial-credit','Official API pricing FAQ says new users receive a small amount of test credits; amount is not specified. Thereafter metered tokens; not a recurring free plan or a Claude consumer-subscription benefit.',[docs.anthropic],{limitations:cloudLimits+' Native Messages API, not OpenAI-compatible chat. Adapter opts into dangerous direct browser access; avoid shared keys or exposing credentials in deployed code.'}),
];
export function getProviderInfo(kind, id) {
  return providerInfo.find(provider => provider.kind === kind && provider.id === id);
}

/** Service capability candidates only: deliberately NOT selectable provider IDs. */
export const providerExtras = [
  {id:'openai-diarize',providerId:'openai',kind:'asr',name:'OpenAI diarized file transcription',model:'gpt-4o-transcribe-diarize',integration:'not-integrated',verifiedAt:PROVIDERS_VERIFIED_AT,offerType:'paid',auth:'api-key-required',hosting:'hosted-api',speakerSupport:'audio-diarization',browserCors:'unknown',limitations:'Needs diarized_json request/response support and chunking_strategy for recordings over 30 seconds; current Whisper adapter does not implement this route.',sources:[docs.openaiASR,docs.openai]},
  {id:'together-diarize',providerId:'together',kind:'asr',name:'Together speaker diarization option',model:'openai/whisper-large-v3',integration:'not-integrated',verifiedAt:PROVIDERS_VERIFIED_AT,offerType:'paid',auth:'api-key-required',hosting:'hosted-api',speakerSupport:'audio-diarization',browserCors:'unknown',limitations:'Requires diarize=true and parsing speaker_segments; not enabled by the existing chunked adapter.',sources:[docs.togetherASR,docs.together]},
];

/** Only models accepted by inference-worker.js; size is deliberately not invented. */
export const localModels = [
  {id:'Xenova/whisper-tiny',kind:'asr',name:'Whisper Tiny',languages:'Multilingual speech transcription',license:'OpenAI weights MIT; ONNX conversion card Apache-2.0',sources:[card('Xenova/whisper-tiny'),docs.whisper]},
  {id:'Xenova/whisper-base',kind:'asr',name:'Whisper Base',languages:'Multilingual speech transcription',license:'OpenAI weights MIT; ONNX conversion card Apache-2.0',sources:[card('Xenova/whisper-base'),docs.whisper]},
  {id:'Xenova/m2m100_418M',kind:'translation',name:'M2M100 418M',languages:'100 languages / 9,900 translation directions; explicit source and target',license:'Consult upstream and conversion card; do not infer license from runtime',sources:[card('Xenova/m2m100_418M'),docs.m2m]},
  ...[['en-fr','English → French'],['fr-en','French → English'],['en-de','English → German'],['de-en','German → English']].map(([pair,languages])=>({id:`Xenova/opus-mt-${pair}`,kind:'translation',name:`OPUS ${languages}`,languages,source:pair.split('-')[0],target:pair.split('-')[1],license:'Consult exact upstream/conversion model card; pair-specific terms may differ',sources:[card(`Xenova/opus-mt-${pair}`)]})),
].map(model=>({...model,
  upstreamLicense: model.id.includes('whisper') || model.id.includes('m2m100') ? 'MIT' : model.id.endsWith('en-de') ? 'CC-BY-4.0' : 'Apache-2.0',
  license: model.id.includes('whisper') ? 'Upstream MIT; ONNX conversion card Apache-2.0' : model.id.includes('m2m100') ? 'Upstream model card MIT; check conversion artifacts too' : `Upstream model card ${model.id.endsWith('en-de') ? 'CC-BY-4.0' : 'Apache-2.0'}; check conversion artifacts too`,
  sources: model.id.includes('opus-mt-') ? [...model.sources,source('Upstream directional OPUS model card', `https://huggingface.co/Helsinki-NLP/${model.id.split('/')[1]}`)] : model.sources,
  providerId:'local',hosting:'browser-offline',integration:'integrated',verifiedAt:PROVIDERS_VERIFIED_AT,downloadRequired:true,downloadSize:'Not measured: selected q8 artifacts, runtime and cache state determine transfer size.',memory:'Not benchmarked on this device; available RAM is not equal to model file size.',speakerSupport:model.kind==='asr'?'none':'not-applicable'}));
export const providerCatalog = providerInfo;
export const modelCatalog = localModels;
