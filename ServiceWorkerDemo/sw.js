// Bump VERSION and reload (twice) to watch the update lifecycle in the page log.
const VERSION = 'v3'
const CACHE_NAME = `sw-demo-${VERSION}`
const PRECACHE_URLS = ['./', './index.html', './logo.svg']

self.addEventListener('install', event => {
    console.log('[sw] install', VERSION)
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting()) // take over without waiting for old tabs to close
    )
})

self.addEventListener('activate', event => {
    console.log('[sw] activate', VERSION)
    event.waitUntil(
        caches
            .keys()
            .then(names =>
                Promise.all(
                    names
                        .filter(name => name !== CACHE_NAME)
                        .map(name => caches.delete(name))
                )
            )
            .then(() => self.clients.claim()) // control already-open pages immediately
    )
})

function reportFetch(url, source) {
    self.clients.matchAll().then(clients => {
        clients.forEach(client =>
            client.postMessage({ type: 'fetch', url, source })
        )
    })
}

// Cache-first: check Cache Storage before ever touching the network.
// This is what lets the page keep working with the network off.
self.addEventListener('fetch', event => {
    const { request } = event
    if (
        request.method !== 'GET' ||
        !request.url.startsWith(self.location.origin)
    ) {
        return
    }

    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) {
                reportFetch(request.url, 'cache')
                return cached
            }
            return fetch(request)
                .then(response => {
                    reportFetch(request.url, 'network')
                    if (response.ok) {
                        const copy = response.clone()
                        caches
                            .open(CACHE_NAME)
                            .then(cache => cache.put(request, copy))
                    }
                    return response
                })
                .catch(() => {
                    reportFetch(request.url, 'offline-miss')
                    return new Response('Offline and not cached', {
                        status: 503,
                        statusText: 'Offline',
                    })
                })
        })
    )
})
