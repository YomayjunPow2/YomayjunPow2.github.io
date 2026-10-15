# Lyrics and translation APIs: can we rely on them?

Issue: #9. Researched 2026-10-15. Context: static GitHub Pages site, no backend, calls made from the visitor's browser (`laufey-concert.html` lines ~1163, 1191, 1246).

"Probed" means a live request made on 2026-10-15 from one machine (curl, `Origin: https://yomayjunpow2.github.io`). A single probe is a snapshot, not an SLA.

## Summary

| API | Up today | CORS from browser | Documented rate limit | Fit |
|---|---|---|---|---|
| lyrics.ovh | Yes (200, lyrics returned) | `access-control-allow-origin: *`, preflight 204 | None published | Works, but unofficial hobby service; reliability is unknown |
| LRCLIB | Yes, but intermittent 429 | `allow-origin: *`; preflight allows `content-type, x-user-agent, lrclib-client` | None published; Cloudflare 429 with `retry-after: 1` observed | Best candidate for lyrics; add retry and fallback |
| MyMemory | Yes (200) | `allow-origin: *` | 5,000 chars/day anonymous; 50,000 with `de=<email>`; 500 bytes per `q` | Weak for full-song translation; fine for short lines |
| Wikipedia REST summary | Yes (200) | `allow-origin: *`, GET/HEAD | 200 req/min for browser traffic (per Wikimedia) | Reliable; needs CC BY-SA attribution |

No service publishes terms that license displaying song lyrics. Lyrics are copyrighted by the rights holders, and API access does not grant a display licence (see Legal).

## lyrics.ovh

- Endpoint: `GET https://api.lyrics.ovh/v1/{artist}/{title}` returns `{"lyrics": "..."}` or a 404 `{"error": ...}`. Also `GET /suggest/{term}`, which returns Deezer search results. Source: README of https://github.com/NTag/lyrics.ovh.
- Availability: probed `/v1/Laufey/From%20The%20Start` returned 200 with lyrics. The repo is MIT, not archived, and was last pushed 2026-10-13 (GitHub API). Open issue #31 (2026-05-25) reports "No lyrics found" for many popular songs, so coverage and uptime are not guaranteed.
- How it works: the README says it scrapes other lyrics sites ("Lyrics sites often block datacenter IP addresses"). It caches hits and misses in memory for six hours. The service's own availability therefore depends on third-party sites.
- CORS: probed `GET` returned `access-control-allow-origin: *`. A preflight `OPTIONS` returned 204 with `access-control-allow-origin: *`. A plain `fetch` from our origin works.
- Rate limits: none documented in the README or on https://lyrics.ovh. Unverified.
- Terms: no terms of use or privacy policy published. Issue #3 ("Add a privacy policy", 2018) is still open. The MIT licence covers the code, not the lyrics.

## LRCLIB

- Endpoints, from the server source `server/src/router.rs` in https://github.com/tranxuanthang/lrclib: `GET /api/get` (by `artist_name`, `track_name`, optionally `album_name` and `duration`), `GET /api/get/:track_id`, `GET /api/search?q=`, plus `POST /api/request-challenge`, `/api/publish`, `/api/flag` for contributors. Responses include `plainLyrics` and synced lyrics fields. The human docs at https://lrclib.net/docs are a JavaScript app that could not be read by our fetch tool, so the parameter list is from source and probes, not the docs page.
- Availability: probed `/api/search?q=Laufey+From+The+Start` returned 200 with `plainLyrics`. The repo (MIT) was pushed 2026-10-15. The README calls it "a completely free service ... with an easy-to-use and machine-friendly APIs".
- Rate limits: no limit is documented in the README or source. The app source has no rate-limit middleware, only metrics. Probed `/api/get` returned `429 {"name":"RateLimited"}` with `retry-after: 1` and `server: cloudflare` on several rapid calls, and 200 on others. Because the 429 comes from the Cloudflare edge, the threshold is not publicly stated. Whether User-Agent affects it is unverified: a custom UA got 200, a browser UA got 200 once and 429 once, and `curl` got 429 twice. The inconsistent results look like per-IP burst limiting.
- CORS: probed responses carry `access-control-allow-origin: *` and `access-control-expose-headers: retry-after`, so JS can read the retry delay. Preflight allows headers `content-type, x-user-agent, lrclib-client`. Browsers cannot set `User-Agent`. The server source reads `Lrclib-Client` or `X-User-Agent` for identification. Sending them forces a preflight, which works but adds a request. They appear optional.
- Terms: no terms page found in the repo or on the site. Unverified.

## MyMemory

- Endpoint: `GET https://api.mymemory.translated.net/get?q=...&langpair=en|zh-TW`. Spec: https://mymemory.translated.net/doc/spec.php. `q` is UTF-8, "Max 500 bytes". `langpair` takes ISO or RFC3066 codes. `de` is "A valid email where we can reach you in case of troubles".
- Limits, from https://mymemory.translated.net/doc/usagelimits.php: anonymous use is "limited to 5000 chars/day". With a valid `de` email it is 50,000 chars/day. Usage counts characters, not requests. Requests beyond the limit are rejected (the response has `quotaFinished`). Larger volume means paid RapidAPI plans.
- Consequence: the 5,000 chars/day is probably per IP. A full song (about 1,500 to 2,500 characters) uses a large share of the daily quota per visitor, and the 500-byte cap forces splitting into lines or chunks. Whether the quota is per IP or per origin is not stated, so it is unverified.
- CORS: probed 200 with `access-control-allow-origin: *`. The spec page does not mention CORS.
- Availability: probed `q=hello` returned 200 and `zh-TW` text. Machine translation of lyrics can be poor. Responses can include a user-contributed `match`.
- Terms: the Terms of Service page (linked from the spec) returned 404 at the URL we tried, so its content is unverified.

## Wikipedia REST summary API

- Endpoint: `GET https://en.wikipedia.org/api/rest_v1/page/summary/{title}`. Probed `From_the_Start_(Laufey_song)` returned 200 and followed the redirect to the canonical title `From_the_Start`. The `Summary/1.5.0` profile applies. Title resolution through redirects can silently land on a different page, so check `type` and `titles.canonical` before showing the result.
- CORS: probed `access-control-allow-origin: *`, `allow-methods: GET,HEAD`, and allowed headers including `api-user-agent`. This is the supported way to identify a browser client.
- Rate limits, from https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits: unidentified traffic is capped at 10 req/min per IP. Unauthenticated browser requests are capped at 200 req/min. Compliant bots get 200 req/min. The REST endpoint is cached (`s-maxage=1209600`, `max-age=300`). Our usage is far under the limit.
- Terms: the Wikimedia Terms of Use (https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use) license text under CC BY-SA 4.0 (and GFDL). Reuse requires attribution, either a link to the page, a link to a stable copy, or a list of authors, plus a notice if modified. Using the APIs also means following the User-Agent Policy, the Robot Policy, and API:Etiquette. Add a visible "Source: Wikipedia, CC BY-SA 4.0" link next to the backstory text, since a grep of `laufey-concert.html` found no Wikipedia mention outside the fetch call (checked on main only, not in `album.html`).

## Legal: displaying lyrics

- None of the three lyrics/translation services grant a licence to display lyrics. lyrics.ovh is a scraper. LRCLIB is community-contributed. The lyrics belong to songwriters and publishers, and showing full lyrics on a public site is generally an unlicensed reproduction. Commercial lyric sites license through providers such as Musixmatch or LyricFind. This is a general legal observation, not legal advice, and none of the services' own documents address it, so treat it as unverified for our jurisdiction.
- Lower-risk options for the Song story feature: show short excerpts, link out to a licensed lyrics page, fetch lyrics only on a visitor's click and never store or republish them, or keep the Song story to Wikipedia background text plus the user's own commentary.
- The MyMemory translation of lyrics is a derivative work, so it carries the same issue.

## Recommendations for the adapter

1. Wikipedia: keep, add attribution link, send `Api-User-Agent`, check `type !== "disambiguation"`.
2. Lyrics: prefer LRCLIB first (more active, contributor-run), fall back to lyrics.ovh, and treat both as best-effort. Handle 429 by reading `retry-after`, add a cache (sessionStorage) and a visible "lyrics unavailable" state.
3. Translation: translate per line or per chunk under 500 bytes, pass `de=<contact email>` if we accept exposing one in client code (it is public in the page source), and cache results. Expect quota exhaustion and degrade gracefully.
4. Decide the legal stance on displaying lyrics before relying on any of the above.

## Not verified

- lrclib.net/docs page content, any LRCLIB terms of service, and the exact Cloudflare rate threshold.
- lyrics.ovh uptime history, rate limits, and terms.
- MyMemory terms of service (404) and whether the daily quota is keyed by IP.
- Behaviour from real browsers in other regions (all probes came from one network).
