# Service Worker Demo — build notes

## Why

Owen has used web workers before (see `as/models/worker.html` +
`runWorker.js` — a one-shot background computation, no DOM/network
involvement) but not service workers, and wanted a hands-on way to grok the
difference. A small standalone demo app seemed better than an explanation,
since the whole point of a service worker only really lands once you watch
a page keep working with the network turned off.

## What got built

Three files, no build step, no framework:

- `index.html` — the page. Registers the service worker, shows two status
  badges (network online/offline, and whether the SW is currently
  controlling the page), a running fetch log (cache vs. network vs.
  offline-miss, color-coded), and buttons to reload / re-fetch the logo /
  force an update check.
- `sw.js` — the actual service worker:
  - `install` — precaches `index.html` and `logo.svg` into a versioned
    Cache Storage bucket, then `skipWaiting()` so a new version takes over
    immediately instead of waiting for every open tab to close.
  - `activate` — deletes any cache from a previous `VERSION`, then
    `clients.claim()` so already-open tabs come under control right away.
  - `fetch` — cache-first for same-origin GET requests: serve from Cache
    Storage if present, otherwise hit the network and stash a copy for next
    time. Posts a message back to the page for every intercepted request so
    the UI can log where it came from.
- `logo.svg` — a tiny real asset to fetch/cache, so there's something
  visible to intercept besides the HTML document itself.

## Design choices / gotchas called out in the UI

- The first page load is **not** controlled by the service worker — the SW
  only takes over starting with the *next* navigation. The instructions in
  the page call this out explicitly rather than leaving it as a "why didn't
  it work" surprise.
- `skipWaiting()` + `clients.claim()` are used deliberately so the classic
  "I edited the SW but have to reload twice" behavior doesn't happen here —
  but the update lifecycle (`installing → installed → activating →
  activated`) is still fully logged to the page, and the instructions
  suggest bumping `VERSION` in `sw.js` as the way to trigger and observe it.
- Service workers require a secure context — `https://` or `http://
  localhost`, not `file://`. Locally, Owen's VSCode "Go Live" server
  (port 5501) works fine for this since it's on localhost — no need for a
  separate `python3 -m http.server`. Confirmed it serves `sw.js` with the
  correct `application/javascript` content-type. Or upload via
  `uploadApps.js` and test on `agentscript.acequia.io`, which is already
  https.

## Verification

Before Owen mentioned Go Live, Claude checked `sw.js` with `node --check`
(syntax only) and spun up a throwaway `python3 -m http.server` just to
`curl` all three files and confirm correct status codes and MIME types
(`sw.js` as `text/javascript`/`application/javascript` matters — browsers
reject a service worker script served with the wrong content-type). That
was a one-off sanity check, not a recommendation — Go Live on port 5501
is the actual local test setup (see above) and needs nothing extra
installed.

Actual registration/offline/update behavior was verified by Owen in the
browser via Go Live, not by an automated tool in this session. Real bug
found that way: the SW was caching non-OK responses (e.g. the browser's
automatic `favicon.ico` request 404ing and getting cached as if valid) —
fixed by only caching `response.ok` results.
