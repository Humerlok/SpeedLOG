// Service worker of the installable (PWA) build. build.cjs stamps VERSION with a hash of the built page, so
// every new build gets a new cache and the old one is dropped. In development this file is not registered.
const VERSION = '__VERSION__'
const CACHE = 'speedlog-' + VERSION
const SHELL = [
    './',
    'index.html',
    'manifest.webmanifest',
    'images/icon.svg',
    'images/icon-192.png',
    'images/icon-512.png',
    'images/icon-maskable-512.png',
    'images/apple-touch-icon.png',
    'images/question-circle.svg'
]

self.addEventListener('install', (event) => {
    // cache: 'reload' skips the HTTP cache, so a new version is never filled with stale files
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k.startsWith('speedlog-') && k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    )
})

// Cache first: the app opens at once and offline. A new version is installed in the background and is
// used the next time the app is opened.
self.addEventListener('fetch', (event) => {
    const req = event.request
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
    event.respondWith(
        caches.match(req, { ignoreSearch: true }).then((hit) => {
            if (hit) return hit
            return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
        })
    )
})
