/* ============================================================
   JourneyPro service worker — v2 "true offline"
   Strategy, in plain words:
   · Online: everything comes from the network first, so web
     updates keep flowing to testers instantly — the cache
     quietly refreshes behind each visit.
   · Offline: the whole app shell, data bundle, CDN libraries,
     fonts, and any map tiles you've already seen come back
     from cache. Plans, guides, Travel Mode, the journal and
     the scratch map all work with zero bars.
   · /api/* (live fuel, community) is never cached — offline it
     answers with a polite JSON "offline" the app understands.
   ============================================================ */

const VER = "jp-offline-v2";
const SHELL = VER + "-shell";
const RUNTIME = VER + "-runtime";
const TILES = VER + "-tiles";
const TILE_CAP = 260;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => Promise.all(
        ["/", "/index.html"].map((u) => c.add(u).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VER)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

async function trimTiles() {
  try {
    const c = await caches.open(TILES);
    const keys = await c.keys();
    if (keys.length > TILE_CAP) {
      const excess = keys.length - TILE_CAP;
      for (let i = 0; i < excess; i++) await c.delete(keys[i]);
    }
  } catch (e) { /* best effort */ }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  /* Live APIs: network only, honest offline answer */
  if (sameOrigin && url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ ok: false, error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  /* Map tiles: cache first (a tile never changes), capped */
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(
      caches.open(TILES).then((c) =>
        c.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            if (res && (res.ok || res.type === "opaque")) {
              c.put(req, res.clone());
              trimTiles();
            }
            return res;
          });
        })
      )
    );
    return;
  }

  /* Navigations: network first, shell fallback offline */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(SHELL).then((c) => c.put("/", res.clone()));
          return res;
        })
        .catch(() =>
          caches.match("/").then((hit) => hit || caches.match("/index.html"))
        )
    );
    return;
  }

  /* Hashed build assets: immutable, cache first */
  if (sameOrigin && url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(SHELL).then((c) =>
        c.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            if (res && res.ok) c.put(req, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  /* Everything else (CDN scripts, fonts, icons, manifest):
     network first so updates flow, cache fallback offline */
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === "opaque")) {
          caches.open(RUNTIME).then((c) => c.put(req, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
