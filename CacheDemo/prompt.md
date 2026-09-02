# Building CacheDemo

Started as an open-ended design question, not a build request: "what would make
an interesting Cache interface (JS in browser)?" Rather than jumping to code,
the conversation stayed exploratory for a while — sketching an API (`get` that
doubles as memoized-fetch, in-flight request coalescing, TTL, tag-based
invalidation, stale-while-revalidate) and talking through *why* you'd want
that layer at all instead of just using `localStorage`.

That comparison naturally worked through the real storage options in the
browser:

- `localStorage`/`sessionStorage` — synchronous, strings only, ~5-10MB,
  no TTL/eviction built in.
- `IndexedDB` — async, structured data, large quota, but still just a
  database: no TTL/dedup/tags out of the box.
- The native `CacheStorage`/`Cache` pair — genuinely confusing on first
  encounter because both are called "Cache." `CacheStorage` (the global
  `caches` object) is a registry of named caches; `Cache` is one of those
  named buckets, storing `Request → Response` pairs. You always go through
  `caches.open(name)` to get a `Cache`. This pair is what `ServiceWorkerDemo`
  (a sibling app in this folder) already uses, inside a service worker, for
  cache-first offline serving.

The a-ha moment worth recording: the native `Cache` API does **not** require
a service worker. `caches.open()` works fine called directly from a page
script — the service worker is only needed if you want to *intercept fetches*
transparently. That fact is what made this demo possible as a plain page
rather than needing SW registration/lifecycle plumbing.

Once "so would a demo use both?" came up, the shape became clear: build the
policy layer (TTL, dedup, tags, stale-while-revalidate) as a class named
`AppCache` — deliberately not `Cache`, since that name is a real global
constructor in browsers and a class called `Cache` would shadow it — with a
pluggable backend interface (`get`/`set`/`delete`/`keys`). Two backends ship:
a plain `Map` (`MemoryBackend`) and a wrapper around the real `CacheStorage`/
`Cache` pair (`CacheAPIBackend`), so the demo directly shows the earlier
`CacheStorage`-vs-`Cache` distinction in working code, not just prose.

One implementation detail worth flagging for future reference: the native
`Cache` API only stores `Request`/`Response` pairs — no room for arbitrary
metadata like a TTL. `CacheAPIBackend` works around this by building a
synthetic same-origin-shaped `Request` from the cache key
(`https://appcache.local/<encoded key>`) and JSON-serializing the whole
`{value, storedAt, ttl, tags}` envelope into the `Response` body, so the
`AppCache` policy logic stays identical regardless of which backend is
plugged in.

The UI mirrors `ServiceWorkerDemo`'s style (dark scrolling log panel, color-
coded event lines) so the two demos read as a matched pair: one shows the
native Cache API doing network interception inside a service worker, this one
shows it (optionally) as a storage backend for a hand-rolled caching policy
on the main thread. Two entries (`greeting`, `time`) both tagged `demo` let
you exercise tag invalidation across multiple keys, and a "Get ×3 rapid"
button fires three concurrent `get()` calls on the same key to make the
in-flight dedup behavior (only one `miss` event, the rest `dedup`) visible in
the log.

A `README.md` was added later, walking through all six behaviors step by
step, with a link to it from the demo's intro paragraph.

## Real bugs, found by actually using it

The initial build looked clean (`node --check` on the extracted module
script, opened directly in a browser) but several real bugs only surfaced
once the app was used and questioned, not just read:

**Double-click landed on dedup, not hit.** Owen reported "clear cache is
required for the second get to get a hit." The `AppCache` logic itself
checked out fine in an isolated Node repro (`miss` then `hit`, no issue).
The actual cause needed a real browser, not a logic simulation: a natural
human double-click (~150ms apart) lands well inside the 800ms simulated
fetch delay, so the second click correctly triggers `dedup` (the in-flight
coalescing feature working as designed) rather than the `hit` a plain
double-click was expected to demonstrate. Fixed by disabling the `Get`
button while its own fetch is in flight, so accidental dedup can't happen
there — dedup keeps its own dedicated "Get ×3 rapid" button. Confirmed with
a real, separately-launched Chrome instance driven via CDP (`playwright-core`
connected with `chromium.connectOverCDP`, since jsdom doesn't reliably
execute inline `<script type="module">`, and AppleScript-driving the user's
actual open tab hit an Accessibility-permissions wall).

**Backend selection relied on incidental browser behavior.** The original
step 6 (switch backend dropdown, click Apply, reload) only "worked" because
some browsers restore `<select>` values across `location.reload()`. Fixed
once by persisting the chosen backend to `localStorage` explicitly — but
this turned out to be a symptom of a design that needed to go away
entirely (see below), not a fix worth keeping.

**Step 6's default TTL couldn't survive a real reload cycle.** Even after
fixing backend-selection persistence, Owen found the "value still cached
after reload" step didn't hold up. Root cause: the demo's default TTL
(4000ms) is tuned for quickly demonstrating expiry in the earlier steps,
and a human clicking through "switch → apply → fetch → look → reload →
click Get" reliably takes longer than 4 seconds — so the entry was still
technically persisted in `CacheStorage`, but expired, and an expired entry
with stale-while-revalidate off reads as a plain `miss` (which silently
overwrote the old value with a fresh fetch — confirmed by watching the
random nonce actually change). First patched by telling users to bump TTL
to 60000ms before this step, which worked but was clunky.

## Redesign: order/state-independent by construction

Owen's read on all of the above: the walkthrough was written as a strict
linear script, but nobody actually uses it that way — people click around
in whatever order, and leftover state from a previous session (persisted
backend choice, a long TTL set for one test bleeding into the next)
violated assumptions steps 1-5 depended on ("first fetch is always a
miss" isn't true if there's a fresh persisted entry left over from
testing step 6).

Rather than keep patching step 6's instructions, the fix was structural:
split into two fully independent areas instead of one shared `cache`
variable driven by a dropdown.

- **Steps 1-5** (`greeting`/`time`, TTL/dedup/SWR/tags) now always run
  against a fresh `MemoryBackend`, built once, no selector. Since a plain
  `Map` is always empty on load regardless of history, these steps are now
  genuinely order- and state-independent — there's nothing left over from
  a previous visit that can make "first fetch is a miss" false.
- **Step 6** ("Persistence across reload") became two permanently-wired
  `AppCache` instances — one `MemoryBackend`, one `CacheAPIBackend` — that
  populate themselves automatically on every page load, no button click,
  no dropdown, no TTL to remember to raise. Persistence is demonstrated
  passively: reload, and the Memory box always shows a new value while the
  CacheStorage box always shows the same one. This also reframed which
  half is actually "interesting" — CacheStorage surviving a reload is the
  expected behavior once you know it's a real persistent API; the Memory
  box losing everything is the surprising part worth watching happen.

This let the whole backend-selector/Apply-button/`localStorage` mechanism
be deleted outright rather than patched again — it existed only to work
around a design (one shared cache, user-chosen backend) that the redesign
made unnecessary.

**A second real bug surfaced immediately while verifying the redesign**:
the CacheStorage persistence box wasn't actually persisting — every reload
showed a new value, the opposite of the point. Root cause:
`JSON.stringify(Infinity)` produces `null` (JSON has no representation for
`Infinity`), and `CacheAPIBackend` round-trips every envelope through JSON.
The persistence boxes were built with `ttl: Infinity` (intended to mean
"never expire," since the whole point of that section is to demonstrate
storage persistence, not TTL behavior) — so the stored `ttl` came back as
`null`, and `elapsed < null` coerces to `elapsed < 0`, which is never true.
The entry was permanently un-freshable, which reads identically to "never
persisted" from the outside. Fixed by using a large finite TTL (a year, in
milliseconds) instead of `Infinity`. `MemoryBackend` never hit this because
it stores the JS object directly — no serialization involved — which is
exactly why the bug was invisible on that side and only showed up once the
same code path ran through the JSON-serializing backend.

Every fix in this section was verified against a real, separately-launched
Chrome instance (a throwaway profile driven via `chromium.connectOverCDP`),
not just re-read or reasoned about — several of these bugs (the double-click
timing, the TTL/reload-cycle timing, the JSON/Infinity coercion) only show
up under real browser timing or a real JSON round-trip, and would not have
been caught by static reading of the code alone.
