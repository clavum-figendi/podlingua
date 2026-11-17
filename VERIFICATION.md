# Verification record

## Executed locally against the production Vite build

- `npm test`: 67 passing Node tests (document parsing/validation/export, Android JSON compatibility, overlap, Unicode tokenization, IndexedDB audio persistence and credential exclusion, provider request/response contracts, consent and URL validation, native ASR upload/poll seams, word punctuation/speaker fidelity, local-worker factory contracts).
- `npm run build`: successful production build with GitHub Pages `/podlingua/` base and dedicated module worker.
- `npm run test:ui`: 34 passing Chromium Playwright tests covering the expanded production interface. Exercises actual UI/import/audio playback/seek/synchronization/export/reload/library persistence, responsiveness at 390px, RTL, HTML-injection inertness, consent, nonpersistent keys, Google attribution independent of current settings, sequential queues, cancellation and stale result replacement/deletion.
- `npm audit`: zero reported vulnerabilities at verification time. This is not a comprehensive security certification.
- Credential-pattern scan over source/public/scripts/tests: no matches for GitHub/OpenAI-style live token patterns or private-key blocks. Test-only placeholder keys remain in explicitly mocked tests.

## Integrated standalone podcast workflows

The listening-instrument update adds real production-build tests for persistent transport continuity, mobile menu/Escape/focus, 390px layout, retained credits/consent, fyyd and HTML feed discovery, measured silence and gain playback, queue lock enforcement through existing controls, and real selected-file import/statistics reset. Test ports are isolated and strict to avoid accidentally testing another local application's server.

The preceding standalone release passed 27 Chromium tests, including real local media playback/resume/bookmark seek/sleep timer, publisher transcript and chapter loading, audio-inclusive ZIP export, routed discovery/RSS subscription and refresh, OPML, persistent catalog/queue state, settings, explicit HTML inertness, 390px layout and original reader regressions. Node coverage now also includes feed/OPML/chapter parsers, subscription merge/deduplication, metadata persistence, bounded media and audio-inclusive backup roundtrips. Routed responses are fixture contracts, not claims of live vendor availability.

Clock-driven browser tests verify automatic publisher downloads require both global/per-show opt-in, respect a zero limit, and do not exceed the retained-download cap across successive foreground intervals.

Offline test: enable the complete hashed shell cache online, force browser networking offline, reload, open and actually play a saved WAV. Delete a required cache entry and readiness becomes false. An integration failure caused by response `Vary: Origin` was fixed by ignoring Vary only for exact same-origin immutable/static asset cache matches. App caches are namespaced by application scope. Browser eviction and first-run offline remain outside the promise.

Real predeployment network probes from the Pages origin returned readable iTunes search and BBC/Simplecast feeds; `feeds.twit.tv/sn.xml` was CORS-blocked. This is intentionally reported as a browser restriction, not silently relayed through a public proxy.

## Genuine browser inference (not a mocked provider response)

Ran `scripts/live-browser-smoke.mjs` against `npm run preview` in headless Chromium on Linux. The browser was not cross-origin isolated (matching ordinary GitHub Pages); ONNX Runtime WASM was configured to one thread in the dedicated worker.

Input: public `jfk.wav` from the whisper.cpp repository, 11 seconds, mono 16 kHz. SHA-256 `59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e`. Test input downloaded to scratch only, not redistributed as an app asset.

Local ASR model: `Xenova/whisper-tiny`. Actual recognized text:

> And so my fellow Americans ask not what your country can do for you, ask what you can do for your country.

Local translation model: `Xenova/opus-mt-en-fr`, explicit source `en`, target `fr`. Actual translation:

> Et donc mes concitoyens ne demandent pas ce que votre pays peut faire pour vous, demandez ce que vous pouvez faire pour votre pays.

Both operations completed and rendered saved paired segments; no page JavaScript errors. Initial smoke run took approximately 39 seconds for the combined workflow including model/runtime downloads on this host; this is **not** a phone performance guarantee or a quality benchmark. These examples show actual model output and are not asserted to be perfect translations. External traffic observed in this smoke was model/runtime GET downloads, not audio/text uploads or billable provider calls.

## Review fixes before release

The standalone integration review found four additional issues, all fixed before publication: restored backups now disable proxy/automatic-network consent; subscription refresh commits use an origin-wide Web Lock and durable unsubscribe generation to reject stale work, including after resubscription; completion snapshots its episode/duration and refuses to advance after the selection generation changes; ZIP export/import share a 512 MiB audio limit. Regression tests reproduce unsafe backup state and pending-refresh resurrection. A Chromium test holds a real IndexedDB transaction during natural media completion, switches to a different-duration episode, and verifies the old completion position and continued new selection. Full-size 512 MiB roundtrip was not memory-stress-tested; shared budget/boundary logic and small real ZIP roundtrips were exercised.

## Explicit verification limits
The independent review's worker-copy, preflight-validation, unknown-language and cross-tab stale-write findings were fixed with regression tests. ASR transfers only an owned 30-second PCM buffer; sample mixing/resampling runs in a cancellable worker; browser duration is checked before whole-file decoding; all translation text/byte limits are checked before the first request; library writes atomically compare durable revision tokens. Browser decoding itself remains whole-file and can consume substantial memory before its post-decode sample-size check.


- Hosted providers: request/response and upload/poll behavior tested with explicitly mocked HTTP transport. **No authenticated live provider call**, billing entitlement, changing model availability, or browser CORS compatibility was verified.
- M2M100 418M, Whisper Base and the other OPUS directions: allowlisted implementation, model-card/license review and factory-contract coverage; **not** real-inference tested in this resource-constrained verification run. Tiny + OPUS en-fr are the actual executed paths.
- No Android device, iOS Safari, low-memory mobile browser, long-duration/background execution, or native engine was exercised by this web verification. The opt-in offline browser shell **was** tested with disconnected reload and actual saved-audio playback; models are not included in shell readiness.
- Source/rendered model timings are used; there is no independent forced-alignment accuracy test, invented target-word timing or speaker identity claim.

See README and the deployed Credits page for browser/Android differences, privacy, model licenses and external service terms.
