/* ============================================================================
   Service worker.

   Not for offline play as a feature — for the second launch.

   The build is 8.6 MB: a 1.6 MB script, a 2.9 MB Draco-compressed cabin, and
   4 MB of terrain and panel textures. On a good LTE connection that is six or
   seven seconds before the WAKE button appears, every single time, and on a
   phone that is the difference between a game somebody comes back to and a tab
   they close. Cached, the second launch is limited by shader compilation and
   the cubemap bakes, which is where it should be.

   Three strategies, because the three kinds of file here have three different
   truths about staleness:

     /assets/*     Vite fingerprints these. The name IS the version, so a hit
                   can never be wrong and the network is never worth asking.
                   Cache-first, forever.

     everything
     else static   Models, icons, the embed image. Stable but not fingerprinted,
                   so a hit *can* be stale. Stale-while-revalidate: serve the
                   copy we have, fetch a fresh one in the background for next
                   time. Nobody waits, and nobody is stuck more than one launch
                   behind.

     navigations   The HTML is the only thing that points at the current
                   fingerprints, so a stale copy strands the player on a build
                   that no longer exists. Network-first, cache as a fallback for
                   a genuinely offline launch.

   `__BUILD__` is stamped at build time (see vite.config.js). Without that the
   worker's bytes never change, the browser never sees a new version, and the
   old caches are never dropped — which is the classic way a service worker
   turns into a permanent outage.
   ========================================================================== */

const V = '__BUILD__';
const SHELL = `tls-shell-${V}`;
const RUN = `tls-run-${V}`;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // Only the entry document is precached. The hashed bundle is discovered on
    // first run and cached then: precaching it here would mean parsing the HTML
    // to find its name, and getting that wrong fails the whole install.
    await c.addAll(['/', '/site.webmanifest', '/favicon.svg']).catch(() => {});
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('tls-') && !k.endsWith(V)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navigations: network first.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        const c = await caches.open(SHELL);
        c.put('/', r.clone());
        return r;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Fingerprinted: cache first, and never revalidate.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) (await caches.open(RUN)).put(req, r.clone());
      return r;
    })());
    return;
  }

  // Everything else: stale while revalidate.
  e.respondWith((async () => {
    const c = await caches.open(RUN);
    const hit = await c.match(req);
    const net = fetch(req).then((r) => {
      // Opaque responses have status 0 and cache as permanent failures.
      if (r.ok && r.type === 'basic') c.put(req, r.clone());
      return r;
    }).catch(() => hit || Response.error());
    return hit || net;
  })());
});
