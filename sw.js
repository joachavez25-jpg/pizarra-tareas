// ============================================================
// Service Worker mínimo - solo para permitir instalación como PWA
// y dar algo de tolerancia a fallos de red en los archivos estáticos.
// app.js siempre se pide primero a la red (network-first) para que
// los usuarios reciban actualizaciones de lógica sin tener que
// desinstalar la app.
// ============================================================

const CACHE_NAME = 'pizarra-tareas-v1';
const ASSETS_ESTATICOS = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './manifest.json',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_ESTATICOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);

  // Solo interceptamos pedidos al mismo origen (assets propios)
  if (url.origin !== self.location.origin) return;

  // app.js: network-first, para no servir lógica vieja si hay conexión
  if (url.pathname.endsWith('app.js')) {
    evento.respondWith(
      fetch(evento.request)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
          return respuesta;
        })
        .catch(() => caches.match(evento.request))
    );
    return;
  }

  // Resto de assets estáticos: cache-first con actualización en segundo plano
  evento.respondWith(
    caches.match(evento.request).then((cacheado) => {
      const fetchPromise = fetch(evento.request)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
          return respuesta;
        })
        .catch(() => cacheado);
      return cacheado || fetchPromise;
    })
  );
});
