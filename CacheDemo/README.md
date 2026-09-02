# CacheDemo

A small caching layer (`AppCache`) with TTL, in-flight request dedup, tag-based
invalidation, and stale-while-revalidate — backed by either a plain in-memory
`Map` or the browser's native `CacheStorage`/`Cache` API, used directly from
the page (no service worker involved). See [ServiceWorkerDemo](../ServiceWorkerDemo/)
for the other half of that native API: the same `Cache` used *inside* a
service worker to intercept fetches for offline support.

Open `index.html` in a browser. No build step, no server required.

## Walkthrough

The page has two sections. The first (**greeting** / **time**) is always
backed by an in-memory `Map` and rebuilds fresh on every load, so steps 1-5
below work in whatever order you click them, on a first visit or the
hundredth — nothing here depends on anything you did in an earlier session.
The second section is a fixed, always-running side-by-side comparison of
that same `Map` backend against the real `CacheStorage`/`Cache` API — see
step 6.

Watch the log panel at the bottom throughout — each cache operation prints a
color-coded line.

**1. First fetch is always a miss.** Click **Get** under `greeting`. The log
shows `miss greeting`, the button is unresponsive for ~800ms (the simulated
network delay), then the value appears.

**2. A second `Get` within the TTL window is a hit.** Click **Get** again
immediately — the log shows `hit greeting` and the value returns instantly,
no delay. The default TTL is 4000ms; wait past that and `Get` goes back to
`miss` (a fresh fetch, with a new random value — that's how you can tell a
real re-fetch happened rather than a stale cached one).

**3. Concurrent requests get deduped, not repeated.** Click **Get ×3 rapid**
on `time` — this fires three `get()` calls back-to-back before any of them
can resolve. The log shows exactly one `miss` followed by two `dedup` lines:
all three calls share the single in-flight fetch instead of triggering three
network calls.

**4. Stale-while-revalidate serves old data instantly, then refreshes.**
Check the **stale-while-revalidate** box (it takes effect on your next
`Get`, no rebuild needed), then `Get` an entry, wait past the TTL, and `Get`
it again. The log shows `stale` (the old value is returned immediately, no
800ms wait) followed shortly by `revalidated` (the background refetch
completed and the cache is now current). Compare this to unchecking the
box, where an expired entry goes back to a plain `miss` and you wait for
the fetch before seeing anything.

**5. Tag invalidation clears related entries together.** Fetch both
`greeting` and `time` (so both are cached), then click **Invalidate tag
"demo"** — the log shows an `invalidate` line for each key, since both share
that tag. The next `Get` on either is a fresh `miss`.

**6. Backend choice changes what survives a reload — no setup required.**
The **Persistence across reload** section runs itself: on every page load,
it populates one box from a `Map`-backed `AppCache` and one from a
`CacheStorage`-backed `AppCache`, no button click needed. Just hit
**Reload page** (or reload the tab yourself) and look again. The Memory box
always shows a new value — a plain `Map` only lives as long as the page
does. The CacheStorage box always shows the *same* value it had before —
it's genuinely persisted by the browser. This is the actually interesting
half of the pair: CacheStorage surviving a reload is what you'd expect from
"a cache"; Memory losing everything on reload is the surprising part, and
the one worth watching happen. Click **Regenerate both** if you want proof
neither value is hardcoded.

This section is intentionally independent from steps 1-5 above — it's its
own pair of `AppCache` instances, each permanently wired to one backend
(no shared selector to leave in the wrong position), with a TTL fixed in
code (a year, effectively "don't expire during this demo") rather than
exposed as a setting to fuss with. Persistence and freshness are separate
concerns: a `CacheAPIBackend` entry survives a reload regardless of TTL,
but `AppCache` only serves it as a `hit` if it's still within its TTL
window when asked — an expired-but-persisted entry looks identical to a
never-cached one (`miss`) unless stale-while-revalidate is on, in which
case it's logged as `stale` (plus a background `revalidated`) instead of
silently vanishing. Steps 1-5's short default TTL (4000ms) is what makes
that distinction demonstrable there; the persistence section sidesteps it
entirely by using a TTL long enough to never realistically expire.

## Why it's built this way

`AppCache` (deliberately not named `Cache` — that name is a real browser
global, `CacheAPIBackend` included below shows it in use) only knows about a
`get`/`set`/`delete`/`keys` backend interface, so the same TTL/dedup/tag/SWR
logic runs unmodified against either storage. `CacheAPIBackend` smuggles the
metadata the native `Cache` API doesn't have a field for — TTL, tags, stored
time — into a JSON-serialized envelope stored as a `Response` body, keyed by
a synthetic `Request` built from the cache key.

One gotcha that cost a debugging round: `JSON.stringify` has no
representation for `Infinity` and silently converts it to `null`. A `ttl:
Infinity` envelope written through `CacheAPIBackend` reads back with
`ttl: null`, and `elapsed < null` coerces to `elapsed < 0` — always false,
so the entry can never be "fresh" again. The persistence section uses a
large finite TTL (a year, in milliseconds) instead, which survives the
JSON round-trip.

See [prompt.md](prompt.md) for the conversation this was built from.
