/*
 * 离线可用的最小 Service Worker。
 *
 * 策略：**网络优先**。
 * 之前用缓存优先，结果发布新版本后旧 bundle 被一直命中，页面永远停在旧代码。
 * 现在：能连网就一定拿最新的；断网时回退到缓存的壳。
 * 学习数据本来就在 IndexedDB 里，离线不影响使用。
 */
const CACHE = 'super-notes-shell-v2'
const SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        }
        return res
      })
      .catch(async () => {
        const hit = await caches.match(req)
        if (hit) return hit
        if (req.mode === 'navigate') {
          const shell = await caches.match('./index.html')
          if (shell) return shell
        }
        return new Response('离线且没有缓存', { status: 503, statusText: 'Offline' })
      }),
  )
})
