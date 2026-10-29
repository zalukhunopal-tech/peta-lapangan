// Service worker: simpan berkas aplikasi agar bisa dibuka tanpa internet.
const VERSI = 'peta-lapangan-react-v1';
const BERKAS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/ikon/ikon.svg',
  '/ikon/ikon-192.png',
  '/ikon/ikon-512.png',
  '/contoh/contoh-peta.pdf',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSI).then((c) => c.addAll(BERKAS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) {
        if (k !== VERSI) await caches.delete(k);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(VERSI);
      const kunci = req.mode === 'navigate' ? '/index.html' : req;
      const tersimpan = await cache.match(kunci, { ignoreSearch: true });
      const dariJaringan = fetch(req).then((r) => {
        if (r.ok && r.type === 'basic') cache.put(kunci, r.clone());
        return r;
      });
      if (tersimpan) {
        e.waitUntil(dariJaringan.catch(() => {}));
        return tersimpan;
      }
      return dariJaringan;
    })()
  );
});
