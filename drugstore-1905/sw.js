// El que trabaja por detras de la app:
//   - Guarda la app (las pantallas, no los datos) para que abra sin internet.
//     Primero pide la version nueva; si no hay conexion, usa la guardada.
//   - Recibe las notificaciones aunque la app este cerrada.
// Los datos del negocio los guarda la app misma (IndexedDB), no esto.

const VERSION = 'bs-panel-v12-0'
const APP = ['./', 'index.html', 'estilos.css?v=12.0', 'app.js?v=12.0', 'lector.js?v=12.0', 'productos.js?v=12.0', 'negocio.js?v=12.0', 'promociones.js?v=12.0', 'local.js?v=12.0', 'otros.js?v=12.0', 'manifest.webmanifest', 'icono-192.png', 'icono-512.png']
const LIBRERIAS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.min.js']

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => Promise.all(APP.concat(LIBRERIAS).map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (ev) => {
  const req = ev.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Las librerias (con version en la direccion): de lo guardado, y si no, de internet.
  if (url.hostname === 'cdn.jsdelivr.net') {
    ev.respondWith(caches.match(req).then((r) => r || fetch(req).then((resp) => {
      if (resp.ok) { const copia = resp.clone(); caches.open(VERSION).then((c) => c.put(req, copia)) }
      return resp
    })))
    return
  }
  // La app: primero la version nueva; sin internet, la guardada.
  if (url.origin === self.location.origin) {
    ev.respondWith(fetch(req, { cache: 'no-cache' }).then((resp) => {
      if (resp.ok && !url.pathname.endsWith('proyecto.json')) { const copia = resp.clone(); caches.open(VERSION).then((c) => c.put(req, copia)) }
      return resp
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))))
  }
  // Lo demas (la nube con los datos) pasa directo: los datos los guarda la app.
})

self.addEventListener('push', (ev) => {
  let d = {}
  try { d = ev.data ? ev.data.json() : {} } catch (e) { d = { title: 'Aviso', body: ev.data ? ev.data.text() : '' } }
  ev.waitUntil(self.registration.showNotification(d.title || 'Aviso del negocio', {
    body: d.body || '',
    icon: 'icono-192.png',
    badge: 'icono-192.png',
    tag: d.tag || undefined,
    data: { url: './#/avisos' }
  }))
})

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close()
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
    for (const v of ventanas) if ('focus' in v) return v.focus()
    return self.clients.openWindow((ev.notification.data && ev.notification.data.url) || './')
  }))
})
