# Podlingua provider guide

Public documentation rechecked **2026-11-18**. This is a dated research snapshot, not a promise of account eligibility, production capacity, current model availability, or browser connectivity. No paid inference, account creation or real credentialed entitlement checks were made. Anonymous model GET/OPTIONS probes are not authenticated inference verification.

`src/provider-info.js` is display-only metadata. It does not change the engines or enable new adapters. The unique key is **kind + id**, not id alone. `providerInfo` (alias `providerCatalog`) covers the adapters in `src/engines.js`; `localModels` (alias `modelCatalog`) covers the worker allowlist; `providerExtras` contains explicitly **not-integrated** service capabilities. `getProviderInfo(kind, id)` returns the matching integrated record or undefined.

## Free does not mean keyless

MyMemory public translation-memory lookup is the verified keyless hosted translation option here: anonymous use is limited to **5,000 characters/day**, with **500 UTF-8 bytes/query**. A valid `de` email can raise the daily limit to 50,000 characters, but Podlingua's adapter does **not** send `de`; entering an API key is not the same thing. Larger whitelist allowances are conditional and do not apply automatically to personal projects.[1][2]

LibreTranslate is free/open-source software you can self-host. Official **libretranslate.com managed hosting requires an API key and a monthly cost**. A user-operated instance may permit keyless access, but its operator controls language availability, limits, privacy and CORS. There is no official universal free public endpoint promised here.[3]

Local browser models need no service API key. They require initial downloads and runtime assets; offline use depends on those assets remaining cached. Local Ollama is a separate server, not browser inference; its localhost API is unauthenticated by default, while hosted Ollama access is different.[28][29][30]

## Hosted speech recognition

| Adapter ID | Offer supported by retrieved official evidence | Audio speaker separation in current adapter |
| --- | --- | --- |
| `openai` | Metered API; no recurring free ASR allowance verified.[11] | `whisper-1` adapter does not request the separate diarizing model/format.[10] |
| `groq` | Rate-limited free account tier and paid developer tier; audio upload caps 25 MB/free and 100 MB/developer. Account/model quotas vary.[8][9] | No diarization option implemented. |
| `together` | Official docs: no current free trial; minimum $15 credit purchase and positive balance.[20] | Provider supports diarization, but Podlingua does not send `diarize` or consume `speaker_segments`.[21] |
| `deepgram` | $200 introductory credit, then usage billing; diarization is a paid add-on.[12] | Yes. Adapter uses legacy `diarize=true`; docs now prefer `diarize_model` and describe v1 routing for the legacy switch.[13] |
| `assemblyai` | Metered API and diarization add-on; trial amount not established from retrieved pricing evidence.[14] | Yes, `speaker_labels` produces speaker-labeled utterances.[15] |
| `gladia` | One-time €50 starter credits, **no monthly reset**; prepaid wallet and optional auto top-up thereafter.[16] | Yes, `diarization` returns utterance speaker indices, not a person's identity.[17] |
| `speechmatics` | Pricing advertises $100 starter credits followed by metered use; do not assume old recurring free-hour offers.[18] | Yes, batch speaker diarization; channel separation is a different feature.[19] |
| `custom` | Your server determines keys, pricing and entitlement. | Requires timed compatible response; no automatic diarization integration. |

**Diarization is analysis of voices in audio.** Imported or manually edited transcript speaker labels do not prove an ASR service performed diarization. Speaker A/B or numeric labels are not identity verification. Translation does not perform diarization; it preserves the application's existing segment metadata.[15][17][19]

The extra OpenAI candidate uses `gpt-4o-transcribe-diarize` and `diarized_json`, with a chunking strategy for recordings longer than 30 seconds. It is documented but **not implemented by the current adapter**. Likewise, Together's `diarize=true` is a service capability, not an implemented Podlingua toggle.[10][21]

## Hosted text translation

| Adapter ID | Account/key and offer boundary |
| --- | --- |
| `deepl` | API Free and paid plans exist; API account/key required. Direct browser requests are blocked; the integrated restricted Podlingua Worker forwards text and your key only with explicit relay consent.[4][5] |
| `google` | NMT text: first 500,000 characters/month covered by credit up to $10, shared across Basic/Advanced; does not roll over or apply to every product/model. Excess usage is paid.[6] |
| `microsoft` | Azure F0 resource/key: 2 million characters/month shared across standard translation and custom training. Paid S1 is a different tier.[7] |
| `libretranslate` | User instance may be keyless; official managed host is paid/keyed. Instance-dependent limits.[3] |
| `mymemory` | Keyless limited public lookup; explicit source language and 500-byte query cap; see above.[1][2] |
| `openai` | Metered chat API; no recurring free text-translation allowance verified. A consumer chatbot plan is not an API entitlement.[11] |
| `groq` | API key and rate-limited free account tier; exact organization/model limits must be checked.[8] |
| `together` | Paid prepaid access, minimum $15 purchase; no current free trial per official billing docs.[20] |
| `openrouter` | API key required. Free variants/router and paid models are separate; saved `openai/gpt-4o-mini` is not a verified free route. Retrieved quota numbers did not render, so no fixed count is asserted.[22][23] |
| `fireworks` | Pay-per-token serverless API. Introductory credits/recurring free allowance were not verified from the official introduction; any account promotion remains conditional.[24] |
| `mistral` | Official docs advertise Studio Free mode and generating an API key. Exact model eligibility/quotas were not established. Legacy Experiment-tier docs returned 404; old quota claims are not reused.[25] |
| `gemini` | Free eligibility is model/project/region dependent. The deprecated `gemini-2.5-flash` default is cleared once; select a current model explicitly. Free-tier data-use terms differ from paid. Grounding-tool RPD is not a general translation quota.[26] |
| `anthropic` | API key and metered tokens. Pricing FAQ says new users get a small, unquantified amount of test credits; not a recurring free tier.[27] |
| `ollama` / `custom` | Your server, model, hardware and configuration determine cost/privacy. Local Ollama needs no key by default; cloud routes do.[28][29][30] |

Chat-model routes normally translate by instruction and require a valid JSON array response; they are not dedicated translation-quality guarantees. NVIDIA Riva uses its native plain-text translation protocol instead. Model strings and public catalogs are not proof of account entitlement.

## Model selection, 400/404 recovery and rate limits

In **Settings → Advanced → Translation**, enter your session-only API key, click **Load available models**, consent to the catalog GET, then choose a supported chat/text model. No transcript is sent by discovery and no model is automatically chosen. Manual exact IDs remain available when discovery is blocked by CORS. Discovery follows bounded native pagination for Gemini, Together and Fireworks; other compatible catalogs may return a partial list. Listing does not establish price or free entitlement.

- **Groq:** the former `llama-3.3-70b-versatile` default is restricted/retired for ordinary free/developer access. Select a current authorized model; requests now use `max_completion_tokens`. [Deprecations](https://console.groq.com/docs/deprecations).
- **Fireworks:** the former Llama 3.3 serverless default was removed. Discovery uses `/v1/accounts/fireworks/models?filter=supports_serverless%3Dtrue`, not a guessed inference `/models` endpoint. Dedicated-only models are excluded. [Native catalog](https://docs.fireworks.ai/api-reference/list-models).
- **Together:** uses `https://api.together.ai/v1/chat/completions` and `/v2/supported-models?product=PRODUCT_SERVERLESS&modality=MODALITY_TEXT`; choices use the documented inference `name`, not an internal UUID. The former `.xyz` translation preset migrates once; keys are never silently carried to a different endpoint. [Official OpenAPI](https://docs.together.ai/openapi.yaml).
- **Gemini:** discovery keeps only `generateContent` models; requests use native JSON-array structured output and configurable output budget. `2.5 Flash` is deprecated; Google documents automatic alias migration with changed pricing, so reselect explicitly rather than assuming an old alias remains free. [Retirements](https://ai.google.dev/gemini-api/docs/deprecations).
- **All hosted translations/lookups:** requests serialize by endpoint origin, with configurable spacing and shared cooldowns across tabs where Web Locks/storage work. DeepL always waits at least 1,250 ms between requests; Mistral defaults to 2,500 ms. A 429 stops inference without resending; `Retry-After` becomes a cooldown. Pacing cannot replenish an exhausted account allowance or guarantee that a remote job stops on cancellation.
- **Resume:** completed translations stay in tab memory after a later failure. Click **Resume** in the episode sheet or Activity after fixing the key/quota issue; completed batches are not resent. Resume retains the originally approved provider, endpoint, model and languages, uses a corrected key only for that exact scope, and permits same-model budget tuning. For different model/endpoint/languages, start a new translation instead. Reloading discards the checkpoint. Saved source transcripts remain intact until a complete translation commits.
- **400/404 diagnostics:** bounded provider JSON is classified into safe model, authentication, context/budget, region/billing or quota guidance. Raw provider messages are not shown because they can echo keys or text. Output-token and batch-character controls are app budgets, not billing caps. Keys stay in memory and are scoped to the exact provider/endpoint.

### Additional selectable adapters

| Provider | Account boundary and browser status |
| --- | --- |
| NVIDIA NIM | BYO account/key. No universal free production allowance is promised. Anonymous GET/OPTIONS lacked allow-origin, so discovery/translation require an explicitly configured trusted compatible HTTPS backend. `nvidia/riva-translate-4b-instruct-v2` uses the documented language-pair prompt, explicit supported source/target (regional Spanish/Portuguese/Chinese tags), and one segment/request. [Native model card](https://build.nvidia.com/nvidia/riva-translate-4b-instruct-v2). |
| Cerebras | Current trial: $5 after a verified payment method, expires after 30 days. Not an unconditional recurring free tier. Leave auto-recharge off and set provider-side limits. No model selected automatically. [Billing](https://inference-docs.cerebras.ai/console/account-billing.md). |
| SambaNova | Free Tier without a linked payment method, with small model-specific minute/day/token quotas; adding payment changes tier. Anonymous GET/OPTIONS lacked allow-origin, so use your explicitly configured trusted compatible backend. [Limits](https://docs.sambanova.ai/docs/en/models/rate-limits.md). |
| DeepSeek | Paid developer API, not the free consumer chatbot. Only use explicitly authorized existing balance; thinking is disabled for translation. [Models/pricing](https://api-docs.deepseek.com/quick_start/pricing). |
| Hugging Face router | Ordinary free accounts have **no monthly inference credits**; current PRO credit is $2/month across HF compute, other plans vary. Catalog choices pin `model:provider` (for example `CohereLabs/command-a-translate-08-2025:cohere`, **not free**). Automatic provider failover is disabled. [Pricing](https://huggingface.co/docs/inference-providers/pricing), [routing](https://huggingface.co/docs/inference-providers/routing). |

These adapters have request/response fixture tests, not real credentialed inference or translation-quality verification. No shared key, purchase, top-up, automatic inference retry or app-selected provider/model fallback is supplied. OpenRouter explicitly sends `allow_fallbacks:false`; provider-operated model aliases can still change upstream. NVIDIA/SambaNova are backend-required options, not working direct-browser promises. The dedicated DeepL Worker is deliberately **not** a general proxy for them; no personal infrastructure is connected.

## Downloadable models already allowed by Podlingua

| Exact model ID | Use and source/licensing boundary |
| --- | --- |
| `Xenova/whisper-tiny` | Multilingual ASR, no speaker diarization in this worker. OpenAI weights MIT; conversion card Apache-2.0.[31][33] |
| `Xenova/whisper-base` | Multilingual ASR, no speaker diarization in this worker. OpenAI weights MIT; conversion card Apache-2.0.[31][34] |
| `Xenova/m2m100_418M` | 100 languages, 9,900 directions; explicit source/target. Upstream model card MIT.[32][35] |
| `Xenova/opus-mt-en-fr` | English → French only; upstream card Apache-2.0.[36][40] |
| `Xenova/opus-mt-fr-en` | French → English only; upstream card Apache-2.0.[37][41] |
| `Xenova/opus-mt-en-de` | English → German only; upstream card **CC-BY-4.0**, not Apache-2.0.[38][42] |
| `Xenova/opus-mt-de-en` | German → English only; upstream card Apache-2.0.[39][43] |

These are conversion/upstream model cards, not hosted free-inference promises. Worker settings select WASM/q8. Exact artifact download sizes and peak working memory were not measured; do not turn rounded old model-size estimates into RAM guarantees. Preserve upstream attribution/licensing and consult exact conversion artifacts before redistribution.

## Settings integration contract

- `settings` lists existing engine configuration keys relevant to each row. It is metadata for UI rendering, not a permission grant or an implementation of controls.
- `allowDownload`: explicit initial local asset-download consent. It does not promise cached assets are complete or permanent.
- `allowCloud`: explicit transfer consent, including transfers to localhost servers. Keep it off until a user chooses a route knowingly.
- `key`, `endpoint`, `model`, `source`, `target`, `region`: provider-specific configuration; never populate secrets from research or share saved credentials in public source code.
- `diarization`: expose only where `diarization === true` (Deepgram, AssemblyAI, Gladia, Speechmatics). `serviceDiarization === true` alone is **not** enough.
- `maxUploadMB`, `timeoutSeconds`: app budgets, not an exemption from provider caps and not a provider billing stop. Canceled local requests do not necessarily cancel a remote queued job.
- `browserCors`: `unknown` means untested, **not supported**. DeepL is documented blocked for direct browser calls; its official Free/Pro endpoints use the dedicated Podlingua Cloudflare relay only with explicit text/key-transfer permission (`allowTranslationRelay`). The relay has no shared key and stores no text/keys. A custom trusted compatible backend remains configurable. Ollama requires origin configuration. Never disable browser security or silently use a third-party proxy.
- Treat every hosted upload as disclosure to that operator. Review retention, training, region, optional top-up and dashboard spending controls. No service in this catalog was exercised with a secret.

## Research limitations

Public documentation does not establish user-specific entitlement or billing safety. Initial general extraction was unavailable; official pages were read using an alternate extractor. Some pages embed large navigation scripts; exact numbers that did not render were deliberately omitted. DeepL's retrieved limits page included file limits but did not establish a current monthly free-text total clearly, so none is asserted here. Mistral's legacy tier URL and one old Gladia feature URL failed; current official documentation was used instead. Model metadata licenses were checked against the official model-host API; no weights were downloaded or benchmarked.

## Sources

[1] https://mymemory.translated.net/doc/usagelimits.php
[2] https://mymemory.translated.net/doc/spec.php
[3] https://docs.libretranslate.com
[4] https://developers.deepl.com/docs/resources/usage-limits
[5] https://developers.deepl.com/docs/best-practices/cors-requests
[6] https://cloud.google.com/translate/pricing
[7] https://azure.microsoft.com/en-us/pricing/details/cognitive-services/translator
[8] https://console.groq.com/docs/rate-limits
[9] https://console.groq.com/docs/speech-to-text
[10] https://developers.openai.com/api/docs/guides/speech-to-text
[11] https://platform.openai.com/docs/pricing
[12] https://deepgram.com/pricing
[13] https://developers.deepgram.com/docs/diarization
[14] https://www.assemblyai.com/pricing
[15] https://www.assemblyai.com/docs/pre-recorded-audio/speaker-diarization
[16] https://www.gladia.io/pricing
[17] https://docs.gladia.io/chapters/audio-intelligence/speaker-diarization
[18] https://www.speechmatics.com/pricing
[19] https://docs.speechmatics.com/speech-to-text/features/diarization
[20] https://docs.together.ai/docs/billing
[21] https://docs.together.ai/docs/inference/transcription/features
[22] https://openrouter.ai/docs/faq
[23] https://openrouter.ai/docs/api-reference/limits
[24] https://docs.fireworks.ai/getting-started/introduction
[25] https://docs.mistral.ai
[26] https://ai.google.dev/gemini-api/docs/pricing
[27] https://docs.anthropic.com/en/docs/about-claude/pricing
[28] https://docs.ollama.com/api/openai-compatibility
[29] https://docs.ollama.com/api/authentication
[30] https://docs.ollama.com/faq
[31] https://github.com/openai/whisper
[32] https://huggingface.co/facebook/m2m100_418M
[33] https://huggingface.co/Xenova/whisper-tiny
[34] https://huggingface.co/Xenova/whisper-base
[35] https://huggingface.co/Xenova/m2m100_418M
[36] https://huggingface.co/Xenova/opus-mt-en-fr
[37] https://huggingface.co/Xenova/opus-mt-fr-en
[38] https://huggingface.co/Xenova/opus-mt-en-de
[39] https://huggingface.co/Xenova/opus-mt-de-en
[40] https://huggingface.co/Helsinki-NLP/opus-mt-en-fr
[41] https://huggingface.co/Helsinki-NLP/opus-mt-fr-en
[42] https://huggingface.co/Helsinki-NLP/opus-mt-en-de
[43] https://huggingface.co/Helsinki-NLP/opus-mt-de-en
