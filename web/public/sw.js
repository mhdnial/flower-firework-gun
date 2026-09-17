// Service worker: makes repeat visits fast and cheap on data.
//  - MediaPipe WASM + model (≈12 MB) and hashed /assets files: cache-first (they never change)
//  - pages: network-first, falling back to cache when offline
//  - music: not cached here (browser HTTP cache handles it)
const VERSION = 'v1'
const STATIC_CACHE = `fw-static-${VERSION}`
const PAGE_CACHE = `fw-pages-${VERSION}`

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(PAGE_CACHE).then((c) => c.addAll(['/'])).catch(() => undefined))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC_CACHE, PAGE_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const isImmutable = (url) =>
  url.href.startsWith('https://cdn.jsdelivr.net/npm/@mediapipe/') ||
  url.href.startsWith('https://storage.googleapis.com/mediapipe-models/') ||
  (url.origin === self.location.origin && url.pathname.startsWith('/assets/'))

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (isImmutable(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req, { ignoreVary: true })
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      }),
    )
    return
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(PAGE_CACHE).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/')),
    )
  }
})
