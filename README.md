# Podlingua

An **unofficial, independent browser podcast manager** with the transcription/translation workflow developed in a local experimental AntennaPod fork. Not AntennaPod, not an official AntennaPod release, and not affiliated with or endorsed by any model or API provider.

- App: https://clavum-figendi.github.io/podlingua/
- Corresponding web source: https://github.com/clavum-figendi/podlingua
- [Credits, licenses and attribution](public/CREDITS.html)
- [GPL-3.0 license](LICENSE)
- [Dependency inventory](public/dependency-inventory.json) and [verbatim dependency notices](public/THIRD_PARTY_NOTICES.txt)

## What it does

### Listening instrument edition

An original porcelain/ink/vermilion interface replaces the large introductory layout. The persistent transport stays available while browsing; mobile navigation, keyboard focus, dark mode and reduced motion are supported. Main-screen compatibility disclaimers are removed; attribution, consent and service requirements remain in Credits/settings.

Additional tools: queue shuffle/lock/keep-sorted and insertion policies; title-based automatic-download filters and fresh-episode queue rules; local file/folder selection with content deduplication; measured per-show/daily statistics and separate history/statistics resets; fyyd search and website-advertised feed discovery. Downloaded audio can be analyzed locally for measured silence skipping and bounded quiet-audio gain. Gain playback is a temporary mono 16 kHz derivative, not destructive editing or broadcast loudness normalization; original recordings are retained.

Import local podcast/audio files, generate timed transcripts, translate them while retaining segment alignment, and study both languages alongside playback. Import publisher or exported transcripts in JSON, SRT or WebVTT (including the Android fork's millisecond JSON format). Preserve supplied speaker labels, punctuation, overlap, original word timings and translation metadata. Search, follow playback, seek timestamps, adjust reading layout/font size, perform short-token translation lookup, and export JSON/SRT/VTT/text. The local library stores audio and transcripts in this browser's IndexedDB. Multiple files can be processed sequentially while the tab remains open.

Discover podcasts in Apple's public directory/top lists, subscribe to RSS/Atom URLs or import feed files, organize subscriptions by names/tags, browse an inbox, search/sort/filter episodes, bulk-edit favorites/played/archive state, and manage a persistent listening queue. Stream audio/video, download publisher media, resume playback, set speed and per-show intro/outro skips, seek chapters, save bookmarks, use sleep timers and A/B loops, and view real listening history/statistics. OPML exchanges subscriptions; portable ZIP backups optionally include saved audio plus transcripts, state and preferences. Restore deliberately disables proxy access and automatic network requests until freshly authorized. Foreground refresh/download is opt-in, with global and per-show settings and a retained-download count cap. See [the source-backed feature inventory](SOURCE-PARITY.md) for exact differences from AntennaPod.

No audio is sent to GitHub. GitHub Pages serves static app assets only. Local inference downloads models from Hugging Face and the numerical runtime may fetch WebAssembly assets; it then processes your audio/text in your browser. The first model download is not offline and can be substantial. Model caching is browser-managed and may be evicted. “Enable offline app” explicitly downloads and verifies the application shell. After that successful online setup, saved audio and transcripts can be used after an offline reload. Models are separate downloads; offline inference depends on their browser cache and is not guaranteed by shell readiness. First-launch offline operation, permanent storage and OS background execution are not promised. Feeds and remote media require network access unless previously downloaded.

### Engines

- Browser ASR: multilingual Whisper Tiny/Base via Transformers.js / ONNX Runtime. No reliable speaker diarization or fabricated word alignment. Larger models need more memory and time; speed is not guaranteed on low-end phones.
- Browser translation: M2M100 418M multilingual model (~630 MB), or smaller pair-specific OPUS models (~110 MB): enter `Xenova/opus-mt-en-fr`, `Xenova/opus-mt-fr-en`, `Xenova/opus-mt-en-de`, or `Xenova/opus-mt-de-en` in the translation Model field. Requires explicit supported source and target languages, not `auto`; an OPUS model must match the chosen direction. Broad language coverage is not universal coverage. Quantized models still need substantial memory/downloads. The English→German OPUS model is CC-BY-4.0; the other listed OPUS base-model cards declare Apache-2.0, not a blanket single license.
- Hosted recognition adapters: OpenAI, Groq, Together AI, custom Whisper-compatible, Deepgram, AssemblyAI, Gladia v2, Speechmatics Batch.
- Translation adapters: DeepL, Google Cloud Translation, Microsoft Translator, LibreTranslate, MyMemory, OpenAI, Groq, Together AI, OpenRouter, Fireworks chat, Mistral, Ollama/OpenAI-compatible servers, Gemini, Anthropic.

Hosted presets are protocol integrations, **not a guarantee of browser CORS access, account entitlement, an available model, a free allowance, or successful live requests**. A provider may require an HTTPS endpoint you operate with correct CORS and authentication. There is no public relay and no embedded/shared API key. Do not bypass a service's access controls. Presets and model identifiers are editable because provider offerings change. No automatic retries or provider fallbacks occur.

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
| Podcast management and downloaded episodes | Browser RSS/Atom subscriptions/discovery, inbox, queue, favorites, downloads, history, statistics, OPML and ZIP backups; publisher transcript/chapter discovery and loading. Browser CORS, storage quotas and codecs apply. Android database backups and cross-device sync are not implemented. |
| Native codecs and streaming decode | Browser-supported audio formats; browser decoding requires the full compressed file and decoded audio in memory. Local/Whisper-compatible audio has a one-hour / 256 MB decoded-sample limit; native hosted diarization adapters upload the original file within your upload budget. Large files are bounded/rejected, but decoding can still stress browser memory. |

This is a standalone podcast-and-study application, **not a claim of full AntennaPod application parity**. Gpodder sync, authenticated private feeds, native Cast/Android Auto/Wear OS/widgets, genuine streaming loudness normalization and some advanced parser policies remain unsupported. Measured local silence skipping and quiet-audio gain, plus advanced queue policies, are implemented. These are listed explicitly, not represented by inert controls; see [SOURCE-PARITY.md](SOURCE-PARITY.md).

## Develop and reproduce

Requires a recent Node.js version compatible with Vite 8 (Node 22.12+ / 24+ recommended).

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:ui
npm run dev
```

The site base is `/podlingua/` for GitHub project Pages. Build output is `dist/`; source and tests remain in this repository. `node scripts/collect-notices.mjs` regenerates installed dependency notices after a dependency change; review additional runtime/model terms too. No environment credentials are required to build.

Deployment uses the committed `docs/` build output with GitHub Pages branch publishing. Each deployed version has a `deploy-*` tag. To roll back, rebuild the source from an earlier tag and publish its `docs/` output in a new commit; do not rewrite published history.

## Attribution summary

AntennaPod and its contributors created the original Android application (GPL-3.0). The local transcript fork supplied the functional reference and document-schema compatibility; its historical coordination record describes AI-assisted work by Hermes Agent, Codex, OpenCode and Command Code. This web implementation was generated/assembled and tested with Hermes Agent (Nous Research) and delegated coding agents; AI assistance does not imply upstream endorsement or assign their contributions to upstream maintainers.

Whisper: OpenAI (original MIT), ONNX conversion/model cards: Xenova (conversion card Apache-2.0). M2M100: Meta/Facebook AI and the authors of *Beyond English-Centric Multilingual Machine Translation* (MIT model; fairseq notice retained); ONNX conversion: Xenova. OPUS-MT: Language Technology Research Group, University of Helsinki / Helsinki-NLP, Jörg Tiedemann and Santhosh Thottingal; ONNX conversions by Xenova. The selected OPUS English→German base card declares CC-BY-4.0 (credit and license/source links retained); the three other supported OPUS pairs declare Apache-2.0. Transformers.js: Hugging Face and contributors (Apache-2.0). ONNX Runtime: Microsoft and contributors (MIT plus third-party notices). Other dependency licenses are retained verbatim. Our own visual layout, CSS and text are newly authored; no AntennaPod logo, upstream screenshots, commercial fonts or podcast recordings are shipped as app assets. Google's official, unmodified attribution badge is included solely for its required display next to Google Translate results; it remains subject to Google's brand-use terms, not the app's GPL.

When Google is selected, Google Translate powers translation through the [Cloud Translation API](https://cloud.google.com/translate). Its official linked badge is displayed next to segment and lookup results, and the action is labelled “Translate with Google.” Required disclaimer: THIS SERVICE MAY CONTAIN TRANSLATIONS POWERED BY GOOGLE. GOOGLE DISCLAIMS ALL WARRANTIES RELATED TO THE TRANSLATIONS, EXPRESS OR IMPLIED, INCLUDING ANY WARRANTIES OF ACCURACY, RELIABILITY, AND ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

The Android fork's README credits https://freepodcasttranscription.com/ as an inspiration for its smaller quantized Whisper-model choice. This is historical inspiration, not a dependency: no code, branding, API/private endpoints or models were copied from that site. Android-only Vosk/JNA/whisper.cpp/miniaudio/ML Kit dependencies are not redistributed in this web application. External provider names are descriptive trademarks, not endorsements. See the in-app Credits page for source/license links, research citations, runtime/model notes and exact retained notices.
