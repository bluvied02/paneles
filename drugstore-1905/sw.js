// El que trabaja por detras de la app:
//   - Guarda la app (las pantallas, no los datos) para que abra sin internet.
//     Primero pide la version nueva; si no hay conexion, usa la guardada.
//   - Recibe las notificaciones aunque la app este cerrada.
// Los datos del negocio los guarda la app misma (IndexedDB), no esto.

// El cache de cada app por separado (la de Blue Store y la de cada cliente
// comparten dominio): al actualizarse, cada una borra solo los suyos.
const ESPACIO = /\/paneles\//.test(self.registration.scope) ? new URL(self.registration.scope).pathname : ''
const PREFIJO = ESPACIO ? 'cliente|' + ESPACIO + '|v' : 'bs-panel-v'
const VERSION = PREFIJO + '13-27'
const APP = ['./', 'index.html', 'estilos.css?v=13.29', 'app.js?v=13.29', 'lector.js?v=13.29', 'productos.js?v=13.29', 'perdidas.js?v=13.29', 'negocio.js?v=13.29', 'promociones.js?v=13.29', 'local.js?v=13.29', 'otros.js?v=13.29', 'personal.js?v=13.29', 'configuracion.js?v=13.29', 'cierres.js?v=13.29', 'mayorista-calculo.js?v=13.29', 'mayorista.js?v=13.29', 'metricas-calculo.js?v=13.29', 'metricas.js?v=13.29', 'manifest.webmanifest', 'icono-192.png', 'icono-512.png']
// Las librerias van en un cache aparte que no se borra al actualizar la app:
// el lector de codigos del iPhone (ZXing) se bajaba la primera vez y despues
// de cada version nueva se perdia, y sin internet la camara no leia.
const LIBRERIAS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.min.js', 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js']
const CACHE_LIBRERIAS = PREFIJO.replace(/v$/, '') + 'librerias'

self.addEventListener('install', (ev) => {
  ev.waitUntil(Promise.all([
    caches.open(VERSION).then((c) => Promise.all(APP.map((u) => c.add(u).catch(() => null)))),
    caches.open(CACHE_LIBRERIAS).then((c) => Promise.all(LIBRERIAS.map((u) => c.match(u).then((ya) => ya || c.add(u).catch(() => null)))))
  ]).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith(PREFIJO) && k !== VERSION && k !== CACHE_LIBRERIAS).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (ev) => {
  const req = ev.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Las librerias (con version en la direccion): de lo guardado, y si no, de internet.
  if (url.hostname === 'cdn.jsdelivr.net') {
    ev.respondWith(caches.match(req).then((r) => r || fetch(req).then((resp) => {
      if (resp.ok) { const copia = resp.clone(); caches.open(CACHE_LIBRERIAS).then((c) => c.put(req, copia)) }
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
    // Los avisos de pedidos abren Reponer, donde se manda en un toque; los
    // pedidos de la tienda online, Encargos.
    data: { url: d.tipo === 'pedido' ? './#/reponer' : d.tipo === 'encargo' ? './#/encargos' : './#/avisos' }
  }))
})

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close()
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
    const url = (ev.notification.data && ev.notification.data.url) || './'
    for (const v of ventanas) if ('focus' in v) { if (v.navigate && url !== './') v.navigate(url).catch(() => {}); return v.focus() }
    return self.clients.openWindow(url)
  }))
})
