'use strict'
// LA APP DEL NEGOCIO (celular y compu de la casa)
//
// Una sola pagina. Se entra con email y contraseña; solo los emails
// autorizados (pos_admins) ven algo.
//
// Lee lo que suben las cajas cada minuto (pos_resumen, pos_datos,
// pos_catalogo, pos_avisos) y, para cambiar algo, deja una ORDEN en
// pos_ordenes: la caja de esa sucursal la toma en menos de un minuto, la
// aplica con sus propias reglas (un precio mal escrito se rechaza igual que en
// el local) y dice como le fue. Nada se escribe directo en los datos de la
// caja: la caja sigue siendo la dueña.
//
// Sin internet: se muestra lo ultimo que se bajo (queda guardado en el
// celular) y los cambios quedan en una cola que se manda sola cuando vuelve la
// conexion. Cada orden lleva su propio id, asi mandarla dos veces no la repite.
//
// Archivos: app.js (esto: datos, conexion, navegacion, inicio, buscador),
// lector.js (la camara), productos.js (productos, stock, crear), negocio.js
// (ventas, reportes, clientes, caja, gastos, proveedores, historial) y
// otros.js (reponer, faltantes, promos, cierres, avisos, ajustes).

const S = {
  sb: null,
  email: '',
  proyecto: '',
  negocio: '',
  seccion: 'inicio',
  params: {},
  sucursal: '',
  sucursales: [],
  cache: {},
  reloj: null,
  enLinea: true,
  datosViejos: null,
  cola: [],
  esperando: new Map(),
  alTerminar: new Map(),
  hojas: [],
  ignorarPop: 0,
  // Lo que se hace recien cuando termina un 'atras' del navegador (cerrar una
  // hoja y abrir otra cosa enseguida, sin que el 'atras' se coma lo nuevo).
  trasAtras: []
}
// La version de la app. Al abrirla (o al volver a ella) se fija si hay una
// nueva publicada y, si la hay, se recarga sola: en el iPhone la app queda
// abierta en memoria y si no, seguiria la vieja por dias.
const VERSION_APP = '12.2'
const $app = document.getElementById('app')
const $tooltip = document.getElementById('tooltip')

// --- utilidades -----------------------------------------------------------------

function el (tag, props, ...hijos) {
  const n = document.createElement(tag)
  for (const k in (props || {})) {
    const v = props[k]
    if (v == null || v === false) continue
    if (k === 'clase') n.className = v
    else if (k === 'texto') n.textContent = v
    else if (k === 'estilo') Object.assign(n.style, v)
    else if (k === 'valor') n.value = v
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v)
    else n.setAttribute(k, v === true ? '' : v)
  }
  for (const h of hijos.flat(6)) if (h != null && h !== false) n.append(h instanceof Node ? h : document.createTextNode(String(h)))
  return n
}
const limpiar = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n }
// Vacia y llena, salteando lo que no va (append nativo escribe 'null' como texto).
const poner = (n, ...hijos) => { limpiar(n); for (const h of hijos.flat(6)) if (h != null && h !== false) n.append(h); return n }
const plata = (c) => (c < 0 ? '−' : '') + '$ ' + Math.round(Math.abs(c || 0) / 100).toLocaleString('es-AR')
const plataExacta = (c) => ((c || 0) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const unidades = (m) => (Math.round((m || 0) / 10) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—')
const pct = (basis) => (basis == null ? '—' : (Math.round(basis) / 100).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%')
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
function fechaCorta (dia) {
  if (!dia) return '—'
  const [a, m, d] = String(dia).slice(0, 10).split('-').map(Number)
  return DIAS[new Date(a, m - 1, d).getDay()] + ' ' + String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0')
}
const fechaHora = (iso) => (iso ? fechaCorta(isoLocal(new Date(iso))) + ' ' + hora(iso) : '—')
function hace (iso) {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return min < 1 ? 'recién' : min === 1 ? 'hace 1 min' : min < 60 ? 'hace ' + min + ' min' : min < 1440 ? 'hace ' + Math.round(min / 60) + ' h' : 'hace ' + Math.round(min / 1440) + ' días'
}
const isoLocal = (f) => f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0')
const hoyISO = () => isoLocal(new Date())
function sumarDias (dia, n) {
  const [a, m, d] = dia.split('-').map(Number)
  return isoLocal(new Date(a, m - 1, d + n))
}
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const coincide = (texto, q) => { const w = sinTildes(q).split(/\s+/).filter(Boolean); const t = sinTildes(texto); return w.every((x) => t.indexOf(x) >= 0) }
const aCentavos = (txt) => { const s = String(txt == null ? '' : txt).trim(); if (!s) return NaN; const n = Number(s.replace(/\$/g, '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : NaN }
const aMilesimas = (txt) => { const s = String(txt == null ? '' : txt).trim(); if (!s) return NaN; const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 1000) : NaN }
const uuid = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16) }))
const vibrar = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms || 40) } catch (e) {} }
// La app de Blue Store y la de cada cliente (/paneles/<cliente>/) viven en el mismo
// dominio (bluvied02.github.io) y el navegador les da la MISMA memoria. Las de los
// clientes guardan todo con su carpeta adelante: asi ninguna lee el proyecto ni la
// sesion de la otra (paso: la de un cliente abrio la nube de Blue Store en el
// celular de Pablo). La de Blue Store sigue con sus nombres de siempre.
const ESPACIO = /\/paneles\//.test(location.pathname) ? location.pathname : ''
const conEspacio = (k) => (ESPACIO ? ESPACIO + '|' + k : k)
const guardarLocal = (k, v) => { try { localStorage.setItem(conEspacio(k), typeof v === 'string' ? v : JSON.stringify(v)) } catch (e) {} }
const leerLocal = (k, def) => { try { const v = localStorage.getItem(conEspacio(k)); if (v == null) return def; try { return JSON.parse(v) } catch (e) { return v } } catch (e) { return def } }
const margenDe = (precio, costo) => (costo > 0 && precio > 0 ? Math.round((precio - costo) * 10000 / costo) : null)
const NOMBRE_MEDIO = { efectivo: 'Efectivo', mercado_pago: 'Mercado Pago', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferencia', qr: 'QR', cuenta_corriente: 'Cuenta corriente' }

// --- iconos (trazos simples, se tiñen con el color del texto) ----------------------

const ICONOS = {
  inicio: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  productos: 'M21 8 12 3 3 8v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
  escanear: 'M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M8 8v8 M11 8v8 M14 8v8 M17 8v8',
  ventas: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3',
  mas: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
  sumar: 'M12 5v14 M5 12h14',
  restar: 'M5 12h14',
  clientes: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 20v-1a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  caja: 'M3 8h18v11H3z M3 12h18 M7 16h3 M7 8V5h10v3',
  gastos: 'M12 2v20 M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  reportes: 'M5 20V11 M11 20V5 M17 20v-7 M3 20h18',
  proveedores: 'M2 6h12v10H2z M14 10h4l3 3v3h-7 M6 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  apagar: 'M4 5h16v16H4z M4 10h16 M9 3v4 M15 3v4 M8 14h3',
  stock: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8 M16 5v4 M10 15v4',
  reponer: 'M9 3h6v3H9z M7 4.5H5V21h14V4.5h-2 M9 12h6 M9 16h4',
  faltantes: 'M12 3 2 20h20z M12 10v4 M12 17h.01',
  promos: 'M3 12V4h8l10 10-8 8z M7.5 7.5h.01',
  cierres: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  historial: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  avisos: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z M10 21h4',
  ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.5z',
  cerrar: 'M6 6l12 12 M18 6 6 18',
  flecha: 'M9 6l6 6-6 6',
  abajo: 'M6 9l6 6 6-6',
  editar: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  telefono: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z',
  mensaje: 'M4 20l1.4-4A8 8 0 1 1 8.5 19z',
  ok: 'M5 12l5 5L20 7',
  linterna: 'M13 2 4 14h7l-1 8 9-12h-7z',
  teclado: 'M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10',
  refrescar: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  salir: 'M15 3h4v18h-4 M10 17l5-5-5-5 M15 12H3',
  local: 'M3 9l1.5-5h15L21 9 M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z M5 13v8h14v-8',
  nube: 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 18z',
  basura: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14',
  subir: 'M12 19V5 M5 12l7-7 7 7',
  bajar: 'M12 5v14 M5 12l7 7 7-7',
  pasar: 'M4 8h13 M13 4l4 4-4 4 M20 16H7 M11 12l-4 4 4 4',
  contar: 'M9 4h6v3H9z M7 5.5H5V21h14V5.5h-2 M8.5 12.5l2 2 4-4 M8.5 17.5h7',
  recibir: 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10 M8 13.5l4 2 4-2',
  pedidos: 'M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h3 M15 15l1.5 1.5L19 13',
  foto: 'M4 7h3l2-3h6l2 3h3v12H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'
}
function icono (nombre, clase) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'ic' + (clase ? ' ' + clase : ''))
  svg.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', ICONOS[nombre] || ICONOS.mas)
  svg.append(p)
  return svg
}

function toast (texto, tipo, segundos) {
  if (typeof tipo === 'number') { segundos = tipo; tipo = '' }
  for (const t of document.querySelectorAll('.aviso-toast')) t.remove()
  const t = el('div', { clase: 'aviso-toast ' + (tipo || ''), role: 'status' }, texto)
  document.body.append(t)
  setTimeout(() => t.remove(), (segundos || 3.5) * 1000)
}

// Cuanto cambio contra antes: flecha, porcentaje y palabra (nunca solo color).
function delta (actual, antes, texto, alReves) {
  if (antes == null || actual == null) return null
  if (!antes) return actual ? el('span', { clase: 'delta igual' }, texto ? texto + ': $ 0' : 'antes 0') : null
  const dif = actual - antes
  if (!dif) return el('span', { clase: 'delta igual' }, '= igual' + (texto ? ' que ' + texto : ''))
  const p = Math.round(dif * 1000 / Math.abs(antes)) / 10
  const bueno = alReves ? dif < 0 : dif > 0
  return el('span', { clase: 'delta ' + (bueno ? 'sube' : 'baja') }, (dif > 0 ? '▲ +' : '▼ ') + p.toLocaleString('es-AR') + '%' + (texto ? ' vs ' + texto : ''))
}

function kpi (rotulo, valor, detalle, opciones = {}) {
  return el(opciones.alTocar ? 'button' : 'div', { clase: 'kpi' + (opciones.clase ? ' ' + opciones.clase : ''), onclick: opciones.alTocar || null },
    el('div', { clase: 'r' }, rotulo), el('div', { clase: 'v' }, valor),
    detalle ? el('div', { clase: 'd' }, detalle) : null)
}

function vacio (texto, icon, boton) {
  return el('div', { clase: 'nada' }, icon ? el('div', { clase: 'ico-grande' }, icono(icon)) : null, el('div', {}, texto), boton || null)
}

function esqueleto (filas) {
  return el('div', {},
    el('div', { clase: 'kpis' }, [0, 1, 2, 3].map(() => el('div', { clase: 'kpi' }, el('div', { clase: 'esqueleto', estilo: { height: '12px', width: '60%' } }), el('div', { clase: 'esqueleto', estilo: { height: '24px', width: '80%', marginTop: '8px' } })))),
    el('div', { clase: 'tarjeta' }, Array.from({ length: filas || 6 }, () => el('div', { clase: 'esqueleto', estilo: { height: '18px', margin: '14px 0' } }))))
}

function cabecera (titulo, sub, ...derecha) {
  return el('div', { clase: 'cabecera' }, el('div', { clase: 't' }, el('h1', {}, titulo), sub ? el('div', { clase: 'sub' }, sub) : null), derecha.flat().filter(Boolean).length ? el('div', { clase: 'acciones-cab' }, derecha) : null)
}

// Barras de una sola serie, con su dato al pasar el dedo o el mouse.
function barras (items, textoDe, rotuloEje, opciones = {}) {
  const max = Math.max(1, ...items.map((x) => x.v))
  const cont = el('div', { clase: 'barras', estilo: opciones.alto ? { height: opciones.alto + 'px' } : null })
  const eje = el('div', { clase: 'eje' })
  items.forEach((x, i) => {
    const mostrar = (ev) => {
      $tooltip.textContent = textoDe(x)
      $tooltip.style.display = 'block'
      const pt = ev.touches ? ev.touches[0] : ev
      $tooltip.style.left = Math.min(window.innerWidth - $tooltip.offsetWidth - 8, Math.max(8, pt.clientX - $tooltip.offsetWidth / 2)) + 'px'
      $tooltip.style.top = Math.max(8, pt.clientY - 44) + 'px'
    }
    cont.append(el('div', {
      clase: 'b' + (x.v ? '' : ' vacia') + (x.tenue ? ' tenue' : ''),
      estilo: { height: (x.v ? Math.max(2, x.v / max * 100) : 0) + '%' },
      title: textoDe(x),
      onmousemove: mostrar,
      ontouchstart: mostrar,
      onmouseleave: () => { $tooltip.style.display = 'none' },
      ontouchend: () => setTimeout(() => { $tooltip.style.display = 'none' }, 1400)
    }))
    eje.append(el('span', {}, rotuloEje(x, i)))
  })
  return el('div', {}, cont, eje)
}

// Una lista con su barra de proporcion (lo mas vendido, por forma de pago...).
function ranking (items, opciones = {}) {
  const max = Math.max(1, ...items.map((x) => x.v))
  return el('div', { clase: 'ranking' }, items.map((x) => el('div', { clase: 'rank', onclick: x.alTocar || null, estilo: x.alTocar ? { cursor: 'pointer' } : null },
    el('div', { clase: 'fila-r' }, el('span', { clase: 'n' }, x.n), el('b', { clase: 'num' }, x.texto)),
    x.sub ? el('div', { clase: 'sub' }, x.sub) : null,
    opciones.sinBarra ? null : el('div', { clase: 'pista' }, el('i', { estilo: { width: Math.max(1, x.v / max * 100) + '%' } })))))
}

// --- lo guardado en el celular (para cuando no hay internet) -------------------------

const DB = {
  _p: null,
  abrir () {
    if (this._p) return this._p
    this._p = new Promise((ok) => {
      try {
        const r = indexedDB.open(conEspacio('bs-panel'), 1)
        r.onupgradeneeded = () => r.result.createObjectStore('kv')
        r.onsuccess = () => ok(r.result)
        r.onerror = () => ok(null)
      } catch (e) { ok(null) }
    })
    return this._p
  },
  async get (k) {
    const db = await this.abrir()
    if (!db) return null
    return new Promise((ok) => {
      try { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => ok(t.result == null ? null : t.result); t.onerror = () => ok(null) } catch (e) { ok(null) }
    })
  },
  async set (k, v) {
    const db = await this.abrir()
    if (!db) return
    return new Promise((ok) => {
      try { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => ok() } catch (e) { ok() }
    })
  }
}

// --- la nube ------------------------------------------------------------------

const esDeRed = (err) => !navigator.onLine || /fetch|network|load failed|networkerror|timeout|abort|conex/i.test(String(err && (err.message || err)))

function red (ok, viejo) {
  const antes = S.enLinea
  S.enLinea = ok
  if (ok) S.datosViejos = null
  else if (viejo && (!S.datosViejos || viejo < S.datosViejos)) S.datosViejos = viejo
  if (antes !== ok) {
    pintarConexion()
    if (ok) vaciarCola()
  }
}

// Lee una clave de pos_datos de todas las sucursales: { sucursalId: fila }.
async function leerDatos (clave, forzar) {
  const k = 'd:' + clave
  const c = S.cache[k]
  if (!forzar && c && Date.now() - c.t < 45000) return c.v
  try {
    const { data, error } = await S.sb.from('pos_datos').select('sucursal_id,nombre,actualizado,datos').eq('clave', clave)
    if (error) throw error
    const v = {}
    for (const f of data || []) v[f.sucursal_id] = f
    S.cache[k] = { t: Date.now(), v }
    DB.set(k, { t: Date.now(), v })
    red(true)
    return v
  } catch (err) {
    if (!esDeRed(err)) throw err
    const g = await DB.get(k)
    red(false, g && g.t)
    if (g) { S.cache[k] = { t: Date.now() - 30000, v: g.v }; return g.v }
    throw new Error('Sin conexión, y este dato todavía no estaba guardado en el celular.')
  }
}
const datosDe = (v, suc) => ((v && v[suc || S.sucursal]) || {}).datos

async function leerResumen (forzar) {
  const c = S.cache.resumen
  if (!forzar && c && Date.now() - c.t < 20000) return c.v
  try {
    // Encargados y empleados ven la lista de sucursales, sin lo vendido (ver
    // docs/panel-supabase-seguridad.sql). Si ese SQL todavia no se corrio, se
    // lee como antes.
    let { data, error } = S.rol !== 'duenio'
      ? await S.sb.from('pos_sucursales').select('sucursal_id,nombre,actualizado').order('nombre')
      : await S.sb.from('pos_resumen').select('*').order('nombre')
    if (error && S.rol !== 'duenio' && !esDeRed(error)) ({ data, error } = await S.sb.from('pos_resumen').select('*').order('nombre'))
    if (error) throw error
    S.cache.resumen = { t: Date.now(), v: data || [] }
    DB.set('resumen', { t: Date.now(), v: data || [] })
    red(true)
    return data || []
  } catch (err) {
    if (!esDeRed(err)) throw err
    const g = await DB.get('resumen')
    red(false, g && g.t)
    if (g) return g.v
    throw new Error('Sin conexión, y todavía no hay datos guardados en el celular.')
  }
}

async function leerCatalogo (sucursalId, forzar) {
  const k = 'c:' + sucursalId
  const c = S.cache[k]
  if (!forzar && c && Date.now() - c.t < 60000) return c.v
  try {
    const filas = []
    // Encargados y empleados: el catalogo sin costos (si el SQL de seguridad
    // todavia no se corrio, el de siempre).
    let tabla = S.rol !== 'duenio' && S.catalogoEquipo !== false ? 'pos_catalogo_equipo' : 'pos_catalogo'
    for (let desde = 0; desde < 30000; desde += 1000) {
      let { data, error } = await S.sb.from(tabla).select('producto_id,datos').eq('sucursal_id', sucursalId).range(desde, desde + 999)
      if (error && tabla === 'pos_catalogo_equipo' && !esDeRed(error)) {
        S.catalogoEquipo = false
        tabla = 'pos_catalogo';
        ({ data, error } = await S.sb.from(tabla).select('producto_id,datos').eq('sucursal_id', sucursalId).range(desde, desde + 999))
      }
      if (error) throw error
      filas.push(...data)
      if (data.length < 1000) break
    }
    const v = filas.map((f) => Object.assign({ id: f.producto_id }, f.datos))
    S.cache[k] = { t: Date.now(), v }
    DB.set(k, { t: Date.now(), v })
    red(true)
    return v
  } catch (err) {
    if (!esDeRed(err)) throw err
    const g = await DB.get(k)
    red(false, g && g.t)
    if (g) { S.cache[k] = { t: Date.now() - 30000, v: g.v }; return g.v }
    throw new Error('Sin conexión, y el catálogo todavía no estaba guardado en el celular.')
  }
}

// Busca un codigo de barras en el catalogo (tambien en otras sucursales).
async function buscarCodigo (codigo, sucursalId) {
  const cod = String(codigo || '').trim()
  const lista = await leerCatalogo(sucursalId || S.sucursal)
  const aca = lista.find((p) => (p.codigos || []).includes(cod))
  if (aca) return { producto: aca, sucursalId: sucursalId || S.sucursal }
  for (const x of S.sucursales) {
    if (x.id === (sucursalId || S.sucursal)) continue
    try {
      const otra = (await leerCatalogo(x.id)).find((p) => (p.codigos || []).includes(cod))
      if (otra) return { producto: null, enOtra: { producto: otra, sucursalId: x.id } }
    } catch (e) { /* esa sucursal no se pudo leer */ }
  }
  return { producto: null }
}

// --- las ordenes (lo que se le pide a la caja) --------------------------------------

const NOMBRE_ORDEN = {
  reporte: 'Reporte',
  ventas_dia: 'Ventas de un día',
  producto: 'Cambio de producto', stock: 'Ajuste de stock', aumento: 'Aumento de precios', producto_nuevo: 'Producto nuevo',
  promo_estado: 'Promo', promo_borrar: 'Borrar promo', promo_guardar: 'Promo nueva', anular_venta: 'Anular venta', anulacion_rechazar: 'No anular',
  cliente_guardar: 'Cliente', cliente_pago: 'Pago de cliente', cliente_deuda: 'Deuda de cliente', gasto: 'Gasto',
  proveedor_guardar: 'Proveedor', deuda_guardar: 'Deuda con proveedor', deuda_pagar: 'Pago a proveedor',
  transferencia_salida: 'Pasar a otra sucursal', conteo: 'Conteo de stock', recepcion: 'Mercadería recibida',
  producto_foto: 'Foto del producto', venta_celular: 'Venta', modo_emergencia: 'Modo emergencia', encargo_guardar: 'Encargo', encargo_estado: 'Encargo'
}

async function cargarCola () {
  S.cola = (await DB.get('cola')) || []
  const esp = (await DB.get('esperando')) || []
  for (const o of esp) if (Date.now() - new Date(o.creado).getTime() < 24 * 3600000) S.esperando.set(o.id, o)
}
const guardarCola = () => DB.set('cola', S.cola)
const guardarEsperando = () => DB.set('esperando', [...S.esperando.values()])

// Deja una orden. Primero queda guardada en el celular; si hay internet se
// manda ya, si no, cuando vuelva. alTerminar(resultado) cuando la caja responde.
async function mandarOrden (sucursalId, tipo, datos, opciones = {}) {
  const o = { id: uuid(), sucursal_id: sucursalId, tipo, datos, texto: opciones.texto || NOMBRE_ORDEN[tipo] || tipo, creado: new Date().toISOString(), silencioso: !!opciones.silencioso }
  S.cola.push(o)
  await guardarCola()
  if (opciones.alTerminar) S.alTerminar.set(o.id, opciones.alTerminar)
  pintarConexion()
  const ok = await vaciarCola()
  if (!opciones.callado) {
    toast(ok ? 'Enviado a ' + nombreSucursal(sucursalId) + '. La caja lo aplica en menos de un minuto.' : 'Sin conexión: quedó guardado y se manda solo cuando vuelva internet.', ok ? '' : 'mal', 4)
  }
  return o.id
}

async function vaciarCola () {
  if (S.vaciando || !S.sb) return !S.cola.length
  S.vaciando = true
  try {
    while (S.cola.length) {
      const o = S.cola[0]
      const { error } = await S.sb.from('pos_ordenes').insert({ id: o.id, sucursal_id: o.sucursal_id, tipo: o.tipo, datos: o.datos })
      if (error && !/duplicate|23505/i.test(String(error.message) + ' ' + String(error.code))) {
        if (esDeRed(error)) { red(false); return false }
        // Un error de la nube (no de la conexion): no se reintenta para siempre.
        S.cola.shift()
        await guardarCola()
        toast('No se pudo mandar "' + o.texto + '": ' + error.message, 'mal', 7)
        continue
      }
      S.cola.shift()
      await guardarCola()
      S.esperando.set(o.id, o)
      await guardarEsperando()
      red(true)
    }
    return true
  } catch (err) {
    if (esDeRed(err)) red(false)
    return false
  } finally {
    S.vaciando = false
    pintarConexion()
    seguirOrdenes()
  }
}

// Mira cada pocos segundos como les fue a las ordenes que esperan a la caja.
function seguirOrdenes () {
  if (S.relojOrdenes || !S.esperando.size) return
  S.relojOrdenes = setTimeout(async () => {
    S.relojOrdenes = null
    const ids = [...S.esperando.keys()]
    if (!ids.length) return
    try {
      const { data, error } = await S.sb.from('pos_ordenes').select('id,estado,resultado').in('id', ids)
      if (error) throw error
      for (const r of data || []) {
        if (r.estado === 'pendiente') continue
        const o = S.esperando.get(r.id)
        S.esperando.delete(r.id)
        const res = r.resultado || {}
        if (o && o.silencioso) { /* lo muestra quien la pidio */ } else if (r.estado === 'aplicada') toast('✓ ' + (o ? o.texto : 'Listo') + (res.mensaje ? ': ' + res.mensaje : ''), 'ok', 4.5)
        else toast('✗ ' + (o ? o.texto : 'La caja') + ' no se pudo: ' + (res.error || 'error'), 'mal', 8)
        // La caja marca la orden y enseguida sube los datos nuevos: se espera
        // unos segundos antes de volver a leer, asi no se ve el valor viejo.
        const fn = S.alTerminar.get(r.id)
        S.alTerminar.delete(r.id)
        if (o && o.silencioso) { if (fn) { try { fn(r) } catch (e) {} } } else setTimeout(() => { S.cache = {}; if (fn) { try { fn(r) } catch (e) {} } }, 5000)
      }
      // Lo que ya no existe en la nube (o es muy viejo) se deja de seguir.
      for (const id of ids) {
        const o = S.esperando.get(id)
        if (o && !(data || []).some((x) => x.id === id) && Date.now() - new Date(o.creado).getTime() > 3600000) S.esperando.delete(id)
      }
      await guardarEsperando()
      red(true)
    } catch (err) { if (esDeRed(err)) red(false) }
    pintarConexion()
    seguirOrdenes()
  }, 4000)
}

// --- arranque --------------------------------------------------------------------

async function proyectoRef () {
  const m = /[#&]p=([a-z0-9]+)/.exec(location.hash)
  if (m) history.replaceState(null, '', location.pathname + '#/inicio')
  // Manda el proyecto de la carpeta (proyecto.json): un link viejo o lo que haya
  // quedado guardado no pueden llevar esta app a la nube de otro negocio.
  try {
    const r = await fetch('proyecto.json', { cache: 'no-store' })
    if (r.ok) { const ref = (await r.json()).ref; if (ref) { guardarLocal('bs.proyecto', ref); return ref } }
  } catch (e) { /* sin internet: lo de abajo */ }
  if (m) { guardarLocal('bs.proyecto', m[1]); return m[1] }
  return leerLocal('bs.proyecto', '')
}

async function buscarVersionNueva () {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
    if (!r.ok) return
    const { version } = await r.json()
    if (!version || version === VERSION_APP) return
    // No se recarga en medio de algo (una ventana abierta, la camara).
    if (S.hojas.length || S.cerrarLector || document.querySelector('.busqueda-global')) return
    if (leerLocal('bs.recargadaA', '') === version) return
    guardarLocal('bs.recargadaA', version)
    location.reload()
  } catch (e) { /* sin internet: sigue la que hay */ }
}

async function arrancar () {
  aplicarTema()
  buscarVersionNueva()
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {})
  S.proyecto = await proyectoRef()
  if (!S.proyecto) return pantallaMensaje('Falta el link', 'Abrí el link completo que te dio el programa de la caja (Configuración → Ver desde el celular).')
  const base = 'https://' + S.proyecto + '.supabase.co'
  let conf = leerLocal('bs.config', null)
  try {
    const r = await fetch(base + '/storage/v1/object/public/panel/config.json', { cache: 'no-store' })
    if (!r.ok) throw new Error('Falta publicar la página desde la caja (' + r.status + ').')
    conf = await r.json()
    guardarLocal('bs.config', conf)
  } catch (err) {
    // Sin internet se arranca igual con lo guardado.
    if (!conf) return pantallaMensaje('Sin conexión', 'Para entrar la primera vez hace falta internet. ' + (err.message || ''), true)
    S.enLinea = false
  }
  S.negocio = conf.nombre || conf.negocio || 'Mi negocio'
  document.title = S.negocio
  S.sb = window.supabase.createClient(base, conf.anon, { auth: { persistSession: true, autoRefreshToken: true, storageKey: conEspacio('bs-panel'), detectSessionInUrl: true } })
  S.sb.auth.onAuthStateChange((evento) => { if (evento === 'PASSWORD_RECOVERY') pantallaNuevaClave() })
  const { data } = await S.sb.auth.getSession()
  if (/type=recovery/.test(location.hash)) return
  if (!data.session) return pantallaEntrar()
  entrarAlPanel(data.session)
}

function pantallaMensaje (titulo, texto, reintentar) {
  poner($app, el('div', { clase: 'entrar' }, el('img', { clase: 'logo', src: 'icono-192.png', alt: '' }), el('h1', {}, titulo), el('p', {}, texto),
    reintentar ? el('button', { clase: 'btn primario ancho grande', onclick: () => location.reload() }, 'Probar de nuevo') : null))
}

// Los empleados entran con su usuario y el PIN de la caja. Por detras es una
// cuenta comun: el mail y la contraseña se arman igual que en la caja.
const DOMINIO_EMPLEADOS = 'empleados.pos.local'

function pantallaEntrar (mensaje) {
  if (leerLocal('bs.modoEntrar', '') === 'empleado') return pantallaEntrarEmpleado(mensaje)
  const email = el('input', { type: 'email', autocomplete: 'username', placeholder: 'tu@email.com', inputmode: 'email' })
  const clave = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña' })
  const error = el('div', { clase: 'error' }, mensaje || '')
  email.value = leerLocal('bs.email', '') || ''
  const boton = el('button', { clase: 'btn primario ancho grande' }, 'Entrar')
  const entrar = async () => {
    error.textContent = ''
    boton.disabled = true
    boton.textContent = 'Entrando…'
    const { data, error: err } = await S.sb.auth.signInWithPassword({ email: email.value.trim(), password: clave.value })
    boton.disabled = false
    boton.textContent = 'Entrar'
    if (err) { error.textContent = /invalid/i.test(err.message) ? 'Email o contraseña incorrectos.' : esDeRed(err) ? 'Sin conexión. Revisá internet y probá de nuevo.' : err.message; return }
    guardarLocal('bs.email', email.value.trim())
    entrarAlPanel(data.session)
  }
  boton.addEventListener('click', entrar)
  const olvide = async () => {
    if (!email.value.trim()) { error.textContent = 'Escribí tu email y tocá de nuevo.'; return }
    const { error: err } = await S.sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname })
    error.textContent = err ? err.message : 'Te mandamos un mail para crear una contraseña nueva. Abrilo en este mismo celular o compu.'
  }
  clave.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') entrar() })
  poner($app, el('div', { clase: 'entrar' },
    el('img', { clase: 'logo', src: 'icono-192.png', alt: '' }),
    el('h1', {}, S.negocio),
    el('p', {}, 'Entrá con tu email y tu contraseña.'),
    el('label', { clase: 'campo' }, 'Email', email),
    el('label', { clase: 'campo' }, 'Contraseña', clave),
    error, boton,
    el('p', { estilo: { marginTop: '16px', textAlign: 'center' } }, el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); olvide() } }, 'Me olvidé la contraseña')),
    el('button', { clase: 'btn ancho', estilo: { marginTop: '18px' }, onclick: () => { guardarLocal('bs.modoEntrar', 'empleado'); pantallaEntrarEmpleado() } }, 'Soy empleado: entrar con mi usuario y PIN')))
  ;(email.value ? clave : email).focus()
}

function pantallaEntrarEmpleado (mensaje) {
  const usuario = el('input', { type: 'text', autocomplete: 'username', placeholder: 'Ej: lucia', autocapitalize: 'none', spellcheck: 'false' })
  const pin = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'current-password', placeholder: 'El PIN de la caja', maxlength: '8' })
  const error = el('div', { clase: 'error' }, mensaje || '')
  usuario.value = leerLocal('bs.usuarioEmpleado', '') || ''
  const boton = el('button', { clase: 'btn primario ancho grande' }, 'Entrar')
  const entrar = async () => {
    const u = usuario.value.trim().toLowerCase()
    if (!u || !pin.value.trim()) { error.textContent = 'Escribí tu usuario y tu PIN.'; return }
    error.textContent = ''
    boton.disabled = true
    boton.textContent = 'Entrando…'
    const { data, error: err } = await S.sb.auth.signInWithPassword({ email: u + '@' + DOMINIO_EMPLEADOS, password: 'bs-pin-' + pin.value.trim() })
    boton.disabled = false
    boton.textContent = 'Entrar'
    pin.value = ''
    if (err) { error.textContent = /invalid/i.test(err.message) ? 'Usuario o PIN incorrectos. Si no tenés usuario, pedíselo al dueño.' : esDeRed(err) ? 'Sin conexión. Revisá internet y probá de nuevo.' : /many|rate/i.test(err.message) ? 'Demasiados intentos. Esperá unos minutos.' : err.message; return }
    guardarLocal('bs.usuarioEmpleado', u)
    entrarAlPanel(data.session)
  }
  boton.addEventListener('click', entrar)
  pin.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') entrar() })
  poner($app, el('div', { clase: 'entrar' },
    el('img', { clase: 'logo', src: 'icono-192.png', alt: '' }),
    el('h1', {}, S.negocio),
    el('p', {}, 'Entrá con tu usuario y el mismo PIN de la caja. Funciona mientras tengas el turno iniciado.'),
    el('label', { clase: 'campo' }, 'Usuario', usuario),
    el('label', { clase: 'campo' }, 'PIN', pin),
    error, boton,
    el('button', { clase: 'btn ancho', estilo: { marginTop: '18px' }, onclick: () => { guardarLocal('bs.modoEntrar', ''); pantallaEntrar() } }, 'Soy el dueño o encargado: entrar con mail')))
  ;(usuario.value ? pin : usuario).focus()
}

function pantallaNuevaClave () {
  const clave = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Contraseña nueva (8 o más)' })
  const error = el('div', { clase: 'error' })
  const guardar = async () => {
    if (clave.value.length < 8) { error.textContent = 'Tiene que tener 8 o más caracteres.'; return }
    const { error: err } = await S.sb.auth.updateUser({ password: clave.value })
    if (err) { error.textContent = err.message; return }
    history.replaceState(null, '', location.pathname + '#/inicio')
    toast('Contraseña cambiada', 'ok')
    const { data } = await S.sb.auth.getSession()
    entrarAlPanel(data.session)
  }
  poner($app, el('div', { clase: 'entrar' },
    el('h1', {}, 'Contraseña nueva'), el('p', {}, 'Elegí la contraseña con la que vas a entrar.'),
    el('label', { clase: 'campo' }, 'Contraseña nueva', clave), error,
    el('button', { clase: 'btn primario ancho grande', onclick: guardar }, 'Guardar')))
  clave.focus()
}

async function entrarAlPanel (sesion) {
  S.email = (sesion && sesion.user && sesion.user.email) || leerLocal('bs.email', '') || ''
  // El rol lo pone la caja en la cuenta: el usuario no lo puede cambiar.
  const ROLES_CEL = ['encargado', 'empleado']
  if (sesion && sesion.user) {
    const meta = sesion.user.app_metadata || {}
    S.rol = ROLES_CEL.includes(meta.rol) ? meta.rol : 'duenio'
    // El empleado es de una sola sucursal y firma con su usuario de la caja.
    S.empleado = S.rol === 'empleado' ? { usuarioId: meta.usuarioId, sucursalId: meta.sucursalId } : null
    guardarLocal('bs.rol', S.rol)
    guardarLocal('bs.empleado', S.empleado)
  } else {
    S.rol = ROLES_CEL.includes(leerLocal('bs.rol', 'duenio')) ? leerLocal('bs.rol', 'duenio') : 'duenio'
    S.empleado = S.rol === 'empleado' ? leerLocal('bs.empleado', null) : null
  }
  await cargarCola()
  // Sin internet se entra con lo guardado; el permiso se revisa al volver.
  try {
    const { data: admin, error } = await S.sb.from('pos_admins').select('email').limit(1)
    if (error) throw error
    if (!admin || !admin.length) return pantallaMensaje('Sin permiso', 'El usuario ' + S.email + ' no está autorizado. Pedile al dueño que lo agregue.')
    guardarLocal('bs.admin', S.email)
  } catch (err) {
    if (!esDeRed(err) || leerLocal('bs.admin', '') !== S.email) return pantallaMensaje('Sin conexión', 'No se pudo revisar tu usuario. Probá de nuevo con internet.', true)
    S.enLinea = false
  }
  const filas = await leerResumen().catch(() => [])
  S.sucursales = filas.map((f) => ({ id: f.sucursal_id, nombre: f.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  S.sucursal = leerLocal('bs.sucursal', '') || ''
  if (!S.sucursales.some((x) => x.id === S.sucursal)) S.sucursal = S.sucursales[0] ? S.sucursales[0].id : ''
  if (esEmpleado() && S.empleado && S.empleado.sucursalId) {
    S.sucursal = S.empleado.sucursalId
    S.sucursales = S.sucursales.filter((x) => x.id === S.sucursal)
  }
  pintarArmazon()
  const m = /^#\/(\w+)/.exec(location.hash)
  ir(m && SECCIONES[m[1]] ? m[1] : 'inicio', {}, true)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { buscarVersionNueva(); vaciarCola(); if (S.seccion === 'inicio' && !S.hojas.length) render() } })
  window.addEventListener('online', () => vaciarCola())
  window.addEventListener('offline', () => red(false))
  setInterval(() => { if (S.cola.length) vaciarCola() }, 30000)
  vaciarCola()
  contarAvisos()
}

// --- armazon y navegacion ------------------------------------------------------------

const SECCIONES = {}
// Cada archivo registra sus secciones: { nombre, icono, grupo, fn(params) }.
function seccion (id, def) { SECCIONES[id] = def }

// Dueño o encargado. El encargado ve lo del local; la plata, los costos y los
// precios son del dueño. (La caja revisa lo mismo antes de aplicar cada orden.)
const SOLO_DUENIO = ['reportes', 'caja', 'gastos', 'apagar', 'proveedores', 'promos', 'cierres', 'historial', 'ventas']
const PERMISOS_ENCARGADO = ['verStock', 'ajustarStock', 'contar', 'recibir', 'pasar', 'clientes', 'productoNuevo', 'fotos', 'pedidosClientes', 'vender']
// El empleado: vender y contar stock, nada mas (y solo con el turno abierto).
const PERMISOS_EMPLEADO = ['contar', 'vender']
const SECCIONES_EMPLEADO = ['inicio', 'vender', 'contar', 'ajustes', 'mas']
const esEncargado = () => S.rol === 'encargado'
const esEmpleado = () => S.rol === 'empleado'
function puede (permiso) {
  if (esEmpleado()) return PERMISOS_EMPLEADO.includes(permiso)
  return !esEncargado() || PERMISOS_ENCARGADO.includes(permiso)
}
const seccionPermitida = (id) => esEmpleado() ? SECCIONES_EMPLEADO.includes(id) : (!esEncargado() || !SOLO_DUENIO.includes(id))

const GRUPOS = [['principal', ''], ['negocio', 'Negocio'], ['mercaderia', 'Mercadería'], ['control', 'Control']]
const ABAJO = ['inicio', 'productos', 'escanear', 'ventas', 'mas']
const abajo = () => esEmpleado() ? ['inicio', 'vender', 'escanear', 'contar', 'mas'] : esEncargado() ? ['inicio', 'productos', 'escanear', 'contar', 'mas'] : ABAJO

function pintarArmazon () {
  const lado = el('nav', { clase: 'lado', 'aria-label': 'Secciones' },
    el('div', { clase: 'marca' }, el('img', { src: 'icono-192.png', alt: '' }), S.negocio),
    el('button', { onclick: () => abrirBuscador() }, icono('buscar'), 'Buscar', el('span', { clase: 'sub', estilo: { marginLeft: 'auto' } }, '/')),
    el('button', { onclick: () => escanearYAbrir() }, icono('escanear'), 'Escanear'),
    GRUPOS.map(([g, t]) => [t && Object.entries(SECCIONES).some(([id, s]) => s.grupo === g && seccionPermitida(id)) ? el('div', { clase: 'grupo' }, t) : null,
      Object.entries(SECCIONES).filter(([id, s]) => s.grupo === g && seccionPermitida(id)).map(([id, s]) => el('button', { 'data-sec': id, onclick: () => ir(id) },
        icono(s.icono), s.nombre, id === 'avisos' ? el('span', { clase: 'insignia', 'data-insignia': '', estilo: { display: 'none' } }) : null))]))
  const tabbar = el('nav', { clase: 'tabbar', 'aria-label': 'Secciones' }, abajo().map((id) => id === 'escanear'
    ? el('button', { clase: 'escanear', onclick: () => escanearYAbrir(), 'aria-label': 'Escanear producto' }, el('span', { clase: 'bola' }, icono('escanear')), 'Escanear')
    : el('button', { 'data-sec': id, onclick: () => ir(id) }, icono(SECCIONES[id].icono), SECCIONES[id].corto || SECCIONES[id].nombre,
      id === 'mas' ? el('span', { clase: 'insignia', 'data-insignia': '', estilo: { display: 'none' } }) : null)))
  S.arriba = el('header', { clase: 'arriba' })
  S.main = el('main', {})
  poner($app, el('div', { clase: 'app' }, lado, el('div', { estilo: { minWidth: 0 } }, el('div', { estilo: { maxWidth: '1200px', padding: '0 max(14px, min(28px, 3vw))' } }, S.arriba), S.main)), tabbar)
  pintarArriba()
  document.addEventListener('keydown', (ev) => {
    if (ev.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') && !S.hojas.length) { ev.preventDefault(); abrirBuscador() }
  })
}

function pintarArriba () {
  if (!S.arriba) return
  const suc = S.sucursales.find((x) => x.id === S.sucursal)
  S.conexion = el('button', { clase: 'conexion', onclick: () => hojaConexion() })
  poner(S.arriba,
    el('div', { clase: 'quien' },
      el('div', { clase: 'negocio' }, S.negocio),
      el('button', { clase: 'donde', onclick: () => hojaSucursales() }, icono('local'), suc ? suc.nombre : 'Sin sucursales', S.sucursales.length > 1 ? icono('abajo') : null)),
    S.conexion,
    el('button', { clase: 'avatar', 'aria-label': 'Tu cuenta', onclick: () => ir('ajustes') }, (S.email || '?').slice(0, 1).toUpperCase()))
  pintarConexion()
}

function pintarConexion () {
  const b = S.conexion
  if (!b) return
  const pendientes = S.cola.length
  const esperando = S.esperando.size
  let clase = ''
  let texto = 'Conectado'
  if (!S.enLinea) { clase = 'off'; texto = 'Sin conexión' + (pendientes ? ' · ' + pendientes : '') }
  else if (pendientes || esperando) { clase = 'sinc'; texto = pendientes ? 'Enviando ' + pendientes : 'Esperando la caja' + (esperando > 1 ? ' (' + esperando + ')' : '') }
  b.className = 'conexion ' + clase
  poner(b, el('span', { clase: 'punto' }), el('span', {}, texto))
}

function nombreSucursal (id) { return (S.sucursales.find((x) => x.id === id) || {}).nombre || 'la sucursal' }

function cambiarSucursal (id) {
  S.sucursal = id
  guardarLocal('bs.sucursal', id)
  pintarArriba()
  render()
}

async function hojaSucursales () {
  if (S.sucursales.length < 2) return hojaConexion()
  const resumenes = await leerResumen().catch(() => [])
  abrirHoja({
    titulo: 'Elegí la sucursal',
    cuerpo: el('div', { clase: 'lista' }, S.sucursales.map((x) => {
      const r = resumenes.find((f) => f.sucursal_id === x.id) || {}
      const d = r.datos || {}
      return el('button', { clase: 'item', onclick: () => { cerrarHoja(); cambiarSucursal(x.id) } },
        el('div', { clase: 'cuerpo' }, el('b', {}, x.nombre), el('div', { clase: 'sub' }, (d.caja && d.caja.abierta ? 'Caja abierta · ' : 'Caja cerrada · ') + 'hoy ' + plata(d.total) + ' · ' + hace(r.actualizado))),
        x.id === S.sucursal ? el('span', { clase: 'chip info' }, icono('ok'), 'Esta') : icono('flecha'))
    }))
  })
}

// El estado de la conexion y de cada caja, y lo que esta esperando.
async function hojaConexion () {
  const resumenes = await leerResumen().catch(() => [])
  const cola = S.cola.map((o) => el('div', { clase: 'item' }, el('div', { clase: 'cuerpo' }, el('b', {}, o.texto), el('div', { clase: 'sub' }, nombreSucursal(o.sucursal_id) + ' · ' + hace(o.creado))), el('span', { clase: 'chip mal' }, 'Sin enviar')))
  const esperan = [...S.esperando.values()].map((o) => el('div', { clase: 'item' }, el('div', { clase: 'cuerpo' }, el('b', {}, o.texto), el('div', { clase: 'sub' }, nombreSucursal(o.sucursal_id) + ' · ' + hace(o.creado))), el('span', { clase: 'chip alerta' }, 'Esperando la caja')))
  abrirHoja({
    titulo: 'Conexión',
    cuerpo: el('div', {},
      el('div', { clase: 'aviso ' + (S.enLinea ? 'ok' : 'mal') }, el('b', {}, S.enLinea ? 'Conectado' : 'Sin conexión'),
        S.enLinea ? 'Los datos se actualizan solos.' : 'Estás viendo lo último guardado en el celular' + (S.datosViejos ? ' (' + hace(new Date(S.datosViejos).toISOString()) + ')' : '') + '. Los cambios quedan en espera y se mandan solos cuando vuelva internet.'),
      el('h3', {}, 'Cada caja'),
      el('div', { clase: 'lista' }, resumenes.length ? resumenes.map((r) => {
        const atraso = Date.now() - new Date(r.actualizado).getTime()
        return el('div', { clase: 'item' }, el('div', { clase: 'cuerpo' }, el('b', {}, r.nombre), el('div', { clase: 'sub' }, 'Subió datos ' + hace(r.actualizado))),
          el('span', { clase: 'chip ' + (atraso > 10 * 60000 ? 'mal' : atraso > 3 * 60000 ? 'alerta' : 'ok') }, atraso > 10 * 60000 ? 'Sin conexión' : atraso > 3 * 60000 ? 'Atrasada' : 'En línea'))
      }) : vacio('Todavía no se conectó ninguna caja.')),
      cola.length || esperan.length ? [el('h3', {}, 'Cambios en camino'), el('div', { clase: 'lista' }, cola, esperan)] : null,
      el('p', { clase: 'sub', estilo: { marginTop: '12px' } }, 'Lo que cambiás acá lo aplica la caja de esa sucursal: tiene que estar prendida, con el programa abierto e internet. Si no, queda esperando y entra cuando vuelve.')),
    botones: [{ texto: 'Reintentar ahora', alTocar: async () => { S.cache = {}; await vaciarCola(); cerrarHoja(); render() } }]
  })
}

// Corre fn ahora, o cuando termine el 'atras' que esta en camino.
function luegoDeAtras (fn) { if (S.ignorarPop > 0) S.trasAtras.push(fn); else fn() }
const esperarAtras = () => new Promise((ok) => luegoDeAtras(ok))

function ir (id, params, reemplazar) {
  if (!SECCIONES[id] || !seccionPermitida(id)) id = 'inicio'
  // Si se esta cerrando una hoja, se espera a que el 'atras' termine.
  if (S.ignorarPop > 0) { S.trasAtras.push(() => ir(id, params, reemplazar)); return }
  S.seccion = id
  S.params = params || {}
  const hash = '#/' + id
  if (location.hash !== hash) history[reemplazar ? 'replaceState' : 'pushState']({ sec: id }, '', hash)
  render()
}

window.addEventListener('popstate', () => {
  if (S.ignorarPop > 0) {
    S.ignorarPop--
    if (!S.ignorarPop) { const lista = S.trasAtras.splice(0); for (const fn of lista) { try { fn() } catch (e) {} } }
    return
  }
  if (S.cerrarLector) { S.cerrarLector(); return }
  if (S.hojas.length) { quitarHoja(); return }
  if (document.querySelector('.busqueda-global')) { document.querySelector('.busqueda-global').remove(); return }
  const m = /^#\/(\w+)/.exec(location.hash)
  S.seccion = m && SECCIONES[m[1]] ? m[1] : 'inicio'
  S.params = {}
  render()
})

function render () {
  if (!S.main) return
  clearInterval(S.reloj)
  // Cualquier camino (atras, un link, el hash escrito a mano) pasa por aca.
  if (!SECCIONES[S.seccion] || !seccionPermitida(S.seccion)) S.seccion = 'inicio'
  const id = S.seccion
  for (const b of document.querySelectorAll('[data-sec]')) {
    const enAbajo = !!b.closest('.tabbar')
    const activo = b.dataset.sec === id || (enAbajo && b.dataset.sec === 'mas' && !abajo().includes(id))
    b.classList.toggle('activo', !!activo)
  }
  if (!S.main.firstChild) poner(S.main, esqueleto())
  S.main.classList.add('cargando-main')
  const pedido = (S.pedido = {})
  Promise.resolve(SECCIONES[id].fn(S.params || {})).catch((err) => {
    if (pedido !== S.pedido) return
    poner(S.main, el('div', { clase: 'tarjeta' }, vacio('No se pudo cargar: ' + (err.message || err), 'nube',
      el('button', { clase: 'btn', onclick: () => { S.cache = {}; render() } }, icono('refrescar'), 'Probar de nuevo'))))
  }).finally(() => { S.main.classList.remove('cargando-main') })
  if (!S.params || !S.params.mantenerScroll) window.scrollTo(0, 0)
}

// Pinta la seccion solo si el usuario no se fue a otra mientras cargaba.
function pintarSeccion (id, ...hijos) {
  if (S.seccion !== id) return false
  poner(S.main, hijos)
  return true
}

// --- la hoja (sube desde abajo en el celular, ventana en la compu) ------------------

function abrirHoja (opciones) {
  if (S.ignorarPop > 0) { S.trasAtras.push(() => abrirHoja(opciones)); return null }
  const { titulo, cuerpo, botones, completa, alCerrar, sinCancelar } = opciones
  const telon = el('div', { clase: 'telon', onclick: (ev) => { if (ev.target === telon) cerrarHoja() } })
  const pie = (botones || []).length ? el('div', { clase: 'pie-hoja' },
    sinCancelar ? null : el('button', { clase: 'btn', onclick: () => cerrarHoja() }, 'Cancelar'),
    botones.map((b) => el('button', { clase: 'btn' + (b.primario ? ' primario' : '') + (b.peligro ? ' peligro' : ''), onclick: (ev) => b.alTocar(cerrarHoja, ev.currentTarget) }, b.texto))) : null
  const hoja = el('div', { clase: 'hoja' + (completa ? ' completa' : ''), role: 'dialog', 'aria-label': titulo },
    el('div', { clase: 'agarre' }),
    el('div', { clase: 'cab-hoja' }, el('h2', {}, titulo), el('button', { clase: 'btn-ico', 'aria-label': 'Cerrar', onclick: () => cerrarHoja() }, icono('cerrar'))),
    el('div', { clase: 'cuerpo-hoja' }, cuerpo),
    pie)
  telon.append(hoja)
  document.body.append(telon)
  S.hojas.push({ telon, alCerrar })
  history.pushState({ hoja: S.hojas.length }, '', location.hash)
  const tecla = (ev) => { if (ev.key === 'Escape' && S.hojas.length && S.hojas[S.hojas.length - 1].telon === telon) cerrarHoja() }
  document.addEventListener('keydown', tecla)
  S.hojas[S.hojas.length - 1].tecla = tecla
  const primero = telon.querySelector('input:not([type=checkbox]), select, textarea')
  if (primero && window.innerWidth > 860) primero.focus()
  return { telon, hoja, cuerpo: hoja.querySelector('.cuerpo-hoja') }
}

function quitarHoja () {
  const h = S.hojas.pop()
  if (!h) return
  h.telon.remove()
  document.removeEventListener('keydown', h.tecla)
  if (h.alCerrar) { try { h.alCerrar() } catch (e) {} }
}

// Cierra la hoja de arriba, o las n de arriba (y saca sus pasos del historial
// del navegador de una sola vez).
function cerrarHoja (n) {
  const cuantas = Math.min(Math.max(1, Number(n) || 1), S.hojas.length)
  if (!cuantas) return
  for (let i = 0; i < cuantas; i++) quitarHoja()
  S.ignorarPop++
  history.go(-cuantas)
}

// --- INICIO --------------------------------------------------------------------------

const ACCESOS = {
  escanear: { nombre: 'Escanear', icono: 'escanear', fn: () => escanearYAbrir() },
  nuevoProducto: { nombre: 'Nuevo producto', icono: 'sumar', fn: () => hojaNuevoProducto({}) },
  stock: { nombre: 'Arreglo de stock', icono: 'stock', fn: () => ir('stock') },
  clientes: { nombre: 'Clientes', icono: 'clientes', fn: () => ir('clientes') },
  caja: { nombre: 'Caja', icono: 'caja', fn: () => ir('caja') },
  ventas: { nombre: 'Ventas', icono: 'ventas', fn: () => ir('ventas') },
  reportes: { nombre: 'Reportes', icono: 'reportes', fn: () => ir('reportes') },
  gastos: { nombre: 'Gastos', icono: 'gastos', fn: () => ir('gastos') },
  productos: { nombre: 'Productos', icono: 'productos', fn: () => ir('productos') },
  proveedores: { nombre: 'Proveedores', icono: 'proveedores', fn: () => ir('proveedores') },
  apagar: { nombre: 'A pagar', icono: 'apagar', fn: () => ir('apagar') },
  reponer: { nombre: 'Reponer', icono: 'reponer', fn: () => ir('reponer') },
  faltantes: { nombre: 'Faltantes', icono: 'faltantes', fn: () => ir('faltantes') },
  promos: { nombre: 'Promos', icono: 'promos', fn: () => ir('promos') },
  historial: { nombre: 'Historial', icono: 'historial', fn: () => ir('historial') },
  avisos: { nombre: 'Avisos', icono: 'avisos', fn: () => ir('avisos') }
}
const ACCESOS_DE_FABRICA = ['escanear', 'nuevoProducto', 'stock', 'clientes', 'caja', 'ventas', 'reportes', 'gastos']
const accesosElegidos = () => (leerLocal('bs.accesos', null) || ACCESOS_DE_FABRICA).filter((k) => ACCESOS[k] && seccionPermitida(k))

// El orden del dia operativo: de las 6 a las 5 del otro dia (un local 24 horas).
const ordenHora = (h) => (h - 6 + 24) % 24

// El inicio del encargado: lo del local, sin plata.
async function secInicioEncargado () {
  const lista = S.sucursal ? await leerCatalogo(S.sucursal).catch(() => []) : []
  const activos = lista.filter((p) => p.activo !== false)
  const negativos = activos.filter((p) => p.stock < 0).length
  const bajos = activos.filter((p) => p.minimo > 0 && p.stock >= 0 && p.stock < p.minimo).length
  const tareas = [
    ['escanear', 'Consultar un producto', 'escanear', () => escanearYAbrir()],
    ['contar', 'Contar stock', 'contar'],
    ['recibir', 'Recibir mercadería', 'recibir'],
    ['pasar', 'Pasar a otra sucursal', 'pasar'],
    ['stock', 'Arreglo de stock', 'stock'],
    ['encargos', 'Encargos de clientes', 'pedidos'],
    ['reponer', 'Reponer', 'reponer'],
    ['faltantes', 'Faltantes', 'faltantes']
  ].filter(([id]) => id === 'escanear' || SECCIONES[id])
  pintarSeccion('inicio',
    cabecera('Hola', nombreSucursal(S.sucursal) + ' · encargado'),
    el('div', { clase: 'mas-grilla' }, tareas.map(([id, nombre, ic, fn]) => el('button', { clase: 'acceso', onclick: fn || (() => ir(id)) }, el('span', { clase: 'ico' }, icono(ic)), nombre))),
    negativos || bajos
      ? el('div', { clase: 'tarjeta tocable', estilo: { marginTop: '12px' }, onclick: () => ir(negativos ? 'stock' : 'reponer') },
        negativos ? el('b', { clase: 'rojo' }, negativos + ' productos en negativo') : null,
        bajos ? el('div', { clase: 'sub' }, bajos + ' productos bajo el mínimo') : null,
        el('div', { clase: 'sub' }, negativos ? 'Contalos y corregilos' : 'Para reponer'))
      : null)
}

async function secInicio () {
  if (esEmpleado()) return secInicioEmpleado()
  if (esEncargado()) return secInicioEncargado()
  const todas = !!leerLocal('bs.inicioTodas', false) && S.sucursales.length > 1
  const [resumenes, reps, hists, anul, deudas] = await Promise.all([
    leerResumen(true),
    leerDatos('reportes').catch(() => ({})),
    leerDatos('historial').catch(() => ({})),
    leerDatos('anulaciones').catch(() => ({})),
    leerDatos('deudas').catch(() => ({}))
  ])
  const ids = todas ? S.sucursales.map((x) => x.id) : [S.sucursal]
  const filas = resumenes.filter((r) => ids.includes(r.sucursal_id))
  const hoy = hoyISO()
  const suma = (fn) => filas.reduce((a, f) => a + (fn(f.datos || {}, f.sucursal_id) || 0), 0)
  const total = suma((d) => d.total)
  const ventas = suma((d) => d.ventas)
  const unid = suma((d) => d.unidades)
  const ahora = ordenHora(new Date().getHours())
  // Ayer hasta esta misma hora: si hoy vendio menos, es contra lo comparable.
  const ayerAEstaHora = ids.reduce((a, id) => {
    const r = datosDe(reps, id)
    return a + (r && r.ayer ? r.ayer.horas.reduce((s, x, h) => s + (ordenHora(h) <= ahora ? x[0] : 0), 0) : 0)
  }, 0)
  const ayerTicket = ids.reduce((a, id) => { const r = datosDe(reps, id); return a + (r && r.ayer ? r.ayer.total : 0) }, 0)
  const ayerVentas = ids.reduce((a, id) => { const r = datosDe(reps, id); return a + (r && r.ayer ? r.ayer.ventas : 0) }, 0)
  // El mes contra el mes pasado hasta el mismo dia.
  const mesIni = hoy.slice(0, 8) + '01'
  const [a, m] = hoy.split('-').map(Number)
  const antIni = isoLocal(new Date(a, m - 2, 1))
  const antFin = isoLocal(new Date(a, m - 2, Math.min(Number(hoy.slice(8)), new Date(a, m - 1, 0).getDate())))
  let mes = 0
  let mesAnt = 0
  for (const id of ids) for (const d of datosDe(hists, id) || []) {
    if (d.dia >= mesIni && d.dia <= hoy) mes += d.total
    if (d.dia >= antIni && d.dia <= antFin) mesAnt += d.total
  }
  const gananciaMes = ids.reduce((s, id) => { const r = datosDe(reps, id); return s + (r && r.mes ? r.mes.ganancia : 0) }, 0)
  const sinCostoMes = ids.some((id) => { const r = datosDe(reps, id); return r && r.mes && r.mes.sinCosto })
  const stockBajo = suma((d) => (d.stock ? (d.stock.negativos || 0) + (d.stock.bajoMinimo || 0) : 0))
  const negativos = suma((d) => (d.stock ? d.stock.negativos || 0 : 0))
  const porCobrar = suma((d) => (d.deuda ? d.deuda.total : 0))
  const cajas = filas.map((f) => ({ nombre: f.nombre, caja: (f.datos || {}).caja || {} }))
  const enCaja = cajas.reduce((s, x) => s + (x.caja.abierta ? x.caja.efectivoEsperado || 0 : 0), 0)
  const cajasAbiertas = cajas.filter((x) => x.caja.abierta)

  // Lo que conviene mirar ahora.
  const alertas = []
  const pedAnular = Object.values(anul).reduce((s, x) => s + ((x.datos || []).length), 0)
  if (pedAnular) alertas.push(['alerta', 'ventas', pedAnular + (pedAnular === 1 ? ' venta a cuenta para anular' : ' ventas a cuenta para anular'), 'La pidieron desde la caja', () => ir('avisos')])
  for (const id of ids) {
    const dd = datosDe(deudas, id)
    if (dd && (dd.vencido || dd.venceHoy)) alertas.push([dd.vencido ? 'mal' : 'alerta', 'apagar', (dd.vencido ? 'Pagos a proveedores vencidos: ' + plata(dd.vencido) : 'Hoy vence: ' + plata(dd.venceHoy)), nombreSucursal(id) + ' · A pagar', () => { cambiarSucursalSinPintar(id); ir('apagar') }])
  }
  for (const f of filas) {
    const d = f.datos || {}
    const atraso = Date.now() - new Date(f.actualizado).getTime()
    if (atraso > 10 * 60000) alertas.push(['mal', 'nube', 'La caja de ' + f.nombre + ' no se conecta', 'Última vez ' + hace(f.actualizado) + '. Los números pueden estar atrasados.', () => hojaConexion()])
    else if (d.caja && !d.caja.abierta) alertas.push(['alerta', 'caja', 'La caja de ' + f.nombre + ' está cerrada', 'Nadie abrió turno', () => { cambiarSucursalSinPintar(f.sucursal_id); ir('caja') }])
  }
  if (negativos) alertas.push(['alerta', 'faltantes', negativos + (negativos === 1 ? ' producto en negativo' : ' productos en negativo'), 'Se vendió más de lo que el sistema tenía', () => ir('faltantes')])
  const esperando = S.cola.length + S.esperando.size
  if (esperando) alertas.push(['info', 'nube', esperando + (esperando === 1 ? ' cambio en camino' : ' cambios en camino'), S.cola.length ? 'Se mandan cuando vuelva internet' : 'Esperando que la caja lo aplique', () => hojaConexion()])

  const accesos = el('div', { clase: 'accesos' }, accesosElegidos().map((k) => el('button', { clase: 'acceso', onclick: ACCESOS[k].fn }, el('span', { clase: 'ico' }, icono(ACCESOS[k].icono)), ACCESOS[k].nombre)))

  const masViejo = filas.map((f) => f.actualizado).sort()[0]
  pintarSeccion('inicio',
    el('button', { clase: 'buscar-falso', onclick: () => abrirBuscador() }, icono('buscar'), 'Buscar productos, clientes, ventas…',
      el('span', { clase: 'fin' }, el('span', { clase: 'btn-ico', estilo: { width: '30px', height: '30px', border: '0', background: 'none' }, onclick: (ev) => { ev.stopPropagation(); escanearYAbrir() } }, icono('escanear')))),
    S.sucursales.length > 1 ? el('div', { clase: 'seg', estilo: { marginBottom: '12px' } },
      el('button', { clase: todas ? '' : 'activo', onclick: () => { guardarLocal('bs.inicioTodas', false); render() } }, nombreSucursal(S.sucursal)),
      el('button', { clase: todas ? 'activo' : '', onclick: () => { guardarLocal('bs.inicioTodas', true); render() } }, 'Todas')) : null,
    el('div', { clase: 'kpis' },
      kpi('Ventas de hoy', plata(total), [ventas + (ventas === 1 ? ' venta · ' : ' ventas · '), delta(total, ayerAEstaHora || null, 'ayer a esta hora')], { clase: 'principal', alTocar: () => ir('ventas') }),
      kpi('Ventas del mes', plata(mes), delta(mes, mesAnt || null, 'mes pasado'), { alTocar: () => ir('reportes', { periodo: 'mes' }) }),
      kpi('Ganancia del mes', plata(gananciaMes), sinCostoMes ? 'estimada · hay días sin costo' : 'estimada, sobre el costo', { alTocar: () => ir('reportes', { periodo: 'mes' }) }),
      kpi('Productos vendidos', unidades(unid), 'unidades hoy', { alTocar: () => ir('reportes', { periodo: 'hoy' }) }),
      kpi('Ticket promedio', plata(ventas ? total / ventas : 0), delta(ventas ? total / ventas : 0, ayerVentas ? ayerTicket / ayerVentas : null, 'ayer'), { alTocar: () => ir('reportes', { periodo: 'hoy' }) }),
      kpi('Stock bajo', String(stockBajo), negativos ? negativos + ' en negativo' : 'bajo el mínimo', { clase: negativos ? 'mal' : stockBajo ? 'alerta' : '', alTocar: () => ir('faltantes') }),
      kpi('Por cobrar', plata(porCobrar), 'cuentas corrientes', { alTocar: () => ir('clientes') }),
      kpi('En la caja', cajasAbiertas.length ? plata(enCaja) : 'Cerrada', cajasAbiertas.length ? 'efectivo · turno de ' + cajasAbiertas.map((x) => x.caja.usuario).join(', ') : 'sin turno abierto', { clase: cajasAbiertas.length ? '' : 'alerta', alTocar: () => ir('caja') }),
      kpi('Gastos de hoy', plata(suma((d) => d.gastosDia)), 'pagados hoy', { alTocar: () => ir('gastos') })),
    alertas.length ? el('div', { clase: 'alertas' }, alertas.slice(0, 5).map(([tono, ic, titulo, sub, fn]) => el('div', { clase: 'alerta-fila ' + tono, onclick: fn },
      el('span', { clase: 'ico' }, icono(ic)), el('div', { clase: 'txt' }, el('b', {}, titulo), el('span', { clase: 'sub' }, sub)), icono('flecha')))) : null,
    el('div', { clase: 'tarjeta-cab' }, el('h3', { estilo: { margin: '4px 0' } }, 'Accesos rápidos'), el('button', { clase: 'btn chico', estilo: { border: 0, background: 'none', color: 'var(--acento)' }, onclick: () => hojaAccesos() }, 'Editar')),
    accesos,
    filas.length ? el('h3', {}, 'Hoy, hora por hora') : null,
    filas.map((f) => {
      const d = f.datos || {}
      const horas = (d.porHora || []).map((x, h) => ({ h, v: x[0], n: x[1] })).sort((a, b) => ordenHora(a.h) - ordenHora(b.h)).filter((x) => ordenHora(x.h) <= ahora)
      return el('div', { clase: 'tarjeta' },
        el('div', { clase: 'tarjeta-cab' }, el('h2', {}, f.nombre), el('span', { clase: 'sub' }, hace(f.actualizado))),
        horas.length && d.total ? barras(horas, (x) => String(x.h).padStart(2, '0') + ':00 · ' + plata(x.v) + ' · ' + x.n + ' ventas', (x) => (x.h % 3 === 0 ? String(x.h) : '')) : el('div', { clase: 'sub' }, 'Todavía no hay ventas hoy.'),
        (d.top || []).length ? el('div', { estilo: { marginTop: '12px' } }, el('div', { clase: 'sub', estilo: { marginBottom: '6px' } }, 'Lo más vendido hoy'),
          ranking(d.top.map((p) => ({ n: p.descripcion, texto: unidades(p.unidades) + ' u', v: p.unidades })))) : null)
    }),
    !filas.length ? el('div', { clase: 'tarjeta' }, vacio('Todavía no subió datos ninguna caja. En la caja: Configuración → Ver desde el celular.', 'nube')) : null,
    el('p', { clase: 'sub', estilo: { textAlign: 'center', marginTop: '14px' } }, masViejo ? 'Actualizado ' + hace(masViejo) : ''))
  S.reloj = setInterval(() => { if (!document.hidden && S.seccion === 'inicio' && !S.hojas.length) render() }, 60000)
}

function cambiarSucursalSinPintar (id) { S.sucursal = id; guardarLocal('bs.sucursal', id); pintarArriba() }

function hojaAccesos () {
  let elegidos = accesosElegidos()
  const zona = el('div', { clase: 'lista' })
  const pintar = () => {
    const todos = elegidos.concat(Object.keys(ACCESOS).filter((k) => !elegidos.includes(k)))
    poner(zona, todos.map((k) => {
      const esta = elegidos.includes(k)
      const i = elegidos.indexOf(k)
      return el('div', { clase: 'item' + (esta ? ' sel' : '') },
        el('button', { clase: 'marca-sel', estilo: { cursor: 'pointer', background: esta ? '' : 'none' }, 'aria-label': esta ? 'Sacar' : 'Agregar', onclick: () => { elegidos = esta ? elegidos.filter((x) => x !== k) : elegidos.concat([k]); pintar() } }, esta ? icono('ok') : null),
        el('span', { clase: 'ico', estilo: { color: 'var(--acento)' } }, icono(ACCESOS[k].icono)),
        el('div', { clase: 'cuerpo' }, el('b', {}, ACCESOS[k].nombre)),
        esta ? el('div', { clase: 'rapidas' },
          el('button', { clase: 'btn-ico', disabled: i === 0, 'aria-label': 'Subir', onclick: () => { if (i > 0) { elegidos.splice(i - 1, 0, elegidos.splice(i, 1)[0]); pintar() } } }, icono('subir')),
          el('button', { clase: 'btn-ico', 'aria-label': 'Bajar', onclick: () => { if (i < elegidos.length - 1) { elegidos.splice(i + 1, 0, elegidos.splice(i, 1)[0]); pintar() } } }, icono('bajar'))) : null)
    }))
  }
  pintar()
  abrirHoja({
    titulo: 'Accesos rápidos',
    cuerpo: el('div', {}, el('p', { clase: 'sub' }, 'Elegí cuáles ver en el inicio y en qué orden.'), zona),
    botones: [
      { texto: 'Volver a los de fábrica', alTocar: () => { elegidos = ACCESOS_DE_FABRICA.slice(); pintar() } },
      { texto: 'Guardar', primario: true, alTocar: () => { guardarLocal('bs.accesos', elegidos); cerrarHoja(); if (S.seccion === 'inicio') render() } }
    ]
  })
}

// --- BUSCADOR GLOBAL ------------------------------------------------------------------
//
// Productos, clientes, proveedores y ventas en un solo lugar. Adivina que se
// busca: un codigo de barras va directo al producto; "C1-000812" a la venta.

async function abrirBuscador (inicial) {
  if (document.querySelector('.busqueda-global')) return
  const input = el('input', { type: 'search', placeholder: 'Producto, código, cliente, proveedor o ticket…', autocomplete: 'off', enterkeyhint: 'search' })
  const res = el('div', { clase: 'res' })
  const cerrar = () => { caja.remove(); if (history.state && history.state.buscar) { S.ignorarPop++; history.back() } }
  const caja = el('div', { clase: 'busqueda-global', role: 'dialog', 'aria-label': 'Buscar' },
    el('div', { clase: 'cab' },
      el('div', { clase: 'buscador', estilo: { flex: '1', margin: 0 } }, icono('buscar'), input),
      el('button', { clase: 'btn-ico', 'aria-label': 'Escanear', onclick: () => { cerrar(); escanearYAbrir() } }, icono('escanear')),
      el('button', { clase: 'btn chico', estilo: { border: 0 }, onclick: cerrar }, 'Cerrar')),
    res)
  document.body.append(caja)
  history.pushState({ buscar: true }, '', location.hash)
  input.focus()
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrar() })
  poner(res, el('p', { clase: 'sub', estilo: { padding: '10px 2px' } }, 'Escribí para buscar en ' + nombreSucursal(S.sucursal) + '. Un código de barras te lleva directo al producto.'))
  let datos = null
  const cargar = async () => {
    if (datos) return datos
    const [cat, cli, prov, vh, va] = await Promise.all([
      leerCatalogo(S.sucursal).catch(() => []), leerDatos('clientes').catch(() => ({})), leerDatos('proveedores').catch(() => ({})),
      leerDatos('ventas_hoy').catch(() => ({})), leerDatos('ventas_ayer').catch(() => ({}))
    ])
    // El encargado no busca ventas ni proveedores (es plata del dueño).
    datos = { cat, cli: esEmpleado() ? [] : datosDe(cli) || [], prov: esEncargado() || esEmpleado() ? [] : datosDe(prov) || [], ventas: esEncargado() || esEmpleado() ? [] : (datosDe(vh) || []).concat(datosDe(va) || []) }
    return datos
  }
  let espera = null
  const buscar = async () => {
    const q = input.value.trim()
    if (!q) return
    const d = await cargar()
    const grupos = []
    const esCodigo = /^\d{6,14}$/.test(q)
    const esTicket = /^[a-z]{1,3}\d*-?\d{2,}$/i.test(q)
    if (esCodigo) {
      const p = d.cat.find((x) => (x.codigos || []).includes(q))
      if (p) grupos.push(['Producto con ese código', [itemProducto(p, () => { cerrar(); hojaProducto(p) })]])
      else grupos.push(['Ese código no está cargado', [el('button', { clase: 'item', onclick: () => { cerrar(); hojaNuevoProducto({ codigo: q }) } }, el('span', { clase: 'ico', estilo: { color: 'var(--acento)' } }, icono('sumar')), el('div', { clase: 'cuerpo' }, el('b', {}, 'Crear producto con el código ' + q)))]])
    }
    const ventas = d.ventas.filter((v) => esTicket ? sinTildes(v.n).indexOf(sinTildes(q)) >= 0 : coincide(v.n + ' ' + v.c, q)).slice(0, 5)
    if (ventas.length && esTicket) grupos.push(['Ventas', ventas.map((v) => itemVenta(v, () => { cerrar(); hojaVenta(v, S.sucursal) }))])
    const prods = d.cat.filter((p) => p.activo && coincide(p.descripcion + ' ' + (p.codigos || []).join(' ') + ' ' + p.proveedor + ' ' + p.rubro, q))
      .sort((a, b) => b.vendido30 - a.vendido30).slice(0, 8)
    if (prods.length && !esCodigo) grupos.push(['Productos', prods.map((p) => itemProducto(p, () => { cerrar(); hojaProducto(p) }))])
    const clis = d.cli.filter((c) => coincide(c.nombre + ' ' + c.telefono + ' ' + c.documento, q)).slice(0, 5)
    if (clis.length) grupos.push(['Clientes', clis.map((c) => itemCliente(c, () => { cerrar(); hojaCliente(c) }))])
    const provs = d.prov.filter((p) => coincide(p.nombre + ' ' + (p.telefono || '') + ' ' + (p.cuit || ''), q)).slice(0, 4)
    if (provs.length) grupos.push(['Proveedores', provs.map((p) => el('button', { clase: 'item', onclick: () => { cerrar(); hojaProveedor(p) } },
      el('div', { clase: 'cuerpo' }, el('b', {}, p.nombre), el('div', { clase: 'sub' }, (p.productos || 0) + ' productos' + (p.deuda ? ' · le debés ' + plata(p.deuda) : ''))), icono('flecha')))])
    if (ventas.length && !esTicket) grupos.push(['Ventas', ventas.map((v) => itemVenta(v, () => { cerrar(); hojaVenta(v, S.sucursal) }))])
    poner(res, grupos.length
      ? grupos.map(([t, items]) => [el('h3', {}, t), el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, items))])
      : vacio('No encontré nada con "' + q + '".', 'buscar',
        el('button', { clase: 'btn', onclick: () => { cerrar(); hojaNuevoProducto({ descripcion: q }) } }, icono('sumar'), 'Crear producto "' + q + '"')))
  }
  input.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(buscar, 120) })
  if (inicial) { input.value = inicial; buscar() }
}

// --- tema -------------------------------------------------------------------------

function aplicarTema () {
  const t = leerLocal('bs.tema', 'auto')
  if (t === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
}

seccion('inicio', { nombre: 'Inicio', icono: 'inicio', grupo: 'principal', fn: secInicio })

document.addEventListener('DOMContentLoaded', arrancar)
