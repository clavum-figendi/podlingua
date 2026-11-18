# Podlingua

An **unofficial, independent browser podcast manager** with the transcription/translation workflow developed in a local experimental AntennaPod fork. Not AntennaPod, not an official AntennaPod release, and not affiliated with or endorsed by any model or API provider.

- App: https://clavum-figendi.github.io/podlingua/
- Corresponding web source: https://github.com/clavum-figendi/podlingua
- [Credits, licenses and attribution](public/CREDITS.html)
- [GPL-3.0 license](LICENSE)
- [Dependency inventory](public/dependency-inventory.json) and [verbatim dependency notices](public/THIRD_PARTY_NOTICES.txt)

## Using it

Three tabs and a player — **Listen**, **Discover**, **Library** — plus **Settings** (a gear). On phones they sit in a bottom tab bar; on larger screens in a left rail.

- **Listen** starts with a one-line demo of read-along and a language pair (what you listen to → what you read in). Afterwards it shows *Continue*, *Up next*, *New* episodes and your shows.
- **Discover** has one search box: type a show or topic to search Apple Podcasts, fyyd or Podcast Index, or paste a feed or website link to follow it directly. Top charts for your country load when you open it; topic chips are tuned to the language you are learning. Tap a result to look inside before following.
- **Library** groups Shows, New, Queue, Saved, Loved, History, Files and All, with filter, sort, hide-played and multi-select (queue, download, mark played, love, archive, transcribe, delete). The ⋯ menu adds files, folders, transcripts, OPML and batch processing.
- **Every episode** opens a sheet with Play / Read along, labelled icon actions, and two status rows: *Transcript* and *Translation*. **Read along** asks only what it needs — spoken language, target language, publisher transcript vs. speech recognition, and *This device* vs. *Online* — then runs download → transcript → translation in the background. The Start button states what will happen (model download or which service receives data); pressing it is the consent.
- **The player** keeps a mini bar while you browse. Opened, it shows the transcript beside the controls: the line being heard is swept with a highlighter (word-accurate when the transcript has word timings), the view follows the audio until you scroll, and tapping any word in either language gives a machine-translation lookup with *Play from here*. Speed, sleep timer, bookmarks, A/B loop, clarity (silence skipping, quiet-speech boost), chapters, next-in-queue, picture-in-picture and export are one tap away.
- **Settings** shows only appearance, languages, where processing runs, skip lengths, offline mode, storage and backup. Everything technical — providers, models, endpoints and session-only keys, the on-device model library, the provider guide, limits, automation, queue policy, proxy, directory keys, gpodder/Nextcloud sync, private feeds, feed-file import and history resets — lives under **Advanced**.

Interface type is Atkinson Hyperlegible Next (UI) and Literata (reading), both OFL-1.1 and bundled; icons are original. Light, dark and system themes, keyboard focus, reduced motion and 390 px phones are supported. Keyboard: Space play/pause, ←/→ skip, / search.

## What it does

### Guided transcript and translation actions

**Current relay status:** assisted download uses an independent Cloudflare Worker in the dedicated Podlingua account. Paloma's relay remains disabled and has no app connection. Cloudflare confirmed Workers Free during deployment; no paid upgrade was made. Users do not need a Cloudflare account or VPN. See `server/README.md` for current bounds and the distinction from the retired Node relay.

Transcription and translation start from **Read along** on any episode, in the player, or in batch from the Library menu. The sheet shows missing prerequisites (audio, a transcript, an explicit spoken language for on-device translation), lets you pick a publisher transcript when the feed advertises one, and lists the steps that will run. Progress, cancellation and retry appear in the episode sheet, the mini player and **Activity**. Errors and cancellation are never reported as success.

If a publisher blocks browser audio access, **Get the audio** offers an explicit recovery: open the publisher recording, save it using the browser/player menu, then attach that saved audio to the existing episode. This preserves its identity, transcript and listening state. Failed URLs are not automatically retried during the page session; retry is explicit. For supported Podigee recordings, **Use relay** now retrieves and attaches the recording automatically, then returns to the transcript guide. This explicit action sends that recording URL/audio through the separate Podlingua relay; it grants no AI-upload or model-download permission. Manual save/attach remains available for other hosts. GitHub Pages still cannot change publisher headers: the relay is a separate restricted server, not a browser workaround. See [relay limits, privacy and operations](server/README.md).

**Install app** (Settings) invokes the browser install prompt from its own click, separately from offline caching. The native install banner is not suppressed. Browser/OS installation support varies.

**Share** previews the exact text/link, optionally includes the current position, uses native sharing where available, and offers copy and saved-audio export. Review private subscription tokens and publisher rights before sharing.

### Discovery, onboarding and processing settings

Discover searches Apple, fyyd or Podcast Index with loading, empty, error, retry and cancel states and stale-result protection. Opening Discover requests the Apple top chart for your country (country code only); tapping a topic chip runs that search. Podcast Index uses your own session-only API credentials and documented request signing, with no shared key or proxy forwarding.

Transcription and translation have independent *This device* / *Online* choices. On-device translation picks the smallest suitable model automatically (an OPUS pair when one matches, otherwise M2M100) unless you choose a model under Advanced. The provider guide distinguishes keyless access, free tiers, one-time credits and paid/account-dependent offers, plus adapter speaker-diarization support. See [the dated provider guide and official sources](public/PROVIDERS.md).

The on-device library offers explicit download, cache-only verification, selection and removal for seven supported Whisper/OPUS/M2M100 models. Download consent is separate from online-transfer consent. “Use downloaded models only” disables model-host access; missing model files fail rather than downloading. A real test downloaded Whisper Tiny and OPUS English→French, enabled the app shell, disconnected the browser, reloaded, and successfully transcribed and translated speech. Larger models remain device-dependent. Models now use the app-specific `podlingua-models-v1` cache; older shared Transformers caches are not silently deleted or treated as verified downloads.

### Library, sync and publisher workflows

Settings › Advanced › Sync offers manual Nextcloud gpoddersync / gpodder API-v2 subscription and listening-action exchange with preview/apply and explicit uploads. Use a CORS-enabled server; no account is supplied and real account interoperability has not been live-verified. Private feed Basic authentication is tab-session-only and scoped to an exact HTTPS path or explicit directory. Credentialed redirects are rejected; authenticated audio must be downloaded before playback. No passwords are stored in settings or backups.

Publisher workflows include explicit feed-address migration retaining local identities, one-page-at-a-time archive loading, funding/social links, MediaRSS/Dublin Core fallback metadata, and ID3v2.3/v2.4 CHAP extraction from downloaded audio. Unsupported/corrupt tags fail explicitly; MP4/Vorbis chapters and embedded artwork extraction are not implemented.

The persistent mini player stays available while browsing; dark mode, keyboard focus and reduced motion are supported. Attribution, consent and service requirements remain in Credits and Settings › Advanced.

Additional tools: queue shuffle/lock/keep-sorted and insertion policies; title-based automatic-download filters and fresh-episode queue rules; local file/folder selection with content deduplication; measured per-show/daily statistics and separate history/statistics resets; fyyd search and website-advertised feed discovery. Downloaded audio can be analyzed locally for measured silence skipping and bounded quiet-audio gain. Gain playback is a temporary mono 16 kHz derivative, not destructive editing or broadcast loudness normalization; original recordings are retained.

Import local podcast/audio files, generate timed transcripts, translate them while retaining segment alignment, and study both languages alongside playback. Import publisher or exported transcripts in JSON, SRT or WebVTT (including the Android fork's millisecond JSON format). Preserve supplied speaker labels, punctuation, overlap, original word timings and translation metadata. Search, follow playback, seek timestamps, adjust reading layout/font size, perform short-token translation lookup, and export JSON/SRT/VTT/text. The local library stores audio and transcripts in this browser's IndexedDB. Multiple files can be processed sequentially while the tab remains open.

Discover podcasts in Apple's public directory/top lists, subscribe to RSS/Atom URLs or import feed files, organize subscriptions by names/tags, browse an inbox, search/sort/filter episodes, bulk-edit favorites/played/archive state, and manage a persistent listening queue. Stream audio/video, download publisher media, resume playback, set speed and per-show intro/outro skips, seek chapters, save bookmarks, use sleep timers and A/B loops, and view real listening history/statistics. OPML exchanges subscriptions; portable ZIP backups optionally include saved audio plus transcripts, state and preferences. Restore deliberately disables proxy access and automatic network requests until freshly authorized. Foreground refresh/download is opt-in, with global and per-show settings and a retained-download count cap. See [the source-backed feature inventory](SOURCE-PARITY.md) for exact differences from AntennaPod.

No audio is sent to GitHub. GitHub Pages serves static app assets only. Local inference downloads models from Hugging Face and the numerical runtime may fetch WebAssembly assets; it then processes your audio/text in your browser. The first model download is not offline and can be substantial. Model caching is browser-managed and may be evicted. “Enable offline app” explicitly downloads and verifies the application shell. After that successful online setup, saved audio and transcripts can be used after an offline reload. Models are separate downloads; offline inference depends on their browser cache and is not guaranteed by shell readiness. First-launch offline operation, permanent storage and OS background execution are not promised. Feeds and remote media require network access unless previously downloaded.

### Engines

- Browser ASR: multilingual Whisper Tiny/Base via Transformers.js / ONNX Runtime. No reliable speaker diarization or fabricated word alignment. Larger models need more memory and time; speed is not guaranteed on low-end phones.
- Browser translation: M2M100 418M multilingual model (~630 MB), or smaller pair-specific OPUS models (~110 MB): enter `Xenova/opus-mt-en-fr`, `Xenova/opus-mt-fr-en`, `Xenova/opus-mt-en-de`, or `Xenova/opus-mt-de-en` in the translation Model field. Requires explicit supported source and target languages, not `auto`; an OPUS model must match the chosen direction. Broad language coverage is not universal coverage. Quantized models still need substantial memory/downloads. The English→German OPUS model is CC-BY-4.0; the other listed OPUS base-model cards declare Apache-2.0, not a blanket single license.
- Hosted recognition adapters: OpenAI, Groq, Together AI, custom Whisper-compatible, Deepgram, AssemblyAI, Gladia v2, Speechmatics Batch.
- Translation adapters: DeepL, Google Cloud Translation, Microsoft Translator, LibreTranslate, MyMemory, OpenAI, Groq, Together AI, OpenRouter, Fireworks chat, Mistral, Ollama/OpenAI-compatible servers, Gemini, Anthropic.

Hosted presets are protocol integrations, **not a guarantee of browser CORS access, account entitlement, an available model, a free allowance, or successful live requests**. A provider may require an HTTPS endpoint you operate with correct CORS and authentication. There is no hosted-inference relay and no embedded/shared API key. The separate opt-in public-audio relay supports only its documented podcast-host allowlist, not API requests. Do not bypass a service's access controls. Presets and model identifiers are editable because provider offerings change. No automatic retries or provider fallbacks occur.

### Consent, credentials, costs and retention

Hosted processing and local model downloads require separate explicit opt-in. Hosted ASR sends audio to your chosen endpoint; translation and word lookup send text. Model downloads disclose your network address to the hosting services. Provider-controlled billing, data retention, language support and regional handling apply. Configure hard spending limits in your provider account; this static application cannot inspect or enforce provider-side included-credit balances or prevent vendor-side paid spillover. Never enable a paid endpoint unless you have set an appropriate account-side cap. No paid API calls were made during development verification.

Keys entered in the app stay in JavaScript memory for the tab session; they are not stored in library records, preferences, source, exports, or GitHub. This is not Android Keystore-grade protection: browser extensions, compromised same-origin scripts or an injected script could read session keys. Use restricted/revocable keys and a trusted browser. The GitHub Pages origin is shared across repositories for this account; do not treat project paths as separate security origins.

Deleting the local library does not delete remote provider jobs or uploaded files, nor does cancellation guarantee a provider stops or refunds accepted work. Explicit retry may repeat billable work. Never upload media without the relevant rights/permission. Machine transcripts/translations can be inaccurate; word lookup is translation, not a lexical dictionary or verified explanation.

## Browser vs Android fork: parity boundary

The discovered project is `/home/hermes/projects/AntennaPod`, version `3.12.1-transcript.3`, based on upstream AntennaPod commit `b2766f04f56a1788e2f82f20591c490a1c6f11d3`. It was left untouched. This repository publishes the web adaptation's complete editable source, not that Android fork's source or APK.

| Android feature | Browser counterpart / limit |
|---|---|
| Native Vosk, optional acoustic speaker clusters | Not bundled; use browser Whisper or hosted diarization. No claimed on-device speaker identification. |
| Native whisper.cpp GGML / Q5 models | Browser ONNX Whisper, not the Android JNI binding or GGML catalogs. |
| Google ML Kit offline translation | Replaced by browser translation models; Google ML Kit and its SDK are not bundled. |
| Paired reader, playback follow, timestamps, lookup | Implemented in browser; translated words have segment timing only. |
| Keystore-encrypted persistent provider keys | Session-memory keys only; intentionally no persistent key storage. |
| WorkManager, Wi-Fi-only / charging constraints | Foreground queue only. Browser/OS may suspend the tab. No guaranteed screen-off work, background notification service or automatic resumable Android jobs. |
| Podcast management and downloaded episodes | Browser RSS/Atom subscriptions/discovery, inbox, queue, favorites, downloads, history, statistics, OPML and ZIP backups; publisher transcript/chapter discovery and loading. Browser CORS, storage quotas and codecs apply. Android database backups are not supported; cross-device subscription/progress exchange uses your compatible sync server. |
| Native codecs and streaming decode | Browser-supported audio formats; browser decoding requires the full compressed file and decoded audio in memory. Local/Whisper-compatible audio has a one-hour / 256 MB decoded-sample limit; native hosted diarization adapters upload the original file within your upload budget. Large files are bounded/rejected, but decoding can still stress browser memory. |

This is a standalone podcast-and-study application, **not a claim of full AntennaPod application parity**. Native Cast/Android Auto/Wear OS/widgets, genuine streaming loudness normalization and some advanced parser policies remain unsupported. Sync and authenticated feeds require compatible CORS/cookie policies and session authorization; they are not server-independent guarantees. Measured local silence skipping and quiet-audio gain, plus advanced queue policies, are implemented. These are listed explicitly, not represented by inert controls; see [SOURCE-PARITY.md](SOURCE-PARITY.md).

## Develop and reproduce

Requires a recent Node.js version compatible with Vite 8 (Node 22.12+ / 24+ recommended).

```sh
npm ci
npm test
npm run build
npx playwright install chromium   # or set PLAYWRIGHT_CHROMIUM_PATH to an installed Chromium
npm run test:ui                    # UI tests with mocked directories, feeds, media and providers
npm run dev
```

Real on-device inference through the UI (needs Hugging Face access and a speech WAV such as Whisper's JFK sample): `npm run build && npm run preview`, then `node scripts/local-inference-smoke.mjs jfk.wav [--offline] [--report out.json]`.

Code map: domain logic (`src/*.js`: feeds, catalog, storage, engines, playback, parity, sync protocol) is UI-free and unit-tested. `src/services/` holds app state (store, prefs, jobs, player, library, offline, sync). `src/views/` renders each screen as escaped HTML patched in place with morphdom; `src/ui/` has the DOM helpers, icons and shared parts; `src/styles/app.css` is the single stylesheet.

The site base is `/podlingua/` for GitHub project Pages. Build output is `dist/`; source and tests remain in this repository. `node scripts/collect-notices.mjs` regenerates installed dependency notices after a dependency change; review additional runtime/model terms too. No environment credentials are required to build.

Deployment uses the committed `docs/` build output with GitHub Pages branch publishing. Each deployed version has a `deploy-*` tag. To roll back, rebuild the source from an earlier tag and publish its `docs/` output in a new commit; do not rewrite published history.

## Attribution summary

AntennaPod and its contributors created the original Android application (GPL-3.0). The local transcript fork supplied the functional reference and document-schema compatibility; its historical coordination record describes AI-assisted work by Hermes Agent, Codex, OpenCode and Command Code. This web implementation was generated/assembled and tested with Hermes Agent (Nous Research) and delegated coding agents; AI assistance does not imply upstream endorsement or assign their contributions to upstream maintainers.

Whisper: OpenAI (original MIT), ONNX conversion/model cards: Xenova (conversion card Apache-2.0). M2M100: Meta/Facebook AI and the authors of *Beyond English-Centric Multilingual Machine Translation* (MIT model; fairseq notice retained); ONNX conversion: Xenova. OPUS-MT: Language Technology Research Group, University of Helsinki / Helsinki-NLP, Jörg Tiedemann and Santhosh Thottingal; ONNX conversions by Xenova. The selected OPUS English→German base card declares CC-BY-4.0 (credit and license/source links retained); the three other supported OPUS pairs declare Apache-2.0. Transformers.js: Hugging Face and contributors (Apache-2.0). ONNX Runtime: Microsoft and contributors (MIT plus third-party notices). Other dependency licenses are retained verbatim. Our own visual layout, CSS and text are newly authored; no AntennaPod logo, upstream screenshots, commercial fonts or podcast recordings are shipped as app assets. Google's official, unmodified attribution badge is included solely for its required display next to Google Translate results; it remains subject to Google's brand-use terms, not the app's GPL.

When Google is selected, Google Translate powers translation through the [Cloud Translation API](https://cloud.google.com/translate). Its official linked badge is displayed next to segment and lookup results, and the action is labelled “Translate with Google.” Required disclaimer: THIS SERVICE MAY CONTAIN TRANSLATIONS POWERED BY GOOGLE. GOOGLE DISCLAIMS ALL WARRANTIES RELATED TO THE TRANSLATIONS, EXPRESS OR IMPLIED, INCLUDING ANY WARRANTIES OF ACCURACY, RELIABILITY, AND ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

The Android fork's README credits https://freepodcasttranscription.com/ as an inspiration for its smaller quantized Whisper-model choice. This is historical inspiration, not a dependency: no code, branding, API/private endpoints or models were copied from that site. Android-only Vosk/JNA/whisper.cpp/miniaudio/ML Kit dependencies are not redistributed in this web application. External provider names are descriptive trademarks, not endorsements. See the in-app Credits page for source/license links, research citations, runtime/model notes and exact retained notices.
