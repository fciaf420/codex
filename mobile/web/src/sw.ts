/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Custom service worker for the Codex Mobile PWA.
//
// Responsibilities:
//   1. Cache-first for the app shell (static assets) so the PWA opens
//      instantly even with bad signal.
//   2. Handle POST /share-target — iOS Web Share Target. Stash the shared
//      file/text in a private Cache and 303-redirect to /share?key=...
//   3. Pass /api/* and /rpc through unmodified (auth + WebSocket).

const sw = self as unknown as ServiceWorkerGlobalScope;

const APP_CACHE = "codex-mobile-app-v1";
const SHARE_CACHE = "codex-mobile-share-v1";

sw.addEventListener("install", () => {
  void sw.skipWaiting();
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop stale cache versions.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("codex-mobile-app-") && n !== APP_CACHE)
          .map((n) => caches.delete(n)),
      );
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShare(req));
    return;
  }

  // Pass-through for the bridge API and WebSocket upgrade.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/rpc")) {
    return;
  }

  if (req.method !== "GET") return;
  if (url.origin !== sw.location.origin) return;

  // Cache-first for app shell + static assets, with SPA navigation fallback.
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req: Request): Promise<Response> {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok && res.status < 400) {
      // Avoid caching opaque/redirected responses.
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    if (req.mode === "navigate") {
      const idx = await cache.match("/");
      if (idx) return idx;
    }
    throw err;
  }
}

async function handleShare(req: Request): Promise<Response> {
  try {
    const fd = await req.formData();
    const files = fd.getAll("files");
    const text = fd.get("text");
    const title = fd.get("title");

    const cache = await caches.open(SHARE_CACHE);
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!(f instanceof Blob)) continue;
      const headers = new Headers();
      if (f.type) headers.set("content-type", f.type);
      const name = (f as File).name;
      if (name) headers.set("x-filename", name);
      await cache.put(
        `/__share/${key}/file/${i}`,
        new Response(f, { headers }),
      );
    }
    const textValue = combine(title, text);
    if (textValue) {
      await cache.put(
        `/__share/${key}/text`,
        new Response(textValue, { headers: { "content-type": "text/plain" } }),
      );
    }

    // 303 forces a GET on the redirect target, which the SPA can handle.
    return Response.redirect(`/share?key=${encodeURIComponent(key)}`, 303);
  } catch {
    return new Response("share staging failed", { status: 500 });
  }
}

function combine(...parts: Array<FormDataEntryValue | null>): string {
  return parts
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .join("\n\n");
}
