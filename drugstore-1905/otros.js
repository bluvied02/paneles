'use strict'
// REPONER, FALTANTES, PROMOS, CIERRES, AVISOS, AJUSTES Y "MAS".

// --- REPONER (el pedido a cada proveedor, por WhatsApp) -----------------------------

async function secReponer () {
  if (!S.sucursal) return pintarSeccion('reponer', cabecera('Reponer'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'reponer')))
  const E = S.rep2 = Object.assign({ vista: 'pedido_hoy', busca: '', ajustes: {} }, S.rep2 || {})
  const datos = await leerDatos(E.vista)
  const p = datosDe(datos)
  const busca = el('input', { type: 'search', placeholder: 'Buscar un producto en el pedido…', valor: E.busca })
  const zona = el('div', {})
  const clave = (f) => S.sucursal + '|' + E.vista + '|' + f.productoId
  const cant = (f) => (E.ajustes[clave(f)] != null ? E.ajustes[clave(f)] : f.sugerido)
  const pintar = () => {
    limpiar(zona)
    const grupos = (p && p.grupos) || []
    let alguno = false
    for (const g of grupos) {
      const filas = g.filas.filter((f) => coincide(f.descripcion + ' ' + (f.codigo || ''), E.busca))
      if (!filas.length) continue
      alguno = true
      const texto = () => 'Pedido ' + S.negocio + ' (' + nombreSucursal(S.sucursal) + '):\n' + g.filas.filter((f) => cant(f) > 0).map((f) => unidades(cant(f)) + ' x ' + f.descripcion).join('\n')
      zona.append(el('div', { clase: 'tarjeta sin-relleno' },
        el('div', { clase: 'tarjeta-cab', estilo: { padding: '12px 16px 4px' } },
          el('div', {}, el('h2', { estilo: { margin: 0 } }, g.nombre), el('div', { clase: 'sub' }, g.filas.length + ' productos' + (g.telefono ? ' · ' + g.telefono : ' · sin teléfono'))),
          el('div', { clase: 'chips' },
            el('a', { clase: 'btn primario chico', href: '#', onclick: (ev) => { ev.preventDefault(); window.open(linkWhatsApp(g.telefono, texto()), '_blank') } }, icono('mensaje'), 'WhatsApp'),
            el('button', { clase: 'btn chico', onclick: async () => { try { await navigator.clipboard.writeText(texto()); toast('Pedido copiado', 'ok') } catch (e) { toast('No se pudo copiar', 'mal') } } }, 'Copiar'))),
        el('div', { clase: 'lista' }, filas.map((f) => {
          const inp = el('input', { type: 'text', inputmode: 'decimal', valor: unidades(cant(f)), estilo: { width: '76px', textAlign: 'right', minHeight: '40px', padding: '8px 10px' } })
          inp.addEventListener('input', () => { const n = aMilesimas(inp.value); if (Number.isFinite(n)) E.ajustes[clave(f)] = Math.max(0, n) })
          return el('div', { clase: 'item' },
            el('div', { clase: 'cuerpo' }, el('b', {}, f.descripcion), el('div', { clase: 'sub' }, 'hay ' + unidades(f.stock) + (f.vendido != null ? ' · vendido ' + unidades(f.vendido) : f.vendidas != null ? ' · vendido ' + unidades(f.vendidas) : '') + (f.estado === 'urgente' ? ' · urgente' : ''))),
            inp)
        }))))
    }
    if (!alguno) zona.append(el('div', { clase: 'tarjeta' }, vacio(!grupos.length ? (E.vista === 'pedido_hoy' ? 'Todavía no se vendió nada hoy.' : 'Nada para pedir.') : 'Nada coincide.', 'reponer')))
  }
  busca.addEventListener('input', () => { E.busca = busca.value; pintar() })
  pintar()
  pintarSeccion('reponer',
    cabecera('Reponer', nombreSucursal(S.sucursal) + ' · el pedido a cada proveedor'),
    el('div', { clase: 'seg ancho', estilo: { marginBottom: '10px' } }, [['pedido_hoy', 'Lo de hoy'], ['pedido_semana', 'La semana'], ['pedido_sugerido', 'Sugerido']].map(([id, t]) => el('button', { clase: E.vista === id ? 'activo' : '', onclick: () => { E.vista = id; render() } }, t))),
    el('p', { clase: 'sub' }, E.vista === 'pedido_sugerido' ? 'Lo que conviene pedir para llegar a la próxima visita del proveedor.' : 'Se repone lo mismo que se vendió. Cambiá las cantidades y mandalo por WhatsApp.'),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    zona)
}

// --- FALTANTES ------------------------------------------------------------------------

async function secFaltantes () {
  if (!S.sucursal) return pintarSeccion('faltantes', cabecera('Faltantes'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'faltantes')))
  const [datos, cat] = await Promise.all([leerDatos('faltantes'), leerCatalogo(S.sucursal).catch(() => [])])
  const lista = datosDe(datos) || []
  const busca = el('input', { type: 'search', placeholder: 'Buscar…' })
  const zona = el('div', { clase: 'lista' })
  const pintar = () => {
    const filas = lista.filter((p) => coincide(p.descripcion + ' ' + p.codigo + ' ' + p.proveedor + ' ' + p.familia, busca.value))
    poner(zona, filas.length ? filas.map((p) => {
      const completo = cat.find((x) => x.id === p.id) || Object.assign({ codigos: [p.codigo], precio: 0, activo: true }, p)
      return el('div', { clase: 'item tocable', onclick: () => hojaAjusteStock(completo) },
        el('div', { clase: 'cuerpo' }, el('b', {}, p.descripcion), el('div', { clase: 'sub' }, [p.proveedor || 'sin proveedor', p.vendido30 ? 'vendió ' + unidades(p.vendido30) + ' en 30 días' : ''].filter(Boolean).join(' · '))),
        el('div', { clase: 'fin' }, el('b', { clase: 'num ' + (p.stock < 0 ? 'rojo' : 'ambar') }, unidades(p.stock)), el('div', { clase: 'sub' }, p.minimo ? 'mínimo ' + unidades(p.minimo) : 'en negativo')))
    }) : vacio(lista.length ? 'Nada coincide.' : 'No falta nada: nada en negativo ni bajo el mínimo.', 'faltantes'))
  }
  busca.addEventListener('input', pintar)
  pintar()
  const negativos = lista.filter((p) => p.stock < 0).length
  pintarSeccion('faltantes',
    cabecera('Faltantes', nombreSucursal(S.sucursal) + ' · ' + negativos + ' en negativo · ' + (lista.length - negativos) + ' bajo el mínimo', el('button', { clase: 'btn', onclick: () => ir('reponer') }, icono('reponer'), 'Hacer pedido')),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    el('p', { clase: 'sub' }, 'Primero lo que está en negativo (se vendió más de lo que el sistema tenía). Tocá uno para corregir el stock.'),
    el('div', { clase: 'tarjeta sin-relleno' }, zona))
}

// --- PROMOS -----------------------------------------------------------------------------

async function secPromos () {
  if (!S.sucursal) return pintarSeccion('promos', cabecera('Promos'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'promos')))
  const lista = datosDe(await leerDatos('promos')) || []
  const estado = (p) => (!p.activa ? el('span', { clase: 'chip' }, 'Pausada') : p.vencida ? el('span', { clase: 'chip' }, 'Vencida') : p.vigenteAhora ? el('span', { clase: 'chip ok' }, '● Aplicándose') : el('span', { clase: 'chip alerta' }, 'Programada'))
  pintarSeccion('promos',
    cabecera('Promos', nombreSucursal(S.sucursal), el('button', { clase: 'btn primario', onclick: () => hojaPromo(S.sucursal) }, icono('sumar'), 'Nueva')),
    el('div', { clase: 'tarjeta sin-relleno' }, lista.length ? el('div', { clase: 'lista' }, lista.map((p) => el('div', { clase: 'item' },
      el('div', { clase: 'cuerpo' }, el('b', {}, p.nombre), el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, [p.etiqueta, p.tipo === 'combo' ? p.textoComponentes : p.textoAlcance, p.textoDisparador ? 'llevando ' + p.textoDisparador : '', p.textoVigencia].filter(Boolean).join(' · '))),
      el('div', { clase: 'fin' }, estado(p), el('div', { clase: 'chips', estilo: { marginTop: '6px', justifyContent: 'flex-end' } },
        el('button', { clase: 'btn chico', onclick: () => mandarOrden(S.sucursal, 'promo_estado', { promoId: p.id, activa: !p.activa }, { texto: (p.activa ? 'Pausar ' : 'Activar ') + p.nombre, alTerminar: refrescarSeccion }) }, p.activa ? 'Pausar' : 'Activar'),
        el('button', { clase: 'btn chico peligro', onclick: () => { if (confirm('¿Borrar "' + p.nombre + '"? Las ventas que ya la usaron no cambian.')) mandarOrden(S.sucursal, 'promo_borrar', { promoId: p.id }, { texto: 'Borrar ' + p.nombre, alTerminar: refrescarSeccion }) } }, 'Borrar')))))) : vacio('No hay promociones en esta sucursal.', 'promos')))
}

async function hojaPromo (sucursalId) {
  const [lista, rubrosD] = await Promise.all([leerCatalogo(sucursalId), leerDatos('rubros')])
  const rubros = datosDe(rubrosD, sucursalId) || []
  const ruta = (id) => { const x = []; let r = rubros.find((y) => y.id === id); let n = 0; while (r && n++ < 6) { x.unshift(r.nombre); r = rubros.find((y) => y.id === r.padreId) } return x.join(' › ') }
  const nombre = el('input', { type: 'text', placeholder: 'Ej: Finde bebidas 10%', maxlength: '60' })
  let tipo = 'porcentaje'
  let alcance = 'productos'
  const elegidos = []
  const rubrosElegidos = []
  const valor = el('input', { type: 'text', inputmode: 'decimal' })
  const lleva = el('input', { type: 'number', valor: '3', min: '2' })
  const paga = el('input', { type: 'number', valor: '2', min: '1' })
  const zonaValor = el('div', {})
  const segTipo = el('div', { clase: 'seg' })
  const pintarTipo = () => {
    poner(segTipo, [['porcentaje', '% off'], ['descuento', '$ menos'], ['precio', 'Precio fijo'], ['nxm', 'Lleva N paga M']].map(([id, t]) => el('button', { clase: tipo === id ? 'activo' : '', onclick: () => { tipo = id; pintarTipo() } }, t)))
    poner(zonaValor, tipo === 'nxm'
      ? el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Lleva', lleva), el('label', { clase: 'campo' }, 'Paga', paga))
      : el('label', { clase: 'campo' }, tipo === 'porcentaje' ? 'Descuento (%)' : tipo === 'precio' ? 'Precio fijo por unidad ($)' : 'Pesos menos por unidad ($)', valor))
  }
  pintarTipo()
  const busca = el('input', { type: 'search', placeholder: 'Buscar producto…' })
  const resultados = el('div', { clase: 'lista' })
  const chips = el('div', { clase: 'chips', estilo: { margin: '8px 0' } })
  const selRubro = selectorRubro(rubros, '')
  const zonaAlcance = el('div', {})
  const segAlcance = el('div', { clase: 'seg' })
  const pintarChips = () => {
    poner(chips, (alcance === 'productos' ? elegidos.map((p) => [p.id, p.descripcion]) : rubrosElegidos.map((id) => [id, ruta(id)])).map(([id, t]) =>
      el('span', { clase: 'chip info' }, t, el('button', { estilo: { background: 'none', border: 0, cursor: 'pointer', color: 'inherit', padding: 0 }, onclick: () => {
        const arr = alcance === 'productos' ? elegidos : rubrosElegidos
        const i = arr.findIndex((x) => (x.id || x) === id); if (i >= 0) arr.splice(i, 1); pintarChips()
      } }, '×'))))
  }
  const pintarAlcance = () => {
    poner(segAlcance, [['productos', 'Productos'], ['rubros', 'Familias']].map(([id, t]) => el('button', { clase: alcance === id ? 'activo' : '', onclick: () => { alcance = id; pintarAlcance() } }, t)))
    poner(zonaAlcance, alcance === 'productos' ? [el('div', { clase: 'buscador' }, icono('buscar'), busca), resultados] : [selRubro])
    pintarChips()
  }
  busca.addEventListener('input', () => {
    limpiar(resultados)
    if (busca.value.trim().length < 2) return
    for (const p of lista.filter((x) => x.activo !== false && coincide(x.descripcion + ' ' + (x.codigos || []).join(' '), busca.value)).slice(0, 8)) {
      resultados.append(el('button', { clase: 'item', onclick: () => { if (!elegidos.some((x) => x.id === p.id)) elegidos.push(p); busca.value = ''; limpiar(resultados); pintarChips() } },
        el('div', { clase: 'cuerpo' }, el('b', {}, p.descripcion)), el('span', { clase: 'num sub' }, plata(p.precio))))
    }
  })
  selRubro.addEventListener('change', () => { if (selRubro.value && !rubrosElegidos.includes(selRubro.value)) rubrosElegidos.push(selRubro.value); selRubro.value = ''; pintarChips() })
  pintarAlcance()
  const dias = new Set([0, 1, 2, 3, 4, 5, 6])
  const segDias = el('div', { clase: 'chips' })
  const pintarDias = () => { poner(segDias, [1, 2, 3, 4, 5, 6, 0].map((d) => el('button', { clase: 'filtro' + (dias.has(d) ? ' activo' : ''), onclick: () => { if (dias.has(d) && dias.size > 1) dias.delete(d); else dias.add(d); pintarDias() } }, DIAS[d]))) }
  pintarDias()
  abrirHoja({
    titulo: 'Promo nueva · ' + nombreSucursal(sucursalId),
    completa: true,
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Nombre (sale en el ticket)', nombre),
      el('div', { clase: 'campo' }, 'Qué descuento', segTipo), zonaValor,
      el('div', { clase: 'campo' }, 'A qué productos', segAlcance), zonaAlcance, chips,
      el('div', { clase: 'campo' }, 'Qué días', segDias),
      el('p', { clase: 'sub' }, 'Para combos y "llevando uno, descuento en otro", usá la pantalla Promos de la caja.')),
    botones: [{ texto: 'Crear promo', primario: true, alTocar: async () => {
      const promo = { nombre: nombre.value.trim(), tipo, alcance, productoIds: elegidos.map((p) => p.id), rubroIds: rubrosElegidos.slice(), dias: dias.size === 7 ? [] : [...dias], activa: true }
      if (!promo.nombre) return toast('Ponele un nombre', 'mal')
      if (tipo === 'nxm') { promo.lleva = Number(lleva.value); promo.paga = Number(paga.value) } else if (tipo === 'porcentaje') promo.valor = Math.round(Number(String(valor.value).replace(',', '.')) * 100)
      else promo.valor = aCentavos(valor.value)
      if (tipo !== 'nxm' && !(promo.valor > 0)) return toast('Completá el valor del descuento', 'mal')
      if (alcance === 'productos' ? !promo.productoIds.length : !promo.rubroIds.length) return toast('Elegí a qué productos se aplica', 'mal')
      cerrarHoja()
      await mandarOrden(sucursalId, 'promo_guardar', { promo }, { texto: 'Promo ' + promo.nombre, alTerminar: refrescarSeccion })
    } }]
  })
}

// --- CIERRES DE CAJA ----------------------------------------------------------------

async function secCierres () {
  const datos = await leerDatos('cierres')
  const E = S.cie = Object.assign({ filtro: '' }, S.cie || {})
  const todos = []
  for (const [id, f] of Object.entries(datos)) for (const c of f.datos || []) todos.push(Object.assign({ sucursal: S.sucursales.length > 1 ? f.nombre : '', sucursalId: id }, c))
  todos.sort((a, b) => String(b.cerradaEn).localeCompare(String(a.cerradaEn)))
  const lista = todos.filter((c) => !E.filtro || c.sucursalId === E.filtro)
  const conDif = lista.filter((c) => c.fueraDeTolerancia)
  const faltante = lista.filter((c) => c.diferencia < 0 && c.fueraDeTolerancia).reduce((s, c) => s + c.diferencia, 0)
  pintarSeccion('cierres',
    cabecera('Cierres de caja', 'Cada turno: lo que tendría que haber y lo que contaron'),
    S.sucursales.length > 1 ? el('div', { clase: 'filtros' },
      el('button', { clase: 'filtro' + (!E.filtro ? ' activo' : ''), onclick: () => { E.filtro = ''; render() } }, 'Todas'),
      S.sucursales.map((x) => el('button', { clase: 'filtro' + (E.filtro === x.id ? ' activo' : ''), onclick: () => { E.filtro = x.id; render() } }, x.nombre))) : null,
    el('div', { clase: 'kpis' },
      kpi('Cierres', String(lista.length), 'los últimos'),
      kpi('Con diferencia', String(conDif.length), conDif.length ? 'fuera de la tolerancia' : 'todos cerraron bien', { clase: conDif.length ? 'alerta' : '' }),
      kpi('Faltó en total', plata(Math.abs(faltante)), faltante ? 'en los cierres con diferencia' : 'nada', { clase: faltante ? 'mal' : '' })),
    el('div', { clase: 'tarjeta sin-relleno' }, lista.length ? el('div', { clase: 'lista' }, lista.map(itemCierre)) : vacio('Todavía no hay cierres subidos.', 'cierres')))
}

// --- AVISOS ---------------------------------------------------------------------------------

async function contarAvisos () {
  if (esEmpleado()) return
  try {
    const visto = leerLocal('bs.avisosVistos', '') || '1970-01-01'
    const { count } = await S.sb.from('pos_avisos').select('id', { count: 'exact', head: true }).gt('creado', visto)
    for (const i of document.querySelectorAll('[data-insignia]')) { i.textContent = count > 99 ? '99+' : String(count || ''); i.style.display = count ? '' : 'none' }
  } catch (e) { /* sin avisos */ }
}

async function secAvisos () {
  let data = []
  try {
    const r = await S.sb.from('pos_avisos').select('*').order('creado', { ascending: false }).limit(150)
    if (r.error) throw r.error
    data = r.data || []
    DB.set('avisos', data)
    red(true)
  } catch (err) {
    if (!esDeRed(err)) throw err
    red(false)
    data = (await DB.get('avisos')) || []
  }
  const anul = await leerDatos('anulaciones').catch(() => ({}))
  guardarLocal('bs.avisosVistos', new Date().toISOString())
  contarAvisos()
  const tono = { cierre: 'mal', anulacion: 'alerta', pedido_anulacion: 'alerta', personal: 'mal', caja: 'mal', pago: 'alerta', resumen: 'info', sistema: 'alerta' }
  const ico = { cierre: 'caja', anulacion: 'ventas', pedido_anulacion: 'ventas', personal: 'clientes', caja: 'caja', pago: 'apagar', resumen: 'reportes', sistema: 'nube' }
  const pedidos = []
  for (const [id, f] of Object.entries(anul)) for (const p of f.datos || []) pedidos.push(Object.assign({ sucursalId: id, sucursal: f.nombre }, p))
  const bloques = []
  let dia = ''
  let actual = null
  for (const a of data) {
    const d = isoLocal(new Date(a.creado))
    if (d !== dia) { dia = d; actual = el('div', { clase: 'lista' }); bloques.push(el('h3', {}, fechaCorta(d)), el('div', { clase: 'tarjeta sin-relleno' }, actual)) }
    actual.append(el('div', { clase: 'item' },
      el('span', { clase: 'chip ' + (tono[a.tipo] || 'info'), estilo: { padding: '6px' } }, icono(ico[a.tipo] || 'avisos')),
      el('div', { clase: 'cuerpo' }, el('b', { estilo: { whiteSpace: 'normal' } }, a.titulo), el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, (a.nombre || '') + ' · ' + hora(a.creado) + (a.texto ? ' · ' + a.texto : '')))))
  }
  pintarSeccion('avisos',
    cabecera('Avisos', 'Lo que pasó en los locales y te conviene saber'),
    await panelNotificaciones(),
    pedidos.length ? el('div', { clase: 'tarjeta' }, el('h2', {}, 'Ventas a cuenta para anular'),
      pedidos.map((p) => el('div', { clase: 'fila', estilo: { display: 'block' } },
        el('div', { estilo: { display: 'flex', justifyContent: 'space-between', gap: '8px' } },
          el('div', { clase: 'izq' }, el('b', {}, (p.cliente || 'Sin cliente') + ' · ' + plata(p.total)), el('div', { clase: 'sub' }, p.sucursal + ' · ' + p.numero + ' · pidió ' + p.usuario + ': ' + p.motivo)),
          el('div', { clase: 'chips' },
            el('button', { clase: 'btn chico peligro', onclick: () => { const m = prompt('Motivo de la anulación', p.motivo || ''); if (m) mandarOrden(p.sucursalId, 'anular_venta', { ventaId: p.ventaId, motivo: m }, { texto: 'Anular ' + p.numero, alTerminar: refrescarSeccion }) } }, 'Anular'),
            el('button', { clase: 'btn chico', onclick: () => mandarOrden(p.sucursalId, 'anulacion_rechazar', { ventaId: p.ventaId }, { texto: 'No anular ' + p.numero, alTerminar: refrescarSeccion }) }, 'No anular'))),
        el('div', { clase: 'sub' }, (p.items || []).map((it) => unidades(it.cantidad) + ' × ' + it.descripcion).join(' · '))))) : null,
    bloques.length ? bloques : el('div', { clase: 'tarjeta' }, vacio('Todavía no hubo avisos.', 'avisos')))
}

function urlBase64AUint8 (b64) {
  const relleno = '='.repeat((4 - b64.length % 4) % 4)
  const bin = atob((b64 + relleno).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...bin].map((c) => c.charCodeAt(0)))
}

async function panelNotificaciones () {
  const caja = el('div', { clase: 'tarjeta' }, el('h2', {}, 'Notificaciones en este ' + (/iphone|android/i.test(navigator.userAgent) ? 'celular' : 'dispositivo')))
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    caja.append(el('p', { clase: 'tenue' }, esIOS && !instalada
      ? 'En el iPhone, primero agregá esta página a la pantalla de inicio: Compartir → "Agregar a inicio". Después abrila desde el ícono y volvé acá.'
      : 'Este navegador no puede recibir notificaciones.'))
    return caja
  }
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 4000))])
  if (!reg) { caja.append(el('p', { clase: 'tenue' }, 'Las notificaciones no están disponibles ahora. Probá recargar la página.')); return caja }
  const actual = await reg.pushManager.getSubscription()
  const estado = el('p', { clase: 'tenue' })
  const boton = el('button', { clase: 'btn primario' })
  const pintar = (sub) => {
    estado.textContent = sub ? '✓ Te llegan: el resumen de ayer cada mañana, faltante al cerrar la caja, ventas anuladas (y si alguien anula muchas), empleado que no llegó, caja cerrada o sin conexión, pedidos de anulación y pagos a proveedores del día.' : 'Activalas para enterarte cuando pasa algo importante, aunque no tengas la app abierta.'
    boton.textContent = sub ? 'Desactivar' : 'Activar notificaciones'
    boton.className = 'btn' + (sub ? '' : ' primario')
  }
  pintar(actual)
  boton.addEventListener('click', async () => {
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await S.sb.from('pos_suscripciones').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
      pintar(null)
      return
    }
    const { data } = await S.sb.from('pos_datos').select('datos').eq('sucursal_id', '_').eq('clave', 'vapid_publica').maybeSingle()
    if (!data) return toast('Todavía no está listo: la caja tiene que conectarse una vez con la versión nueva.', 'mal', 6)
    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') return toast('Sin permiso para notificaciones. Se habilita en los ajustes del celular.', 'mal', 6)
    try {
      const nueva = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64AUint8(data.datos.publica) })
      const { error } = await S.sb.from('pos_suscripciones').upsert({ endpoint: nueva.endpoint, datos: nueva.toJSON(), email: S.email.toLowerCase() })
      if (error) throw error
      pintar(nueva)
      toast('Listo: las notificaciones llegan a este ' + (esIOS ? 'celular' : 'dispositivo'), 'ok')
    } catch (err) { toast('No se pudo activar: ' + err.message, 'mal', 6) }
  })
  caja.append(estado, boton)
  return caja
}

// --- AJUSTES --------------------------------------------------------------------------

function secAjustes () {
  const tema = leerLocal('bs.tema', 'auto')
  pintarSeccion('ajustes',
    cabecera('Ajustes', S.email),
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'fila' }, el('span', {}, 'Tema'), el('div', { clase: 'seg' }, [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([id, t]) => el('button', { clase: tema === id ? 'activo' : '', onclick: () => { guardarLocal('bs.tema', id); aplicarTema(); secAjustes() } }, t)))),
      el('div', { clase: 'fila' }, el('span', {}, 'Accesos rápidos del inicio'), el('button', { clase: 'btn chico', onclick: () => hojaAccesos() }, 'Editar')),
      S.sucursales.length > 1 ? el('div', { clase: 'fila' }, el('span', {}, 'Sucursal'), el('button', { clase: 'btn chico', onclick: () => hojaSucursales() }, nombreSucursal(S.sucursal))) : null,
      el('div', { clase: 'fila' }, el('span', {}, 'Conexión y cajas'), el('button', { clase: 'btn chico', onclick: () => hojaConexion() }, S.enLinea ? 'Conectado' : 'Sin conexión'))),
    el('div', { clase: 'tarjeta' },
      el('h2', {}, 'Usar como app'),
      el('p', { clase: 'tenue', estilo: { margin: 0 } }, /iphone|ipad/i.test(navigator.userAgent)
        ? 'En Safari: Compartir → "Agregar a inicio". Queda un ícono y se abre a pantalla completa, con la cámara y las notificaciones.'
        : 'En Chrome: menú ⋮ → "Instalar aplicación" o "Agregar a la pantalla principal".')),
    el('div', { clase: 'tarjeta' },
      el('button', { clase: 'btn peligro ancho', onclick: async () => { if (!confirm('¿Salir de la cuenta en este dispositivo?')) return; await S.sb.auth.signOut(); pantallaEntrar() } }, icono('salir'), 'Salir')))
}

// --- MAS (celular) ---------------------------------------------------------------------------

function secMas () {
  const ids = ['reportes', 'clientes', 'encargos', 'caja', 'gastos', 'contar', 'recibir', 'stock', 'pasar', 'proveedores', 'apagar', 'reponer', 'faltantes', 'promos', 'cierres', 'historial', 'avisos', 'ajustes']
  pintarSeccion('mas',
    cabecera('Más', S.negocio + (esEncargado() ? ' · encargado' : '')),
    el('div', { clase: 'mas-grilla' }, ids.filter((id) => SECCIONES[id] && seccionPermitida(id)).map((id) => el('button', { clase: 'acceso', onclick: () => ir(id) },
      el('span', { clase: 'ico' }, icono(SECCIONES[id].icono)), SECCIONES[id].nombre,
      id === 'avisos' ? el('span', { clase: 'insignia', 'data-insignia': '', estilo: { display: 'none' } }) : null))))
  contarAvisos()
}

seccion('reponer', { nombre: 'Reponer', icono: 'reponer', grupo: 'mercaderia', fn: secReponer })
seccion('faltantes', { nombre: 'Faltantes', icono: 'faltantes', grupo: 'mercaderia', fn: secFaltantes })
seccion('promos', { nombre: 'Promos', icono: 'promos', grupo: 'mercaderia', fn: secPromos })
seccion('cierres', { nombre: 'Cierres de caja', icono: 'cierres', grupo: 'control', fn: secCierres })
seccion('avisos', { nombre: 'Avisos', icono: 'avisos', grupo: 'control', fn: secAvisos })
seccion('ajustes', { nombre: 'Ajustes', icono: 'ajustes', grupo: 'control', fn: secAjustes })
seccion('mas', { nombre: 'Más', icono: 'mas', grupo: 'oculto', fn: secMas })
