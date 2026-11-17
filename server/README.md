# Restricted audio relay

## Current deployment: Cloudflare Workers

Source: `cloudflare-relay.mjs`. Endpoint: `https://podlingua-audio.clavum-figendi.workers.dev/fetch`. This runs in the dedicated Podlingua account, not the user's personal Cloudflare account or Paloma. The platform explicitly identified the account as **Workers Free** during deployment; no paid upgrade was made. The frontend remains on GitHub Pages.

Upload this ES module as `worker.mjs` with the adjacent `cloudflare-metadata.json`, using the Cloudflare Workers multipart API. Enable only its workers.dev production URL, not previews. The metadata binds a Cloudflare rate limiter (six audio requests per IP per 60 seconds; distributed/best-effort, not a precise global counter). Free-plan request/CPU limits remain enforced by Cloudflare. This Worker does not use the former server's filesystem quota ledger, two-connection limit, or 1 GiB daily reservation budget.

The Worker allows only the two Podigee HTTPS media hosts, revalidates redirects, forwards no credentials, requires an audio Content-Type and declared size no greater than 100 MiB, and checks streamed byte counts. It accepts an 8 KiB JSON POST, with a 240-second upstream-transfer deadline. Unknown-length responses are rejected. Normal platform fetch routing is used; no private-network bindings, user-supplied addresses, proxy settings or host overrides exist. Origin checks are not authentication. Cookies/API keys are never forwarded.

Audio is streamed, not stored or sent to AI. Sampled Cloudflare request logs/traces are enabled with query-string redaction; no application code logs recording bodies. Cloudflare carries the media and processes infrastructure metadata. Model-download and inference permissions remain separate. The public site requires neither a user Cloudflare login nor a VPN/local-network permission.

Verification: Node contract tests, live Cloudflare retrieval of the actual GAG581 recording, deployed-source hash comparison, and browser integration. Use `node scripts/relay-live-smoke.mjs` for the real publisher flow (downloads a full public recording; do not run in tight loops).

## Retired Node deployment — historical reference only

The Paloma relay was stopped and disabled, and its Funnel path removed. The app has no Paloma endpoint. The remaining sections document the **retired** `audio-relay.mjs`, not the active Cloudflare implementation or authorization to redeploy on personal infrastructure.

The web app remains on GitHub Pages. A separate optional, explicitly authorized relay retrieves public recordings from `audio.podigee-cdn.net` and `adswizz.podigee-cdn.net` when those servers do not permit browser CORS. It is not an arbitrary proxy, an inference endpoint, or an access-control bypass. No provider keys or user cookies are accepted or forwarded.

## Run

Requires Node.js with the standard-library APIs exercised by the test suite (deployment uses Node 26). Set `PODLINGUA_RELAY_STATE` to an absolute JSON ledger path outside this repository, then run `node server/audio-relay.mjs`. It binds **127.0.0.1:8791 only**. Put an HTTPS reverse proxy in front of just this service. The deployed endpoint uses an additional `/podlingua-audio` path on an existing Tailscale Funnel; the root handler and private dashboard are unchanged.

Endpoints: `GET /health`, `POST /fetch` with JSON `{ "url": "https://…" }`, and OPTIONS preflight. Prefixed `/podlingua-audio/health` and `/podlingua-audio/fetch` are also accepted. The request Origin must exactly match `https://clavum-figendi.github.io`. Origin is browser hygiene, **not authentication**: anonymous clients can spoof it, so downstream policy and quotas are mandatory.

## Bounds and privacy

- Exact two-host allowlist, HTTPS port 443, media filenames only; at most five redirects, revalidated at every hop.
- DNS resolves to public IPv4 addresses and is pinned for each connection; private, loopback, link-local, reserved and tailnet IP ranges are denied.
- 8 KiB request limit, 100 MiB maximum recording, two concurrent requests, 240-second total deadline, 60 hourly admissions, 1 GiB shared daily reservation budget.
- Reservations persist across restart and are not refunded on cancellation/failure. Unknown-size recordings reserve the full per-file limit. This can exhaust the allowance earlier than actual transferred bytes.
- Audio is streamed with backpressure and is not written to server disk. The ledger stores only aggregate allowance/timestamps, never recording URLs or audio. The app sends the URL in a POST body, not an ingress query string. The server and Tailscale still carry the request/recording; do not describe this optional route as wholly on-device.
- No automatic relay fallback or retries. Clicking **Use relay and get audio** authorizes one operation, not future transfers. Transcription/model-download consent is separate.
- No pay-as-you-go cloud deployment or paid inference API was added. The relay uses the existing host and HTTPS ingress; its bandwidth and availability remain bounded.

## Operations

On a device connected to this tailnet, MagicDNS resolves the relay hostname to a tailnet address. Chromium can require the site's **local-network access** permission; denying it blocks the request before the server sees it. Do not disable browser security. An Internet client uses the public Funnel addresses and needs no local-network permission. The live smoke can use `RELAY_PUBLIC_IP` with a current public DNS answer to exercise that public route from a tailnet test host, without disabling TLS or CORS. Both the public route and the permission-granted tailnet route were checked.

Deployment service: `systemctl --user status podlingua-audio-relay.service`. State: `/home/hermes/.local/state/podlingua-audio-relay/budget.json`. Only expose port 8791 via the dedicated Funnel path; do not expose the dashboard or arbitrary localhost destinations.

Graceful shutdown removes the lifetime `.lock`. After an abrupt crash, startup deliberately fails closed rather than risking concurrent quota writers. Before removing a stale `.lock` or `.tmp`, stop the service and verify **no relay process remains**, preserve the ledger and `.initialized` marker, inspect the state, then restart. Never delete/reset the budget to hide failed transfers. Missing/corrupt state and backwards system-clock changes fail closed.

Rollback: remove only the `/podlingua-audio` Funnel handler and stop/disable `podlingua-audio-relay.service`; preserve the existing `/` handler and the quota ledger. The frontend's manual-save and user-configured-proxy alternatives remain available.

`tests/audio-relay.test.js` exercises policy, redirect/DNS pinning, streaming, cancellation, timeout and durable quotas without real external traffic. Live validation separately retrieved the user's actual Podigee episode through the relay (66,782,323 bytes on that request; dynamic advertising can change size), and ffprobe identified 3302.5306 seconds of audio.
