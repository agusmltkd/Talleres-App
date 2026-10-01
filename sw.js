// Service worker: guarda la aplicación para abrirla rápido y sin cobertura.
// Sube el número de versión cada vez que publiques cambios.
const VERSION = 'v2';
const CACHE = 'talleres-' + VERSION;
const BASE = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon-192.png',
  'js/main.js', 'js/api.js', 'js/config.js', 'js/util.js', 'js/store.js', 'js/mapa.js', 'js/ficha.js', 'js/formulario.js',
  'js/agenda.js', 'js/ruta.js', 'js/panel.js', 'js/admin.js', 'js/geocodificar.js', 'data/talleres.json', 'data/provincias.json', 'data/cp.json'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co') || url.hostname.includes('nominatim')) return; // datos siempre en vivo
  const propio = url.origin === location.origin;
  const cdn = /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.hostname);
  if (!propio && !cdn) return;
  // Primero la red (para recibir actualizaciones); si no hay conexión, la copia guardada.
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
