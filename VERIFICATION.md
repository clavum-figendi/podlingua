# Verification record

## Provider model discovery, rate-limit recovery and additional adapters (2026-11-18)

- Reproduced safe classification of 400/404 model/auth/context errors, partial-translation failure and explicit resume with transport fixtures. Fixed a settings override that discarded the selected model. Old restricted/retired defaults migrate once; later explicit selections persist. Together moves to its documented `.ai` translation endpoint, and credentials remain scoped to the exact provider/endpoint.
- Added consented model discovery with native Gemini/Together/Fireworks pagination and response schemas, safe IDs, no redirects/cookies/referrers, bounded JSON, and manual exact IDs. Catalog GETs send no transcript and never choose a model automatically. API documentation and anonymous GET/OPTIONS observations are not authenticated entitlement or inference verification.
- Hosted translation and word lookup share origin-level serialization/pacing/cooldowns; DeepL has a 1,250 ms minimum spacing. A 429 never triggers an automatic resend. Manual Resume retains completed batches and original destination/model/languages, while accepting a corrected session key only for that exact scope and same-model budget tuning. Reload discards tab-memory checkpoints. Changed source transcript identities are rejected.
- Added NVIDIA NIM, Cerebras, SambaNova, DeepSeek and Hugging Face adapters. NVIDIA Riva uses native language-pair/plain-text, one-segment translation; HF uses explicitly pinned provider routes; OpenRouter disables provider failover. No shared key, top-up, purchase or new public proxy. Updated offer evidence: Cerebras trial requires a payment method, DeepSeek is paid, ordinary HF free accounts have no monthly credits. Provider-side spending caps remain the account holder's responsibility.
- Repeated anonymous model GET/chat OPTIONS probes from the actual Pages Origin: NVIDIA and SambaNova each returned HTTP 200 **without** allow-origin. Their preset routes are labeled/backend-gated before key/text transmission in the UI and translation engine; trusted compatible HTTPS backend configuration is required. The restricted DeepL Worker is not generalized or deployed anew.
- A browser regression exposed stale dirty password-input values after endpoint changes despite cleared backing credentials. Fixed form-control reconciliation without replacing the focused input; the full browser suite verifies the new endpoint visibly has no old key.
- Independent review identified stale resume credentials/budgets and inaccessible cancelled checkpoints. Both paths are fixed: browser regressions verify a replacement scoped key and reduced output-token budget reach the resumed request, and explicit Resume after cancellation sends only missing segments.
- `npm test`: **146 passing** Node tests. `npm run test:ui`: **14 passing** production-build Chromium journeys, including explicit account-model selection reaching the outgoing request, backend gating/key scoping, visible episode Resume, corrected-key/budget resume, cancellation resume and no repeated completed batches. Production build and Pages staging succeeded. Provider inference traffic is mocked. `npm audit`: zero registry findings, with the existing local-vendor audit limitation below. No real credentialed inference, billing change or paid request was made.

## DeepL browser transport, quota errors and speaker defaults (2026-11-18)

- Official DeepL documentation and the reported console trace establish that direct browser requests are rejected. Added a restricted BYO-key Cloudflare translation Worker, explicit text/key-transfer permission in episode/batch/lookup paths, and guarded Free/Pro routing. No personal infrastructure or shared provider key is used.
- Reproduced Mistral 429 handling with a transport fixture; errors now identify quota/rate-limit failure and expose Retry-After where available, without retrying, switching providers or altering the saved transcript. This cannot increase a provider account's quota.
- Speaker labels default on only for integrated capable ASR adapters. Legacy settings adopt the requested new default once; subsequent explicit off choices persist. Unsupported adapters never claim diarization. Real speaker-identification quality and paid account interoperability were not tested.
- Independent review found unbounded cancellation cleanup and a serialized-byte batching mismatch. Both were reproduced by failing regressions and corrected. Tests cover malicious destinations, origin/preflight policy, no cookies/redirects, bounded bodies, malformed responses, limiter failure, quota errors, stalled stream cancellation and escaped-byte batch splitting.
- `npm test`: 127 passing Node tests. `npm run test:ui`: 10 passing production-build Chromium journeys, including DeepL consent/lookup/batch, visible Mistral errors with transcript retention, and supported-provider speaker defaults/opt-out. Provider traffic in these suites is mocked. Production build and Pages staging succeeded; `npm audit` reports zero registry findings (the prior local-vendor audit limitation still applies).
- No real credentialed translation request or billable ASR call was made. Account entitlement, remaining API allowance and vendor billing caps must still be checked by the user. Real local model inference was not rerun in this change.
- Live deployment verified in dedicated account `45f1679a19a096da595dc830ac3e53a5`: `podlingua-translation`, production workers.dev URL enabled and previews disabled. Downloaded deployed ES-module SHA-256 exactly matches source: `6327a30b1221e18036c8837f7fd0bc31071c5c3cfebba854a0b745fd24841035`. Read-back settings confirm the mandatory 60/min limiter, no logpush, disabled invocation logs and query redaction. No account upgrade or billing change was made; OAuth does not grant access to the billing-subscriptions endpoint.
- `node scripts/translation-relay-live-smoke.mjs` ran Chromium from the actual Pages origin against the real Worker: health 200, no-key request 401, intentionally invalid dummy key received a readable sanitized DeepL 403 rather than a browser CORS failure. This proves browser preflight/relay/upstream rejection transport, **not** successful translation with a real account. Separate live probes returned OPTIONS 204 and foreign-Origin 403. GitHub Pages served the new `index-CyWxaXZk.js` build and its deployment workflow completed successfully.

## Build dependency security mitigation (2026-11-18)

- GHSA-fc5q-39xc-vjpf affects picomatch 4.0.7 and every published earlier version. No fixed npm release was available. npm's suggested Vite 6.2.7 downgrade introduces other known Vite vulnerabilities and was rejected.
- Retained Vite 8.3.8; all picomatch consumers use a local MIT-licensed 4.0.7 distribution with a conservative repeated-wildcard-extglob guard. See `vendor/picomatch/SECURITY-PATCH.md` for exact provenance, intentional matching trade-offs and upstream replacement steps.
- The attack regression timed out against unmodified picomatch, then passed with the guard. Application unit tests, production build and all seven mocked-network Chromium journeys passed with the patched dependency.
- `npm ci` and `npm audit` report zero registry vulnerabilities. npm audit does not inspect the local dependency; the attack regression and consumer-resolution checks separately verify the local mitigation. This is not a general security certification.
- Regenerated dependency notices/inventories and the `docs/` Pages build. Real on-device inference was not rerun for this build-tool-only change.

## Interface rebuild (2026-11-18)

The UI layer was rewritten (tabs, sheets, read-along player, Settings with Advanced). Domain modules and their unit tests are unchanged apart from removing the DOM half of `episode-sharing.js` and the old `offline.js` UI.

- `npm test`: 110 passing Node tests (unchanged domain coverage).
- `npm run build`: successful production build with the `/podlingua/` base.
- `npm run test:ui`: 7 passing Chromium Playwright journeys against the production build with every directory, feed, artwork, media file and translation endpoint mocked (`tests/fixtures.js`): first run and language persistence; Discover → follow → publisher transcript → online (mocked LibreTranslate) translation → read-along with word lookup and seek; follow by feed link; queue and bulk selection; local audio import → mini player → transcript import → side-by-side layout; Settings theme, Advanced engine options and backup download; 390 px bottom tabs and bottom sheets. The previous 64 UI tests targeted removed markup and were retired with it.
- Screens were reviewed at 1440×900 and 390×844 in light and dark themes.
- **Not re-run in this rebuild:** real on-device Whisper/OPUS inference and the offline-reload path. The sandbox could not reach Hugging Face. `scripts/local-inference-smoke.mjs` replaces the two earlier smoke scripts for the new UI and should be run before deploying. The records below describe the previous interface.

## Executed locally against the production Vite build

- `npm test`: 110 passing Node tests (document parsing/validation/export, Android JSON compatibility, overlap, Unicode tokenization, IndexedDB audio persistence and credential exclusion, provider request/response contracts, consent and URL validation, native ASR upload/poll seams, word punctuation/speaker fidelity, local-worker factory contracts).
- `npm run build`: successful production build with GitHub Pages `/podlingua/` base and dedicated module worker.
- `npm run test:ui`: 64 passing Chromium Playwright tests: 8 explicitly isolated study-guide component fixtures alongside the production-interface and existing component regression checks. Exercises actual UI/import/audio playback/seek/synchronization/export/reload/library persistence, responsiveness at 390px, RTL, HTML-injection inertness, consent, nonpersistent keys, Google attribution independent of current settings, sequential queues, cancellation and stale result replacement/deletion.
- `npm audit`: zero reported vulnerabilities at verification time. This is not a comprehensive security certification.
- Credential-pattern scan over source/public/scripts/tests: no matches for GitHub/OpenAI-style live token patterns or private-key blocks. Test-only placeholder keys remain in explicitly mocked tests.

## Integrated standalone podcast workflows

The restricted-relay update adds 15 server security/transport/quota tests, a client permission/transport test and an integrated browser recovery test. The relay requires explicit per-operation permission, attaches the fetched audio using a revision-checked metadata merge and returns to the study guide without granting inference consent. A live request retrieved the user's actual Podigee MP3 successfully; ffprobe recognized a 3302.5306-second recording. This is distinct from the transport fixtures and does not assert that an entire hour-long recording was transcribed during verification.

The guided-actions update verifies blocked-download save/attach recovery without duplicate episodes, direct-click installation separate from caching, captured-episode guards, explicit permission and visible progress/errors, publisher transcript access from episode-list actions, configured translation transport, sharing preview and saved-file export. Hosted API responses in regression tests are explicitly mocked. The offline inference smoke now uses the actual beginner Create transcript/Translate guide after disconnected reload; real Whisper Tiny and OPUS en-fr inference passed without page errors.

The icon/mobile/connections update adds original local SVG/accessibility/disclosure tests, 44px mobile-target checks, manual sync preview/apply with session-only credentials, explicit private-feed Authorization, actual migration/archive integration, safe publisher links and actual ID3 bytes through the UI chapter action. Sync services are protocol-tested with fixtures, not authenticated live accounts. No paid provider call was made.

The listening-instrument update adds real production-build tests for persistent transport continuity, mobile menu/Escape/focus, 390px layout, retained credits/consent, fyyd and HTML feed discovery, measured silence and gain playback, queue lock enforcement through existing controls, and real selected-file import/statistics reset. Test ports are isolated and strict to avoid accidentally testing another local application's server.

The preceding standalone release passed 27 Chromium tests, including real local media playback/resume/bookmark seek/sleep timer, publisher transcript and chapter loading, audio-inclusive ZIP export, routed discovery/RSS subscription and refresh, OPML, persistent catalog/queue state, settings, explicit HTML inertness, 390px layout and original reader regressions. Node coverage now also includes feed/OPML/chapter parsers, subscription merge/deduplication, metadata persistence, bounded media and audio-inclusive backup roundtrips. Routed responses are fixture contracts, not claims of live vendor availability.

Clock-driven browser tests verify automatic publisher downloads require both global/per-show opt-in, respect a zero limit, and do not exceed the retained-download cap across successive foreground intervals.

Offline test: enable the complete hashed shell cache online, force browser networking offline, reload, open and actually play a saved WAV. Delete a required cache entry and readiness becomes false. An integration failure caused by response `Vary: Origin` was fixed by ignoring Vary only for exact same-origin immutable/static asset cache matches. App caches are namespaced by application scope. Browser eviction and first-run offline remain outside the promise.

Real predeployment network probes from the Pages origin returned readable iTunes search and BBC/Simplecast feeds; `feeds.twit.tv/sn.xml` was CORS-blocked. This is intentionally reported as a browser restriction, not silently relayed through a public proxy.

## Genuine browser inference (not a mocked provider response)

`scripts/offline-inference-smoke.mjs` additionally exercised the model-library UI against the production build: downloaded Whisper Tiny and OPUS en-fr, verified both in fresh cache-only workers, installed the app shell, set the browser offline, reloaded and ran actual ASR/translation successfully with no page errors. This verifies those two models, not all seven. Offline-only worker fetch policy rejects model-host access and missing optional local-model probes; shell/runtime assets still require successful initial caching.

Ran `scripts/live-browser-smoke.mjs` against `npm run preview` in headless Chromium on Linux. The browser was not cross-origin isolated (matching ordinary GitHub Pages); ONNX Runtime WASM was configured to one thread in the dedicated worker.

Input: public `jfk.wav` from the whisper.cpp repository, 11 seconds, mono 16 kHz. SHA-256 `59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e`. Test input downloaded to scratch only, not redistributed as an app asset.

Local ASR model: `Xenova/whisper-tiny`. Actual recognized text:

> And so my fellow Americans ask not what your country can do for you, ask what you can do for your country.

Local translation model: `Xenova/opus-mt-en-fr`, explicit source `en`, target `fr`. Actual translation:

> Et donc mes concitoyens ne demandent pas ce que votre pays peut faire pour vous, demandez ce que vous pouvez faire pour votre pays.

Both operations completed and rendered saved paired segments; no page JavaScript errors. Initial smoke run took approximately 39 seconds for the combined workflow including model/runtime downloads on this host; this is **not** a phone performance guarantee or a quality benchmark. These examples show actual model output and are not asserted to be perfect translations. External traffic observed in this smoke was model/runtime GET downloads, not audio/text uploads or billable provider calls.

## Review fixes before release

The connections review additionally found stale subscribe/migration, archive-preference, sync-playback and account-preview races. Merges now check the source URL, archive loads preserve current preferences, sync timestamp precedence is evaluated inside each CAS attempt, and pending previews are discarded after account/consent edits. Regression tests cover delayed network responses and concurrent playback writes.

The standalone integration review found four additional issues, all fixed before publication: restored backups now disable proxy/automatic-network consent; subscription refresh commits use an origin-wide Web Lock and durable unsubscribe generation to reject stale work, including after resubscription; completion snapshots its episode/duration and refuses to advance after the selection generation changes; ZIP export/import share a 512 MiB audio limit. Regression tests reproduce unsafe backup state and pending-refresh resurrection. A Chromium test holds a real IndexedDB transaction during natural media completion, switches to a different-duration episode, and verifies the old completion position and continued new selection. Full-size 512 MiB roundtrip was not memory-stress-tested; shared budget/boundary logic and small real ZIP roundtrips were exercised.

## Explicit verification limits
The independent review's worker-copy, preflight-validation, unknown-language and cross-tab stale-write findings were fixed with regression tests. ASR transfers only an owned 30-second PCM buffer; sample mixing/resampling runs in a cancellable worker; browser duration is checked before whole-file decoding; all translation text/byte limits are checked before the first request; library writes atomically compare durable revision tokens. Browser decoding itself remains whole-file and can consume substantial memory before its post-decode sample-size check.


- Hosted providers: request/response and upload/poll behavior tested with explicitly mocked HTTP transport. **No authenticated live provider call**, billing entitlement, changing model availability, or browser CORS compatibility was verified.
- M2M100 418M, Whisper Base and the other OPUS directions: allowlisted implementation, model-card/license review and factory-contract coverage; **not** real-inference tested in this resource-constrained verification run. Tiny + OPUS en-fr are the actual executed paths.
- No Android device, iOS Safari, low-memory mobile browser, long-duration/background execution, or native engine was exercised by this web verification. The opt-in offline browser shell **was** tested with disconnected reload and actual saved-audio playback; models are not included in shell readiness.
- Source/rendered model timings are used; there is no independent forced-alignment accuracy test, invented target-word timing or speaker identity claim.

See README and the deployed Credits page for browser/Android differences, privacy, model licenses and external service terms.
