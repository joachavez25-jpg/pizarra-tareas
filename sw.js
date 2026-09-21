// ============================================================
// Service Worker minimo para permitir instalacion como PWA.
// Estrategia network-first para TODO: la app siempre pide la
// version mas nueva a la red primero y solo usa la cache si no
// hay conexion. Asi, cuando se corrige algo (manifest, estilos,
// logica), los dispositivos que ya habian instalado la PWA
// reciben el cambio en la primera visita con internet, en vez
// de quedar pegados a una version vieja cacheada para siempre.
// ============================================================

const CACHE_NAME = 'pizarra-tareas-v2';
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

                        if (url.origin !== self.location.origin) return;

                        evento.respondWith(
                              fetch(evento.request)
                                .then((respuesta) => {
                                          const copia = respuesta.clone();
                                          caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
                                          return respuesta;
                                })
                                .catch(() => caches.match(evento.request))
                            );
});
