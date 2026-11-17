# Verification record

## Executed locally against the production Vite build

- `npm test`: 34 passing Node tests (document parsing/validation/export, Android JSON compatibility, overlap, Unicode tokenization, IndexedDB audio persistence and credential exclusion, provider request/response contracts, consent and URL validation, native ASR upload/poll seams, word punctuation/speaker fidelity, local-worker factory contracts).
- `npm run build`: successful production build with GitHub Pages `/podlingua/` base and dedicated module worker.
- `npm run test:ui`: 12 passing Chromium Playwright tests. Exercises actual UI/import/audio playback/seek/synchronization/export/reload/library persistence, responsiveness at 390px, RTL, HTML-injection inertness, consent, nonpersistent keys, Google attribution independent of current settings, sequential queues, cancellation and stale result replacement/deletion.
- `npm audit`: zero reported vulnerabilities at verification time. This is not a comprehensive security certification.
- Credential-pattern scan over source/public/scripts/tests: no matches for GitHub/OpenAI-style live token patterns or private-key blocks. Test-only placeholder keys remain in explicitly mocked tests.

## Genuine browser inference (not a mocked provider response)

Ran `scripts/live-browser-smoke.mjs` against `npm run preview` in headless Chromium on Linux. The browser was not cross-origin isolated (matching ordinary GitHub Pages); ONNX Runtime WASM was configured to one thread in the dedicated worker.

Input: public `jfk.wav` from the whisper.cpp repository, 11 seconds, mono 16 kHz. SHA-256 `59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e`. Test input downloaded to scratch only, not redistributed as an app asset.

Local ASR model: `Xenova/whisper-tiny`. Actual recognized text:

> And so my fellow Americans ask not what your country can do for you, ask what you can do for your country.

Local translation model: `Xenova/opus-mt-en-fr`, explicit source `en`, target `fr`. Actual translation:

> Et donc mes concitoyens ne demandent pas ce que votre pays peut faire pour vous, demandez ce que vous pouvez faire pour votre pays.

Both operations completed and rendered saved paired segments; no page JavaScript errors. Initial smoke run took approximately 39 seconds for the combined workflow including model/runtime downloads on this host; this is **not** a phone performance guarantee or a quality benchmark. These examples show actual model output and are not asserted to be perfect translations. External traffic observed in this smoke was model/runtime GET downloads, not audio/text uploads or billable provider calls.

## Explicit verification limits
The independent review's worker-copy, preflight-validation, unknown-language and cross-tab stale-write findings were fixed with regression tests. ASR transfers only an owned 30-second PCM buffer; sample mixing/resampling runs in a cancellable worker; browser duration is checked before whole-file decoding; all translation text/byte limits are checked before the first request; library writes atomically compare durable revision tokens. Browser decoding itself remains whole-file and can consume substantial memory before its post-decode sample-size check.


- Hosted providers: request/response and upload/poll behavior tested with explicitly mocked HTTP transport. **No authenticated live provider call**, billing entitlement, changing model availability, or browser CORS compatibility was verified.
- M2M100 418M, Whisper Base and the other OPUS directions: allowlisted implementation, model-card/license review and factory-contract coverage; **not** real-inference tested in this resource-constrained verification run. Tiny + OPUS en-fr are the actual executed paths.
- No Android device, iOS Safari, low-memory mobile browser, long-duration/background execution, persistent offline shell, or native engine was exercised by this web verification.
- Source/rendered model timings are used; there is no independent forced-alignment accuracy test, invented target-word timing or speaker identity claim.

See README and the deployed Credits page for browser/Android differences, privacy, model licenses and external service terms.
