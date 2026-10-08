'use strict'
// EL NEGOCIO: ventas, reportes, clientes, caja, gastos, proveedores, lo que se
// les debe y el historial de cambios.
//
// Todo sale de lo que sube la caja de cada sucursal (pos_datos). Lo que se
// cambia (un pago de un cliente, un gasto, anular una venta) es una orden que
// la caja aplica con sus reglas: una venta anulada devuelve el stock y, si fue
// a cuenta, baja la deuda del cliente; nada se borra, todo queda registrado.

const MEDIOS_VENTA = [['', 'Todas'], ['efectivo', 'Efectivo'], ['mercado_pago', 'Mercado Pago'], ['debito', 'Débito'], ['credito', 'Crédito'], ['transferencia', 'Transferencia'], ['qr', 'QR'], ['cuenta_corriente', 'A cuenta']]

// --- VENTAS (ticket por ticket) ------------------------------------------------

function itemVenta (v, alTocar, productoId) {
  const lineas = productoId ? v.i.filter((it) => it[3] === productoId) : null
  return el('div', { clase: 'item tocable' + (v.a ? ' inactivo' : ''), onclick: alTocar },
    el('div', { clase: 'cuerpo' },
      el('b', {}, hora(v.ts) + ' · ' + v.n, v.a ? el('span', { clase: 'chip mal', estilo: { marginLeft: '6px' } }, 'anulada') : null),
      el('div', { clase: 'sub' }, lineas
        ? lineas.map((it) => unidades(it[1]) + ' × ' + it[0]).join(' · ')
        : [v.u, v.m.map((m) => NOMBRE_MEDIO[m] || m).join(' + '), v.c].filter(Boolean).join(' · '))),
    el('div', { clase: 'fin' }, el('b', { clase: 'num' }, v.a ? el('s', {}, plata(v.t)) : plata(v.t)), el('div', { clase: 'sub' }, v.i.length + (v.i.length === 1 ? ' producto' : ' productos'))))
}

function hojaVenta (v, sucursalId) {
  const suc = sucursalId || S.sucursal
  abrirHoja({
    titulo: 'Venta ' + v.n,
    cuerpo: el('div', {},
      v.a ? el('div', { clase: 'aviso mal' }, el('b', {}, 'Anulada'), 'Motivo: ' + v.a) : null,
      el('div', { clase: 'sub' }, fechaHora(v.ts) + ' · vendió ' + (v.u || '—') + (v.c ? ' · cliente ' + v.c : '') + ' · ' + nombreSucursal(suc)),
      el('div', { clase: 'lista', estilo: { margin: '10px -16px' } }, v.i.map((it) => el('div', { clase: 'item', estilo: { minHeight: '46px' } },
        el('div', { clase: 'cuerpo' }, el('b', {}, it[0]), el('div', { clase: 'sub num' }, unidades(it[1]) + ' × ' + plata(it[1] ? Math.round(it[2] * 1000 / it[1]) : 0))),
        el('div', { clase: 'fin' }, el('b', { clase: 'num' }, plata(it[2])))))),
      v.r ? el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Recargo tarjeta'), el('b', { clase: 'num' }, plata(v.r))) : null,
      el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Cómo pagó'), el('b', {}, v.m.map((m) => NOMBRE_MEDIO[m] || m).join(' + '))),
      el('div', { clase: 'fila' }, el('b', {}, 'Total'), el('b', { clase: 'num', estilo: { fontSize: '22px' } }, plata(v.t)))),
    botones: v.a ? [] : [{ texto: 'Anular venta', peligro: true, alTocar: () => hojaAnularVenta(v, suc) }]
  })
}

function hojaAnularVenta (v, suc) {
  const motivo = el('input', { type: 'text', placeholder: 'Ej: se cobró dos veces, el cliente devolvió todo' })
  abrirHoja({
    titulo: 'Anular ' + v.n,
    cuerpo: el('div', {},
      el('div', { clase: 'aviso alerta' }, el('b', {}, 'No se borra: queda anulada con el motivo'), 'Los productos vuelven al stock' + (v.m.includes('cuenta_corriente') ? ' y baja la deuda del cliente' : '') + '. En la caja queda registrado quién la anuló.'),
      el('label', { clase: 'campo' }, 'Motivo', motivo)),
    botones: [{ texto: 'Anular', peligro: true, alTocar: async () => {
      if (!motivo.value.trim()) return toast('Poné el motivo', 'mal')
      cerrarHoja(2)
      await mandarOrden(suc, 'anular_venta', { ventaId: v.id, motivo: motivo.value.trim() }, { texto: 'Anular ' + v.n, alTerminar: refrescarSeccion })
    } }]
  })
}

// Las ventas de un dia: hoy y ayer las sube la caja siempre; de anteayer a
// hace 14 dias, una clave por dia ('ventas_dia:AAAA-MM-DD'); un dia mas viejo
// se le pide a la caja (tarda hasta un minuto). Devuelve { lista, actualizado }
// o { esperando } / { error }.
async function ventasDeUnDia (suc, dia, hoyCaja) {
  if (dia === hoyCaja || dia === sumarDias(hoyCaja, -1)) {
    const d = await leerDatos(dia === hoyCaja ? 'ventas_hoy' : 'ventas_ayer')
    const fila = d[suc] || {}
    return { lista: fila.datos || [], actualizado: fila.actualizado }
  }
  const d = await leerDatos('ventas_dia:' + dia).catch(() => ({}))
  if (d[suc]) return { lista: d[suc].datos || [], actualizado: d[suc].actualizado }
  // Mas viejo: se le pide a la caja (una vez por dia y sucursal).
  const k = suc + '|' + dia
  S.ventasPedidas = S.ventasPedidas || {}
  const p = S.ventasPedidas[k]
  if (p && p.lista) return { lista: p.lista }
  if (p && p.error) return { error: p.error }
  if (!p) {
    S.ventasPedidas[k] = { desde: Date.now() }
    mandarOrden(suc, 'ventas_dia', { dia }, {
      callado: true,
      silencioso: true,
      alTerminar: (r) => {
        const res = r.resultado || {}
        S.ventasPedidas[k] = r.estado === 'aplicada' && res.datos ? { lista: res.datos } : { error: res.error || 'La caja no pudo mandar las ventas' }
        if (S.seccion === 'ventas') render()
      }
    })
  }
  return { esperando: true, desde: S.ventasPedidas[k].desde }
}

async function secVentas () {
  if (!S.sucursal) return pintarSeccion('ventas', cabecera('Ventas'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'ventas')))
  const E = S.vent = Object.assign({ dia: 'hoy', busca: '', medio: '' }, S.vent || {})
  // El "hoy" de la caja (el dia de trabajo del local, que cambia a la hora de corte).
  const reps = await leerDatos('reportes').catch(() => ({}))
  const hoyCaja = ((datosDe(reps, S.sucursal) || {}).hoy || {}).desde || hoyISO()
  const ayerCaja = sumarDias(hoyCaja, -1)
  const dias = E.dia === 'hoy' ? [hoyCaja] : E.dia === 'ayer' ? [ayerCaja] : E.dia === '7dias' ? Array.from({ length: 7 }, (_, i) => sumarDias(hoyCaja, -i)) : [E.dia]
  const resultados = await Promise.all(dias.map((d) => ventasDeUnDia(S.sucursal, d, hoyCaja).then((r) => Object.assign({ dia: d }, r))))
  const lista = []
  for (const r of resultados) for (const v of r.lista || []) lista.push(Object.assign({ _dia: r.dia }, v))
  const esperando = resultados.filter((r) => r.esperando)
  const errores = resultados.filter((r) => r.error)
  const actualizado = resultados.map((r) => r.actualizado).filter(Boolean).sort().pop()
  const varios = dias.length > 1

  const validas = lista.filter((v) => !v.a)
  const total = validas.reduce((s, v) => s + v.t, 0)
  const busca = el('input', { type: 'search', placeholder: 'Ticket, producto, cliente o vendedor…', valor: E.busca })
  const zona = el('div', {})
  const cuenta = el('span', { clase: 'sub' })
  let limite = 120
  const pintar = () => {
    const filas = lista.filter((v) => (!E.medio || v.m.includes(E.medio)) && (!E.busca || coincide(v.n + ' ' + v.u + ' ' + v.c + ' ' + v.i.map((it) => it[0]).join(' '), E.busca)))
    const mostradas = filas.slice(0, limite)
    const bloques = []
    if (varios) {
      // Separadas por dia, con lo vendido de cada uno.
      for (const d of dias) {
        const delDia = mostradas.filter((v) => v._dia === d)
        if (!delDia.length) continue
        const vend = filas.filter((v) => v._dia === d && !v.a)
        bloques.push(el('div', { clase: 'tarjeta-cab', estilo: { marginTop: '10px' } }, el('b', {}, fechaCorta(d)), el('span', { clase: 'sub' }, plata(vend.reduce((s, v) => s + v.t, 0)) + ' · ' + vend.length + ' ventas')),
          el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, delDia.map((v) => itemVenta(v, () => hojaVenta(v))))))
      }
    } else if (mostradas.length) {
      bloques.push(el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, mostradas.map((v) => itemVenta(v, () => hojaVenta(v))))))
    }
    if (!bloques.length && !esperando.length) bloques.push(el('div', { clase: 'tarjeta' }, vacio(lista.length ? 'Ninguna venta coincide.' : 'No hay ventas ' + (E.dia === 'hoy' ? 'hoy' : E.dia === 'ayer' ? 'ayer' : varios ? 'en estos días' : 'el ' + fechaCorta(E.dia)) + '.', 'ventas')))
    if (filas.length > limite) bloques.push(el('button', { clase: 'btn ancho', estilo: { margin: '8px 0' }, onclick: () => { limite += 200; pintar() } }, 'Ver más'))
    poner(zona, bloques)
    cuenta.textContent = filas.length + (filas.length === 1 ? ' venta' : ' ventas') + (E.medio || E.busca ? ' · ' + plata(filas.filter((v) => !v.a).reduce((s, v) => s + v.t, 0)) : '')
  }
  const filtros = el('div', { clase: 'filtros' })
  const pintarFiltros = () => poner(filtros, MEDIOS_VENTA.filter(([id]) => !id || lista.some((v) => v.m.includes(id))).map(([id, t]) => el('button', { clase: 'filtro' + (E.medio === id ? ' activo' : ''), onclick: () => { E.medio = id; pintarFiltros(); pintar() } }, t)))
  busca.addEventListener('input', () => { E.busca = busca.value; limite = 120; pintar() })
  pintarFiltros()
  pintar()

  const unDia = /^\d{4}-\d{2}-\d{2}$/.test(E.dia)
  const elegir = el('input', { type: 'date', max: hoyCaja, valor: unDia ? E.dia : '', title: 'Elegir un día', estilo: { maxWidth: '150px' } })
  elegir.addEventListener('change', () => { if (elegir.value) { E.dia = elegir.value === hoyCaja ? 'hoy' : elegir.value === ayerCaja ? 'ayer' : elegir.value; render() } })
  const titulo = E.dia === 'hoy' ? 'hoy' : E.dia === 'ayer' ? 'ayer' : varios ? 'los últimos 7 días' : 'el ' + fechaCorta(E.dia)
  pintarSeccion('ventas',
    cabecera('Ventas', nombreSucursal(S.sucursal) + ' · ' + titulo + (actualizado ? ' · actualizado ' + hace(actualizado) : ''),
      el('button', { clase: 'btn', onclick: () => ir('reportes') }, icono('reportes'), 'Reportes')),
    el('div', { clase: 'fila', estilo: { gap: '8px', marginBottom: '12px', flexWrap: 'wrap' } },
      el('div', { clase: 'seg' },
        el('button', { clase: E.dia === 'hoy' ? 'activo' : '', onclick: () => { E.dia = 'hoy'; render() } }, 'Hoy'),
        el('button', { clase: E.dia === 'ayer' ? 'activo' : '', onclick: () => { E.dia = 'ayer'; render() } }, 'Ayer'),
        el('button', { clase: E.dia === '7dias' ? 'activo' : '', onclick: () => { E.dia = '7dias'; render() } }, '7 días')),
      elegir),
    esperando.length ? el('div', { clase: 'aviso' }, el('b', {}, 'Pidiéndole las ventas a la caja…'), 'Ese día es de hace más de dos semanas: la caja lo manda en menos de un minuto (tiene que estar prendida).') : null,
    errores.length ? el('div', { clase: 'aviso mal' }, el('b', {}, 'No se pudieron traer'), errores.map((r) => r.error).join(' · ')) : null,
    el('div', { clase: 'kpis' },
      kpi('Vendido', plata(total), validas.length + ' ventas', { clase: 'principal' }),
      kpi('Ticket promedio', plata(validas.length ? total / validas.length : 0)),
      kpi('Anuladas', String(lista.length - validas.length), lista.length - validas.length ? plata(lista.filter((v) => v.a).reduce((s, v) => s + v.t, 0)) : 'ninguna')),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    filtros,
    el('div', { clase: 'tarjeta-cab' }, cuenta),
    zona)
}

// --- REPORTES ------------------------------------------------------------------

const PERIODOS_REPORTE = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', '7 días'], ['mes', 'Este mes'], ['mesPasado', 'Mes pasado'], ['30', '30 días'], ['anio', 'Este año'], ['elegir', 'Elegir día y hora']]

// Junta los reportes de varias sucursales (por nombre de producto, familia...).
function juntarReportes (lista) {
  if (lista.length === 1) return lista[0]
  const r = { total: 0, ventas: 0, unidades: 0, ganancia: 0, sinCosto: 0, anuladas: 0, anterior: { total: 0, ventas: 0, ganancia: 0 }, productos: [], familias: [], medios: [], vendedores: [], horas: Array.from({ length: 24 }, () => [0, 0]), porDia: [] }
  const mapa = (arr, clave, campos) => {
    const m = {}
    for (const x of arr) { const k = x[clave]; const y = m[k] || (m[k] = Object.assign({}, x, Object.fromEntries(campos.map((c) => [c, 0])))); for (const c of campos) y[c] += x[c] || 0 }
    return Object.values(m)
  }
  const dias = {}
  for (const x of lista) {
    for (const k of ['total', 'ventas', 'unidades', 'ganancia', 'sinCosto', 'anuladas']) r[k] += x[k] || 0
    for (const k of ['total', 'ventas', 'ganancia']) r.anterior[k] += (x.anterior || {})[k] || 0
    r.productos.push(...x.productos); r.familias.push(...x.familias); r.medios.push(...x.medios); r.vendedores.push(...x.vendedores)
    x.horas.forEach((h, i) => { r.horas[i][0] += h[0]; r.horas[i][1] += h[1] })
    for (const [d, i, n] of x.porDia || []) { const y = dias[d] || (dias[d] = [d, 0, 0]); y[1] += i; y[2] += n }
    r.desde = x.desde; r.hasta = x.hasta; r.franja = x.franja || null; r.anterior.desde = (x.anterior || {}).desde; r.anterior.hasta = (x.anterior || {}).hasta
  }
  r.productos = mapa(r.productos, 'd', ['u', 'i', 'g']).sort((a, b) => b.i - a.i)
  r.familias = mapa(r.familias, 'n', ['u', 'i', 'g']).sort((a, b) => b.i - a.i)
  r.medios = mapa(r.medios, 'medio', ['i']).sort((a, b) => b.i - a.i)
  r.vendedores = mapa(r.vendedores, 'n', ['i', 'v']).sort((a, b) => b.i - a.i)
  r.porDia = Object.values(dias).sort((a, b) => a[0].localeCompare(b[0]))
  r.ticketPromedio = r.ventas ? Math.round(r.total / r.ventas) : 0
  r.anterior.ticketPromedio = r.anterior.ventas ? Math.round(r.anterior.total / r.anterior.ventas) : 0
  return r
}

async function secReportes (params) {
  const E = S.rep = Object.assign({ periodo: 'hoy', todas: false, ver: 'importe' }, S.rep || {}, params.periodo ? { periodo: params.periodo } : {})
  const ids = E.todas && S.sucursales.length > 1 ? S.sucursales.map((x) => x.id) : [S.sucursal]
  const segPeriodo = el('div', { clase: 'filtros' }, PERIODOS_REPORTE.map(([id, t]) => el('button', { clase: 'filtro' + (E.periodo === id ? ' activo' : ''), onclick: () => { E.periodo = id; render() } }, t)))
  const segSuc = S.sucursales.length > 1 ? el('div', { clase: 'seg', estilo: { marginBottom: '10px' } },
    el('button', { clase: E.todas ? '' : 'activo', onclick: () => { E.todas = false; render() } }, nombreSucursal(S.sucursal)),
    el('button', { clase: E.todas ? 'activo' : '', onclick: () => { E.todas = true; render() } }, 'Todas')) : null

  // 30 dias y el año salen del dia por dia (tambien el de Gestion Comercio).
  if (E.periodo === '30' || E.periodo === 'anio') return reporteHistorial(E, ids, segPeriodo, segSuc)

  // Un dia y horario elegidos: se le pide a la caja y se muestra igual que los demas.
  let formElegir = null
  let lista
  if (E.periodo === 'elegir') {
    formElegir = formularioReporte(E, ids)
    const p = E.pedido
    const listo = p && p.clave === ids.join(',') && p.resultados.length + p.errores.length === ids.length
    if (!listo || !p.resultados.length) {
      return pintarSeccion('reportes', cabecera('Reportes', 'El día y el horario que quieras'), segSuc, segPeriodo, formElegir,
        p && p.clave === ids.join(',') ? estadoPedidoReporte(p) : null)
    }
    lista = p.resultados
  }
  const reps = E.periodo === 'elegir' ? {} : await leerDatos('reportes')
  if (!lista) lista = ids.map((id) => { const d = datosDe(reps, id); return d && d[E.periodo] }).filter(Boolean)
  if (!lista.length) {
    return pintarSeccion('reportes', cabecera('Reportes'), segSuc, segPeriodo,
      el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió reportes. Aparecen unos minutos después de actualizar la caja a la versión 0.11.', 'reportes')))
  }
  const r = juntarReportes(lista)
  let ant = r.anterior || {}
  let contraQue = 'período anterior'
  // Hoy contra ayer hasta esta misma hora (contra el dia entero siempre da menos).
  if (E.periodo === 'hoy') {
    const ayer = juntarReportes(ids.map((id) => { const d = datosDe(reps, id); return d && d.ayer }).filter(Boolean))
    if (ayer && ayer.horas) {
      const ahora = ordenHora(new Date().getHours())
      const hasta = ayer.horas.filter((h, i) => ordenHora(i) <= ahora)
      const total = hasta.reduce((a, h) => a + h[0], 0)
      const ventas = hasta.reduce((a, h) => a + h[1], 0)
      ant = { total, ventas, ticketPromedio: ventas ? Math.round(total / ventas) : 0 }
      contraQue = 'ayer a esta hora'
    }
  }
  const armado = ids.map((id) => (datosDe(reps, id) || {}).armado).filter(Boolean).sort()[0]
  const unDia = r.desde === r.hasta
  const horas = r.horas.map((h, i) => ({ h: i, v: h[0], n: h[1] })).sort((a, b) => ordenHora(a.h) - ordenHora(b.h))
  const mejorHora = horas.reduce((a, b) => (b.v > (a ? a.v : 0) ? b : a), null)
  const dias = (r.porDia || []).map(([d, v, n]) => ({ d, v, n }))
  const porImporte = E.ver === 'importe'
  const prods = r.productos.slice().sort((a, b) => porImporte ? b.i - a.i : b.u - a.u).slice(0, 15)
  const totalMedios = r.medios.reduce((s, m) => s + m.i, 0)

  pintarSeccion('reportes',
    cabecera('Reportes', (unDia ? fechaCorta(r.desde) : fechaCorta(r.desde) + ' al ' + fechaCorta(r.hasta)) + (r.franja ? ' · de ' + r.franja + ' h' : '') + ' · ' + (E.todas ? 'todas las sucursales' : nombreSucursal(S.sucursal)) + (armado ? ' · armado ' + hace(armado) : '')),
    segSuc, segPeriodo, formElegir,
    E.periodo === 'elegir' && E.pedido && E.pedido.errores.length ? estadoPedidoReporte(E.pedido) : null,
    el('div', { clase: 'kpis' },
      kpi('Facturación', plata(r.total), delta(r.total, ant.total, contraQue), { clase: 'principal' }),
      kpi('Ventas', String(r.ventas), delta(r.ventas, ant.ventas)),
      kpi('Ticket promedio', plata(r.ticketPromedio), delta(r.ticketPromedio, ant.ticketPromedio)),
      kpi('Unidades vendidas', unidades(r.unidades), r.anuladas ? r.anuladas + (r.anuladas === 1 ? ' anulada (no suma)' : ' anuladas (no suman)') : 'sin anuladas'),
      kpi('Ganancia', plata(r.ganancia), r.sinCosto ? 'hay ventas sin costo cargado' : (r.total ? pct(r.margenBasis) + ' sobre el costo' : ''))),
    !unDia && dias.length > 1 ? el('div', { clase: 'tarjeta' }, el('h2', {}, 'Día por día'),
      barras(dias, (x) => fechaCorta(x.d) + ' · ' + plata(x.v) + ' · ' + x.n + ' ventas', (x, i) => (dias.length <= 10 || i % Math.ceil(dias.length / 8) === 0 ? x.d.slice(8, 10) : ''))) : null,
    el('div', { clase: 'grilla' },
      el('div', { clase: 'tarjeta' }, el('h2', {}, 'Horarios de mayor venta'),
        r.total ? barras(horas, (x) => String(x.h).padStart(2, '0') + ':00 · ' + plata(x.v) + ' · ' + x.n + ' ventas', (x) => (x.h % 3 === 0 ? String(x.h) : '')) : el('div', { clase: 'sub' }, 'Sin ventas.'),
        mejorHora && mejorHora.v ? el('div', { clase: 'sub', estilo: { marginTop: '8px' } }, 'La mejor hora: ' + String(mejorHora.h).padStart(2, '0') + ' a ' + String((mejorHora.h + 1) % 24).padStart(2, '0') + ' h · ' + plata(mejorHora.v)) : null),
      el('div', { clase: 'tarjeta' }, el('h2', {}, 'Cómo pagaron'),
        r.medios.length ? ranking(r.medios.map((m) => ({ n: m.n || NOMBRE_MEDIO[m.medio] || m.medio, texto: plata(m.i) + ' · ' + (totalMedios ? Math.round(m.i * 100 / totalMedios) : 0) + '%', v: m.i }))) : el('div', { clase: 'sub' }, 'Sin ventas.'))),
    el('div', { clase: 'tarjeta', estilo: { marginTop: '12px' } },
      el('div', { clase: 'tarjeta-cab' }, el('h2', {}, 'Lo más vendido'),
        el('div', { clase: 'seg' }, el('button', { clase: porImporte ? 'activo' : '', onclick: () => { E.ver = 'importe'; render() } }, 'Por $'), el('button', { clase: porImporte ? '' : 'activo', onclick: () => { E.ver = 'unidades'; render() } }, 'Por unidades'))),
      prods.length ? ranking(prods.map((p) => ({ n: p.d, texto: porImporte ? plata(p.i) : unidades(p.u) + ' u', sub: (porImporte ? unidades(p.u) + ' u' : plata(p.i)) + (p.f ? ' · ' + p.f : ''), v: porImporte ? p.i : p.u }))) : el('div', { clase: 'sub' }, 'Sin ventas.')),
    el('div', { clase: 'grilla' },
      el('div', { clase: 'tarjeta' }, el('h2', {}, 'Familias'),
        r.familias.length ? ranking(r.familias.slice(0, 10).map((f) => ({ n: f.n, texto: plata(f.i), sub: unidades(f.u) + ' u' + (r.total ? ' · ' + Math.round(f.i * 100 / r.total) + '%' : ''), v: f.i }))) : el('div', { clase: 'sub' }, 'Sin ventas.')),
      el('div', { clase: 'tarjeta' }, el('h2', {}, 'Vendedores'),
        r.vendedores.length ? ranking(r.vendedores.map((v) => ({ n: v.n, texto: plata(v.i), sub: v.v ? v.v + ' ventas · ticket ' + plata(v.i / v.v) : '', v: v.i }))) : el('div', { clase: 'sub' }, 'Sin ventas.'))),
    r.historial ? el('p', { clase: 'sub', estilo: { marginTop: '10px' } }, 'Incluye ventas de Gestión Comercio del ' + fechaCorta(r.historial.desde) + ' al ' + fechaCorta(r.historial.hasta) + '.') : null)
}

// Elegir los dias y el horario. Los dias son los del local: "sabado de 22 a
// 02" incluye la madrugada del domingo.
function formularioReporte (E, ids) {
  const f = E.elegido = Object.assign({ desde: sumarDias(hoyISO(), -1), hasta: '', todoElDia: true, horaDesde: '20:00', horaHasta: '00:00' }, E.elegido || {})
  const desde = el('input', { type: 'date', valor: f.desde, max: hoyISO() })
  const hasta = el('input', { type: 'date', valor: f.hasta || f.desde, max: hoyISO() })
  const hDesde = el('input', { type: 'time', valor: f.horaDesde })
  const hHasta = el('input', { type: 'time', valor: f.horaHasta })
  const todo = el('input', { type: 'checkbox', checked: f.todoElDia })
  const horas = el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Desde las', hDesde), el('label', { clase: 'campo' }, 'Hasta las', hHasta))
  const pintarHoras = () => { horas.style.display = todo.checked ? 'none' : '' }
  todo.addEventListener('change', pintarHoras)
  desde.addEventListener('change', () => { if (!hasta.value || hasta.value < desde.value) hasta.value = desde.value })
  pintarHoras()
  const pedido = E.pedido && E.pedido.clave === ids.join(',') ? E.pedido : null
  const esperando = pedido && pedido.resultados.length + pedido.errores.length < ids.length
  return el('div', { clase: 'tarjeta' },
    el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Día', desde), el('label', { clase: 'campo' }, 'Hasta el día', hasta)),
    el('label', { estilo: { display: 'flex', alignItems: 'center', gap: '10px', margin: '6px 0 10px' } }, todo, 'Todo el día'),
    horas,
    el('button', { clase: 'btn primario ancho', disabled: !!esperando, onclick: () => {
      if (!desde.value) return toast('Elegí el día', 'mal')
      const h = hasta.value || desde.value
      if (h < desde.value) return toast('El "hasta" tiene que ser después del "desde"', 'mal')
      if (!todo.checked && hDesde.value === hHasta.value) return toast('El horario tiene que empezar y terminar a distinta hora', 'mal')
      Object.assign(f, { desde: desde.value, hasta: h, todoElDia: todo.checked, horaDesde: hDesde.value, horaHasta: hHasta.value })
      pedirReporte(E, ids, { desde: desde.value, hasta: h, horaDesde: todo.checked ? null : hDesde.value, horaHasta: todo.checked ? null : hHasta.value })
    } }, esperando ? 'Armando el reporte…' : 'Ver el reporte'),
    el('p', { clase: 'sub', estilo: { marginTop: '8px' } }, 'Lo arma la caja de cada sucursal con todas sus ventas: tarda hasta un minuto y la caja tiene que estar prendida. El horario cruza la medianoche si hace falta (de 22 a 02).'))
}

function pedirReporte (E, ids, datos) {
  const p = E.pedido = { clave: ids.join(','), datos, resultados: [], errores: [], desde: Date.now() }
  for (const id of ids) {
    mandarOrden(id, 'reporte', datos, {
      callado: true,
      silencioso: true,
      alTerminar: (r) => {
        if (E.pedido !== p) return
        const res = r.resultado || {}
        if (r.estado === 'aplicada' && res.datos) p.resultados.push(res.datos)
        else p.errores.push(nombreSucursal(id) + ': ' + (res.error || 'no se pudo'))
        if (S.seccion === 'reportes') render()
      }
    })
  }
  render()
}

function estadoPedidoReporte (p) {
  const faltan = p.resultados.length + p.errores.length < p.clave.split(',').length
  if (faltan) {
    const seg = Math.round((Date.now() - p.desde) / 1000)
    return el('div', { clase: 'aviso' + (seg > 120 ? ' mal' : '') }, el('b', {}, 'Pidiéndole el reporte a la caja…'),
      seg > 120 ? 'Ya pasaron más de 2 minutos: fijate que la caja esté prendida y con internet. Llega solo cuando se conecte.' : 'Tarda hasta un minuto.')
  }
  return p.errores.length ? el('div', { clase: 'aviso mal' }, el('b', {}, 'No se pudo armar'), p.errores.join(' · ')) : null
}

async function reporteHistorial (E, ids, segPeriodo, segSuc) {
  const hist = await leerDatos('historial')
  const hoy = hoyISO()
  const r = E.periodo === '30' ? { desde: sumarDias(hoy, -29), hasta: hoy } : { desde: hoy.slice(0, 4) + '-01-01', hasta: hoy }
  let largo = 0
  for (let d = r.desde; d <= r.hasta && largo < 400; d = sumarDias(d, 1)) largo++
  const ant = { desde: sumarDias(r.desde, -largo), hasta: sumarDias(r.desde, -1) }
  const anioAntes = (d) => (Number(d.slice(0, 4)) - 1) + d.slice(4)
  const sumar = (rango) => {
    const x = { total: 0, ventas: 0, costo: 0, sinCosto: false }
    for (const id of ids) for (const d of datosDe(hist, id) || []) {
      if (d.dia < rango.desde || d.dia > rango.hasta) continue
      x.total += d.total; x.ventas += d.ventas; x.costo += d.costo || 0
      if (d.gc) x.sinCosto = true
    }
    return x
  }
  const act = sumar(r)
  const previo = sumar(ant)
  const pasado = sumar({ desde: anioAntes(r.desde), hasta: anioAntes(r.hasta) })
  const dias = {}
  for (const id of ids) for (const d of datosDe(hist, id) || []) if (d.dia >= r.desde && d.dia <= r.hasta) { const y = dias[d.dia] || (dias[d.dia] = { d: d.dia, v: 0, n: 0 }); y.v += d.total; y.n += d.ventas }
  const lista = []
  for (let d = r.desde, n = 0; d <= r.hasta && n < 400; d = sumarDias(d, 1), n++) lista.push(dias[d] || { d, v: 0, n: 0 })
  const mejor = lista.reduce((a, b) => (b.v > (a ? a.v : 0) ? b : a), null)
  pintarSeccion('reportes',
    cabecera('Reportes', fechaCorta(r.desde) + ' al ' + fechaCorta(r.hasta) + ' · ' + (E.todas ? 'todas las sucursales' : nombreSucursal(S.sucursal))),
    segSuc, segPeriodo,
    el('div', { clase: 'kpis' },
      kpi('Facturación', plata(act.total), delta(act.total, previo.total, 'período anterior'), { clase: 'principal' }),
      kpi('Ventas', String(act.ventas), delta(act.ventas, previo.ventas)),
      kpi('Ticket promedio', plata(act.ventas ? act.total / act.ventas : 0), delta(act.ventas ? act.total / act.ventas : 0, previo.ventas ? previo.total / previo.ventas : null)),
      pasado.total ? kpi('El año pasado', plata(pasado.total), delta(act.total, pasado.total, 'mismo período')) : null,
      act.sinCosto ? null : kpi('Ganancia bruta', plata(act.total - act.costo), 'vendido menos lo que costaba')),
    el('div', { clase: 'tarjeta' }, el('h2', {}, 'Día por día'),
      barras(lista, (x) => fechaCorta(x.d) + ' · ' + plata(x.v) + ' · ' + x.n + ' ventas', (x, i) => (lista.length <= 10 || i % Math.ceil(lista.length / 8) === 0 ? x.d.slice(8, 10) + '/' + x.d.slice(5, 7) : '')),
      mejor && mejor.v ? el('div', { clase: 'sub', estilo: { marginTop: '8px' } }, 'Mejor día: ' + fechaCorta(mejor.d) + ' · ' + plata(mejor.v)) : null),
    el('p', { clase: 'sub' }, 'Para ver lo más vendido, las familias y los horarios, elegí Hoy, Ayer, 7 días, Este mes o Mes pasado.'))
}

// --- CLIENTES Y CUENTA CORRIENTE -------------------------------------------------

function itemCliente (c, alTocar) {
  return el('div', { clase: 'item tocable' + (c.activo === false ? ' inactivo' : ''), onclick: alTocar },
    el('div', { clase: 'cuerpo' }, el('b', {}, c.nombre),
      el('div', { clase: 'sub' }, [c.telefono, c.ultimaCompra ? 'compró ' + hace(c.ultimaCompra) : 'sin compras a cuenta'].filter(Boolean).join(' · '))),
    el('div', { clase: 'fin' },
      el('b', { clase: 'num ' + (c.saldo > 0 ? 'rojo' : c.saldo < 0 ? 'verde' : '') }, c.saldo < 0 ? plata(-c.saldo) + ' a favor' : plata(c.saldo)),
      c.limite && c.saldo > c.limite ? el('div', { clase: 'sub rojo' }, 'pasó el límite') : el('div', { clase: 'sub' }, c.saldo > 0 ? 'debe' : 'al día')))
}

async function secClientes () {
  if (!S.sucursal) return pintarSeccion('clientes', cabecera('Clientes'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'clientes')))
  const datos = await leerDatos('clientes')
  const lista = datosDe(datos) || []
  const E = S.cli = Object.assign({ busca: '', filtro: 'deben' }, S.cli || {})
  const deben = lista.filter((c) => c.saldo > 0)
  const total = deben.reduce((s, c) => s + c.saldo, 0)
  const busca = el('input', { type: 'search', placeholder: 'Nombre, teléfono o DNI…', valor: E.busca })
  const zona = el('div', { clase: 'lista' })
  const filtros = el('div', { clase: 'filtros' })
  const pintar = () => {
    const filas = lista.filter((c) => (E.filtro === 'deben' ? c.saldo > 0 : E.filtro === 'limite' ? c.limite && c.saldo > c.limite : c.activo !== false) && (!E.busca || coincide(c.nombre + ' ' + c.telefono + ' ' + c.documento, E.busca)))
    poner(zona, filas.length ? filas.map((c) => itemCliente(c, () => hojaCliente(c))) : vacio(lista.length ? (E.filtro === 'deben' && !E.busca ? 'Nadie debe nada.' : 'Nadie coincide.') : 'Todavía no hay clientes con cuenta corriente.', 'clientes',
      el('button', { clase: 'btn primario', onclick: () => hojaClienteEditar(null, E.busca) }, icono('sumar'), 'Nuevo cliente')))
  }
  const pintarFiltros = () => poner(filtros, [['deben', 'Deben', deben.length], ['todos', 'Todos', lista.filter((c) => c.activo !== false).length], ['limite', 'Pasaron el límite', lista.filter((c) => c.limite && c.saldo > c.limite).length]]
    .map(([id, t, n]) => el('button', { clase: 'filtro' + (E.filtro === id ? ' activo' : ''), onclick: () => { E.filtro = id; pintarFiltros(); pintar() } }, t, el('span', { clase: 'n' }, String(n)))))
  busca.addEventListener('input', () => { E.busca = busca.value; if (E.busca && E.filtro === 'deben') { E.filtro = 'todos'; pintarFiltros() } pintar() })
  pintarFiltros()
  pintar()
  pintarSeccion('clientes',
    cabecera('Clientes', nombreSucursal(S.sucursal) + ' · cuentas corrientes', el('button', { clase: 'btn primario', onclick: () => hojaClienteEditar(null) }, icono('sumar'), 'Nuevo')),
    el('div', { clase: 'kpis' },
      kpi('Te deben', plata(total), deben.length + (deben.length === 1 ? ' cliente' : ' clientes'), { clase: 'principal' }),
      kpi('Clientes', String(lista.filter((c) => c.activo !== false).length), 'con cuenta')),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    filtros,
    el('div', { clase: 'tarjeta sin-relleno' }, zona))
}

const linkWhatsApp = (tel, texto) => {
  const t = String(tel || '').replace(/[^0-9]/g, '')
  const num = t ? (t.length === 10 ? '549' + t : t.replace(/^0/, '549')) : ''
  return 'https://wa.me/' + num + (texto ? '?text=' + encodeURIComponent(texto) : '')
}

function hojaCliente (c) {
  const suc = S.sucursal
  const disponible = c.limite ? c.limite - c.saldo : null
  const recordatorio = 'Hola ' + c.nombre.split(' ')[0] + ', te escribimos de ' + S.negocio + '. Tu saldo de cuenta corriente es de ' + plata(c.saldo) + '. ¡Gracias!'
  abrirHoja({
    titulo: c.nombre,
    completa: true,
    cuerpo: el('div', {},
      el('div', { clase: 'contador' },
        el('div', { clase: 'sub' }, c.saldo < 0 ? 'Tiene a favor' : 'Saldo'),
        el('div', { clase: 'v ' + (c.saldo > 0 ? 'rojo' : c.saldo < 0 ? 'verde' : '') }, plata(Math.abs(c.saldo))),
        c.limite ? el('div', { clase: 'sub' }, 'Límite ' + plata(c.limite) + ' · ' + (disponible >= 0 ? 'le quedan ' + plata(disponible) : 'pasado por ' + plata(-disponible))) : null),
      el('div', { clase: 'acciones-grandes' },
        el('button', { clase: 'btn primario grande', onclick: () => hojaPagoCliente(c, suc) }, icono('gastos'), 'Registrar pago'),
        el('button', { clase: 'btn grande', onclick: () => hojaDeudaCliente(c, suc) }, icono('sumar'), 'Nueva deuda')),
      el('div', { clase: 'dato-grande' },
        el('div', {}, el('div', { clase: 'r' }, 'Compró a cuenta'), el('div', { clase: 'v' }, plata(c.comprado))),
        el('div', {}, el('div', { clase: 'r' }, 'Última compra'), el('div', { clase: 'v', estilo: { fontSize: '14px' } }, c.ultimaCompra ? fechaCorta(isoLocal(new Date(c.ultimaCompra))) : '—')),
        el('div', {}, el('div', { clase: 'r' }, 'Último pago'), el('div', { clase: 'v', estilo: { fontSize: '14px' } }, c.ultimoPago ? fechaCorta(isoLocal(new Date(c.ultimoPago))) : '—'))),
      el('div', { clase: 'lista', estilo: { margin: '0 -16px' } },
        c.telefono ? el('a', { clase: 'item', href: 'tel:' + c.telefono }, icono('telefono'), el('div', { clase: 'cuerpo' }, el('b', {}, c.telefono), el('div', { clase: 'sub' }, 'Llamar')), icono('flecha')) : null,
        c.telefono ? el('a', { clase: 'item', href: linkWhatsApp(c.telefono, c.saldo > 0 ? recordatorio : ''), target: '_blank', rel: 'noreferrer' }, icono('mensaje'), el('div', { clase: 'cuerpo' }, el('b', {}, 'WhatsApp'), el('div', { clase: 'sub' }, c.saldo > 0 ? 'Con un recordatorio del saldo' : 'Mandar un mensaje')), icono('flecha')) : null,
        c.documento ? el('div', { clase: 'item' }, el('div', { clase: 'cuerpo' }, el('b', {}, c.documento), el('div', { clase: 'sub' }, 'DNI / CUIT'))) : null,
        c.nota ? el('div', { clase: 'item' }, el('div', { clase: 'cuerpo' }, el('b', { estilo: { whiteSpace: 'normal' } }, c.nota), el('div', { clase: 'sub' }, 'Nota / dirección'))) : null,
        el('button', { clase: 'item', onclick: () => hojaClienteEditar(c) }, icono('editar'), el('div', { clase: 'cuerpo' }, el('b', {}, 'Editar datos')), icono('flecha'))),
      el('h3', {}, 'Movimientos'),
      c.movimientos.length ? el('div', { clase: 'lista', estilo: { margin: '0 -16px' } }, c.movimientos.map((m) => el('div', { clase: 'item' + (m.anulada ? ' inactivo' : '') },
        el('div', { clase: 'cuerpo' },
          el('b', {}, m.nombreTipo + (m.numero ? ' · ' + m.numero : '') + (m.anulada ? ' (anulada)' : '')),
          el('div', { clase: 'sub' }, fechaHora(m.ts) + [m.medio, m.motivo, m.usuario].filter(Boolean).map((x) => ' · ' + x).join('')),
          m.items && m.items.length ? el('div', { clase: 'sub' }, m.items.map((it) => unidades(it[1]) + ' × ' + it[0]).join(' · ')) : null),
        el('div', { clase: 'fin' }, el('b', { clase: 'num ' + (m.importe < 0 ? 'verde' : '') }, (m.importe < 0 ? '−' : '+') + plata(Math.abs(m.importe)).replace('−', '')), el('div', { clase: 'sub num' }, 'saldo ' + plata(m.saldo)))))) : vacio('Sin movimientos todavía.'))
  })
}

function hojaPagoCliente (c, suc) {
  const importe = el('input', { type: 'text', inputmode: 'decimal', clase: 'plata-grande', valor: c.saldo > 0 ? plataExacta(c.saldo) : '' })
  const medio = el('select', {},
    el('option', { valor: 'efectivo' }, 'Efectivo (me lo dio a mí)'),
    el('option', { valor: 'transferencia' }, 'Transferencia'),
    el('option', { valor: 'mercado_pago' }, 'Mercado Pago'),
    el('option', { valor: 'debito' }, 'Débito'))
  const nota = el('input', { type: 'text', placeholder: 'Opcional' })
  abrirHoja({
    titulo: 'Pago de ' + c.nombre,
    cuerpo: el('div', {},
      el('div', { clase: 'sub', estilo: { marginBottom: '8px' } }, 'Debe ' + plata(c.saldo)),
      el('label', { clase: 'campo' }, 'Cuánto paga ($)', importe),
      el('label', { clase: 'campo' }, 'Cómo', medio),
      el('label', { clase: 'campo' }, 'Observación', nota),
      el('p', { clase: 'sub' }, 'Queda registrado desde el celular, a tu nombre. No entra al cajón del local: si el cliente paga en el mostrador, lo carga el cajero.')),
    botones: [{ texto: 'Registrar pago', primario: true, alTocar: async () => {
      const n = aCentavos(importe.value)
      if (!Number.isFinite(n) || n <= 0) return toast('Escribí cuánto paga', 'mal')
      const aFavor = n > Math.max(c.saldo, 0)
      if (aFavor && !confirm('Paga ' + plata(n) + ' y debe ' + plata(Math.max(c.saldo, 0)) + '. ¿Le queda ' + plata(n - Math.max(c.saldo, 0)) + ' a favor?')) return
      cerrarHoja(2)
      await mandarOrden(suc, 'cliente_pago', { clienteId: c.id, importe: n, medio: medio.value, nota: nota.value.trim(), aFavor }, { texto: 'Pago de ' + c.nombre, alTerminar: refrescarSeccion })
    } }]
  })
}

function hojaDeudaCliente (c, suc) {
  const importe = el('input', { type: 'text', inputmode: 'decimal', clase: 'plata-grande' })
  const motivo = el('input', { type: 'text', placeholder: 'Ej: fiado, 2 cocas y un paquete de galletitas' })
  abrirHoja({
    titulo: 'Nueva deuda · ' + c.nombre,
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Importe ($)', importe),
      el('label', { clase: 'campo' }, 'Motivo', motivo),
      el('p', { clase: 'sub' }, 'Se suma a su saldo como ajuste, con el motivo y tu nombre. Las compras en el local se anotan solas al cobrar con Cuenta corriente.')),
    botones: [{ texto: 'Cargar deuda', primario: true, alTocar: async () => {
      const n = aCentavos(importe.value)
      if (!Number.isFinite(n) || n <= 0) return toast('Escribí el importe', 'mal')
      if (!motivo.value.trim()) return toast('Poné el motivo', 'mal')
      cerrarHoja(2)
      await mandarOrden(suc, 'cliente_deuda', { clienteId: c.id, importe: n, motivo: motivo.value.trim() }, { texto: 'Deuda de ' + c.nombre, alTerminar: refrescarSeccion })
    } }]
  })
}

function hojaClienteEditar (c, nombreInicial) {
  const suc = S.sucursal
  const nombre = el('input', { type: 'text', valor: c ? c.nombre : (nombreInicial || ''), autocapitalize: 'words' })
  const tel = el('input', { type: 'tel', valor: c ? c.telefono : '', placeholder: 'Ej: 351 555 1234' })
  const doc = el('input', { type: 'text', inputmode: 'numeric', valor: c ? c.documento : '', placeholder: 'Opcional' })
  const nota = el('input', { type: 'text', valor: c ? c.nota : '', placeholder: 'Dirección, referencia… (opcional)' })
  const limite = el('input', { type: 'text', inputmode: 'decimal', valor: c && c.limite ? plataExacta(c.limite) : '', placeholder: 'Sin límite' })
  const inicial = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Si ya debía algo (del cuaderno)' })
  abrirHoja({
    titulo: c ? 'Editar cliente' : 'Cliente nuevo',
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Nombre y apellido', nombre),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Teléfono', tel), el('label', { clase: 'campo' }, 'DNI / CUIT', doc)),
      el('label', { clase: 'campo' }, 'Dirección o nota', nota),
      el('label', { clase: 'campo' }, 'Límite de deuda ($)', limite),
      c ? null : el('label', { clase: 'campo' }, 'Deuda de antes ($)', inicial)),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      if (!nombre.value.trim()) return toast('Falta el nombre', 'mal')
      const lim = limite.value.trim() ? aCentavos(limite.value) : 0
      if (!Number.isFinite(lim) || lim < 0) return toast('El límite no es válido', 'mal')
      const ini = inicial.value.trim() ? aCentavos(inicial.value) : 0
      if (!Number.isFinite(ini)) return toast('La deuda de antes no es válida', 'mal')
      const cliente = { id: c ? c.id : undefined, nombre: nombre.value.trim(), telefono: tel.value.trim(), documento: doc.value.trim(), nota: nota.value.trim(), limite: lim, saldoInicial: c ? undefined : ini }
      cerrarHoja(c ? 2 : 1)
      await mandarOrden(suc, 'cliente_guardar', { cliente }, { texto: 'Cliente ' + cliente.nombre, alTerminar: refrescarSeccion })
    } }]
  })
}

// --- CAJA ------------------------------------------------------------------------

async function secCaja () {
  if (!S.sucursal) return pintarSeccion('caja', cabecera('Caja'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'caja')))
  const [actual, cierresD] = await Promise.all([leerDatos('caja_actual').catch(() => ({})), leerDatos('cierres').catch(() => ({}))])
  const c = datosDe(actual)
  const cierres = datosDe(cierresD) || []
  const movs = (c && c.movimientos) || []
  const turno = !c
    ? el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió el turno. Aparece después de actualizarla a la versión 0.11.', 'caja'))
    : !c.abierta
      ? el('div', { clase: 'tarjeta' }, vacio('No hay turno abierto en ' + nombreSucursal(S.sucursal) + (c.ultimoCierre ? '. El último cierre fue ' + hace(c.ultimoCierre) + '.' : '.'), 'caja'))
      : el('div', {},
        el('div', { clase: 'aviso info' }, el('b', {}, 'Turno de ' + (c.usuario || '—') + ' · caja ' + (c.terminal || '')), 'Abierto ' + fechaHora(c.abiertaEn) + (c.turno ? ' · ' + c.turno : '')),
        el('div', { clase: 'kpis' },
          kpi('En el cajón', plata(c.esperado), 'efectivo que tendría que haber', { clase: 'principal' }),
          kpi('Vendido en el turno', plata(c.ventaTotal), c.tickets + ' ventas'),
          kpi('Fondo inicial', plata(c.fondoFijo)),
          kpi('Salió de la caja', plata((c.gastos || 0) + (c.retiros || 0)), 'gastos ' + plata(c.gastos) + ' · retiros ' + plata(c.retiros))),
        el('div', { clase: 'grilla' },
          el('div', { clase: 'tarjeta' }, el('h2', {}, 'Por forma de pago'),
            c.porMedio.length ? ranking(c.porMedio.map((m) => ({ n: m.nombre, texto: plata(m.importe), v: m.importe }))) : el('div', { clase: 'sub' }, 'Sin ventas todavía.')),
          el('div', { clase: 'tarjeta sin-relleno' }, el('h2', {}, 'Movimientos de caja'),
            movs.length ? el('div', { clase: 'lista' }, movs.map((m) => el('div', { clase: 'item' },
              el('div', { clase: 'cuerpo' }, el('b', {}, m.texto || m.tipo), el('div', { clase: 'sub' }, hora(m.ts) + ' · ' + ({ gasto: 'Gasto', retiro: 'Retiro', cobranza: 'Cobro de cuenta' }[m.tipo] || m.tipo) + (m.usuario ? ' · ' + m.usuario : '') + (m.categoria ? ' · ' + m.categoria : ''))),
              el('div', { clase: 'fin' }, el('b', { clase: 'num ' + (m.importe < 0 ? 'rojo' : 'verde') }, (m.importe < 0 ? '−' : '+') + plata(Math.abs(m.importe)).replace('−', '')))))) : el('p', { clase: 'sub', estilo: { padding: '0 16px' } }, 'Sin gastos, retiros ni cobros en este turno.'))))
  pintarSeccion('caja',
    cabecera('Caja', nombreSucursal(S.sucursal)),
    // Si la compu no anda, el dueño deja vender desde el celular aunque nadie haya abierto el turno.
    el('button', { clase: 'btn ancho', estilo: { marginBottom: '10px' }, onclick: async () => {
      if (!confirm('¿Poner el modo emergencia en ' + nombreSucursal(S.sucursal) + '?\n\nDurante 8 horas los empleados con usuario del celular pueden vender y contar aunque no tengan el turno abierto en la compu. Las ventas entran a la caja cuando vuelva a andar.')) return
      await mandarOrden(S.sucursal, 'modo_emergencia', { horas: 8 }, { texto: 'Modo emergencia' })
    } }, icono('faltantes'), 'La compu no anda: modo emergencia'),
    turno,
    el('p', { clase: 'sub' }, 'Los gastos y retiros de la caja se cargan en el local, donde está la plata. El que está en el mostrador no ve estos totales (caja ciega).'),
    el('div', { clase: 'tarjeta-cab', estilo: { marginTop: '16px' } }, el('h2', {}, 'Cierres anteriores'), el('button', { clase: 'btn chico', onclick: () => ir('cierres') }, 'Ver todos')),
    el('div', { clase: 'tarjeta sin-relleno' }, cierres.length ? el('div', { clase: 'lista' }, cierres.slice(0, 8).map(itemCierre)) : vacio('Todavía no hay cierres.')))
}

function itemCierre (c) {
  const chip = typeof c.diferencia !== 'number' ? el('span', { clase: 'chip' }, 'sin contar')
    : !c.fueraDeTolerancia ? el('span', { clase: 'chip ok' }, '✓ Bien' + (c.diferencia ? ' (' + (c.diferencia > 0 ? '+' : '−') + plata(Math.abs(c.diferencia)).replace('−', '') + ')' : ''))
      : el('span', { clase: 'chip ' + (c.diferencia < 0 ? 'mal' : 'alerta') }, (c.diferencia < 0 ? '▼ Faltó ' : '▲ Sobró ') + plata(Math.abs(c.diferencia)).replace('−', ''))
  return el('div', { clase: 'item tocable', onclick: () => abrirHoja({
    titulo: 'Cierre · ' + fechaCorta(c.dia) + ' · ' + (c.usuario || '—'),
    cuerpo: el('div', {},
      el('div', { clase: 'sub' }, 'Caja ' + (c.terminal || '') + ' · ' + hora(c.abiertaEn) + ' a ' + hora(c.cerradaEn) + ' · ' + c.tickets + ' ventas'),
      el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Vendido en el turno'), el('b', { clase: 'num' }, plata(c.ventaTotal))),
      el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Tendría que haber'), el('b', { clase: 'num' }, plata(c.esperado))),
      el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Contaron'), el('b', { clase: 'num' }, c.contado == null ? '—' : plata(c.contado))),
      el('div', { clase: 'fila' }, el('b', {}, 'Diferencia'), chip),
      el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Fondo con que arrancó'), el('b', { clase: 'num' }, plata(c.fondoFijo))),
      c.diferenciaFondo ? el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Contra lo que dejó el turno anterior'), el('b', { clase: 'num ' + (c.diferenciaFondo < 0 ? 'rojo' : 'ambar') }, (c.diferenciaFondo < 0 ? 'faltaban ' : 'sobraban ') + plata(Math.abs(c.diferenciaFondo)))) : null,
      (c.controles || []).length ? el('h3', {}, 'Controles a mitad de turno') : null,
      (c.controles || []).map((x) => el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, hora(x.ts) + (x.tarde ? ' (tarde)' : '')), el('b', { clase: 'num ' + (!x.diferencia || !x.fuera ? 'verde' : x.diferencia < 0 ? 'rojo' : 'ambar') }, !x.diferencia ? 'OK' : (x.diferencia < 0 ? 'faltaban ' : 'sobraban ') + plata(Math.abs(x.diferencia))))),
      c.fondoSiguiente != null ? el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Dejó para el próximo turno'), el('b', { clase: 'num' }, plata(c.fondoSiguiente))) : null,
      c.entregado != null ? el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Entregó'), el('b', { clase: 'num' }, plata(c.entregado))) : null,
      c.gastos ? el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Gastos de caja'), el('b', { clase: 'num' }, plata(c.gastos))) : null,
      c.retiros ? el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Retiros'), el('b', { clase: 'num' }, plata(c.retiros))) : null,
      (c.porMedio || []).length ? el('h3', {}, 'Por forma de pago') : null,
      (c.porMedio || []).map((m) => el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, m.nombre), el('b', { clase: 'num' }, plata(m.importe)))))
  }) },
  el('div', { clase: 'cuerpo' }, el('b', {}, fechaCorta(c.dia) + ' · ' + (c.usuario || '—')), el('div', { clase: 'sub' }, (c.sucursal ? c.sucursal + ' · ' : '') + hora(c.abiertaEn) + ' a ' + hora(c.cerradaEn) + ' · ' + plata(c.ventaTotal))),
  el('div', { clase: 'fin' }, chip))
}

// --- GASTOS ----------------------------------------------------------------------

async function secGastos () {
  if (!S.sucursal) return pintarSeccion('gastos', cabecera('Gastos'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'gastos')))
  const d = datosDe(await leerDatos('gastos'))
  if (!d) return pintarSeccion('gastos', cabecera('Gastos', nombreSucursal(S.sucursal)), el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió los gastos. Aparecen después de actualizarla a la versión 0.11.', 'gastos')))
  const pendientes = (d.fijos || []).filter((f) => f.estado !== 'pagado')
  pintarSeccion('gastos',
    cabecera('Gastos', nombreSucursal(S.sucursal) + ' · ' + d.mes, el('button', { clase: 'btn primario', onclick: () => hojaGasto(d) }, icono('sumar'), 'Cargar gasto')),
    el('div', { clase: 'kpis' },
      kpi('Gastos del mes', plata(d.total), delta(d.total, d.totalAnterior || null, 'mes pasado', true), { clase: 'principal' }),
      kpi('Hoy', plata(d.hoy)),
      kpi('Fijos por pagar', String(pendientes.length), pendientes.length ? pendientes.map((f) => f.nombre).slice(0, 2).join(', ') : 'todos pagados', { clase: pendientes.some((f) => f.estado === 'vencido') ? 'mal' : '' })),
    el('div', { clase: 'grilla' },
      el('div', { clase: 'tarjeta' }, el('h2', {}, 'Por categoría'),
        d.porCategoria.length ? ranking(d.porCategoria.map((c) => ({ n: c.categoria, texto: plata(c.importe), sub: c.gastos + (c.gastos === 1 ? ' gasto' : ' gastos'), v: c.importe }))) : el('div', { clase: 'sub' }, 'Sin gastos este mes.')),
      pendientes.length || (d.fijos || []).length ? el('div', { clase: 'tarjeta' }, el('h2', {}, 'Gastos fijos del mes'),
        d.fijos.map((f) => el('div', { clase: 'fila' }, el('div', { clase: 'izq' }, el('b', {}, f.nombre), el('div', { clase: 'sub' }, f.estado === 'pagado' ? 'Pagado · ' + plata(f.pagado) : (f.estado === 'vencido' ? 'Venció el ' : 'Vence el ') + fechaCorta(f.vence) + (f.importe ? ' · ' + plata(f.importe) : ''))),
          el('span', { clase: 'chip ' + (f.estado === 'pagado' ? 'ok' : f.estado === 'vencido' ? 'mal' : 'alerta') }, f.estado === 'pagado' ? 'Pagado' : f.estado === 'vencido' ? 'Vencido' : 'Pendiente')))) : null),
    el('h3', {}, 'Los gastos del mes'),
    el('div', { clase: 'tarjeta sin-relleno' }, d.lista.length ? el('div', { clase: 'lista' }, d.lista.map((g) => el('div', { clase: 'item' + (g.anulado ? ' inactivo' : '') },
      el('div', { clase: 'cuerpo' }, el('b', {}, g.detalle), el('div', { clase: 'sub' }, fechaCorta(g.fecha) + ' · ' + g.categoria + ' · ' + g.medio + (g.usuario ? ' · ' + g.usuario : ''))),
      el('div', { clase: 'fin' }, el('b', { clase: 'num' }, g.anulado ? el('s', {}, plata(g.importe)) : plata(g.importe)))))) : vacio('Todavía no hay gastos este mes.', 'gastos')))
}

function hojaGasto (d) {
  const suc = S.sucursal
  let categoria = ''
  const cats = el('div', { clase: 'chips' })
  const pintarCats = () => poner(cats, (d.categorias || []).map((c) => el('button', { clase: 'filtro' + (categoria === c ? ' activo' : ''), onclick: () => { categoria = c; pintarCats() } }, c)))
  pintarCats()
  const importe = el('input', { type: 'text', inputmode: 'decimal', clase: 'plata-grande' })
  const detalle = el('input', { type: 'text', placeholder: 'Ej: factura de luz, flete Don Mario' })
  const medio = el('select', {}, (d.medios || []).map((m) => el('option', { valor: m.id }, m.nombre)))
  const fecha = el('input', { type: 'date', valor: hoyISO(), max: hoyISO() })
  const comp = el('input', { type: 'text', placeholder: 'Opcional' })
  abrirHoja({
    titulo: 'Cargar gasto',
    completa: true,
    cuerpo: el('div', {},
      el('div', { clase: 'campo' }, 'Categoría', cats),
      el('label', { clase: 'campo' }, 'Importe ($)', importe),
      el('label', { clase: 'campo' }, 'Detalle', detalle),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Cómo se pagó', medio), el('label', { clase: 'campo' }, 'Fecha', fecha)),
      el('label', { clase: 'campo' }, 'Comprobante', comp),
      el('p', { clase: 'sub' }, 'Lo pagado con el efectivo del cajón se carga en el local (así el cierre cierra). Acá van los gastos pagados por fuera: transferencia, Mercado Pago, tarjeta o efectivo propio.')),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      if (!categoria) return toast('Elegí la categoría', 'mal')
      const n = aCentavos(importe.value)
      if (!Number.isFinite(n) || n <= 0) return toast('Escribí el importe', 'mal')
      cerrarHoja()
      await mandarOrden(suc, 'gasto', { categoria, importe: n, detalle: detalle.value.trim(), medio: medio.value, fecha: fecha.value, comprobante: comp.value.trim() }, { texto: 'Gasto: ' + (detalle.value.trim() || categoria), alTerminar: refrescarSeccion })
    } }]
  })
}

// --- PROVEEDORES Y A PAGAR ---------------------------------------------------------

async function secProveedores () {
  if (!S.sucursal) return pintarSeccion('proveedores', cabecera('Proveedores'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'proveedores')))
  const lista = datosDe(await leerDatos('proveedores')) || []
  const busca = el('input', { type: 'search', placeholder: 'Buscar proveedor…' })
  const zona = el('div', { clase: 'lista' })
  const pintar = () => {
    const filas = lista.filter((p) => !busca.value || coincide(p.nombre + ' ' + (p.telefono || '') + ' ' + (p.cuit || ''), busca.value))
    poner(zona, filas.length ? filas.map((p) => el('div', { clase: 'item tocable', onclick: () => hojaProveedor(p) },
      el('div', { clase: 'cuerpo' }, el('b', {}, p.nombre), el('div', { clase: 'sub' }, [(p.productos || 0) + ' productos', p.telefono, p.ultimaCompra ? 'compra ' + hace(p.ultimaCompra) : ''].filter(Boolean).join(' · '))),
      el('div', { clase: 'fin' }, p.deuda ? el('b', { clase: 'num ' + (p.vencido ? 'rojo' : '') }, plata(p.deuda)) : el('span', { clase: 'sub' }, 'no le debés'), p.deuda ? el('div', { clase: 'sub' }, p.vencido ? 'vencido ' + plata(p.vencido) : 'próximo ' + fechaCorta(p.proximoPago)) : null)))
      : vacio(lista.length ? 'Nadie coincide.' : 'Todavía no hay proveedores.', 'proveedores', el('button', { clase: 'btn primario', onclick: () => hojaProveedorEditar(null, busca.value) }, icono('sumar'), 'Nuevo proveedor')))
  }
  busca.addEventListener('input', pintar)
  pintar()
  const deuda = lista.reduce((s, p) => s + (p.deuda || 0), 0)
  const vencido = lista.reduce((s, p) => s + (p.vencido || 0), 0)
  pintarSeccion('proveedores',
    cabecera('Proveedores', nombreSucursal(S.sucursal), el('button', { clase: 'btn', onclick: () => ir('apagar') }, icono('apagar'), 'A pagar'), el('button', { clase: 'btn primario', onclick: () => hojaProveedorEditar(null) }, icono('sumar'), 'Nuevo')),
    el('div', { clase: 'kpis' },
      kpi('Les debés', plata(deuda), lista.filter((p) => p.deuda).length + ' proveedores', { clase: 'principal', alTocar: () => ir('apagar') }),
      kpi('Vencido', plata(vencido), vencido ? 'pagalo cuanto antes' : 'nada atrasado', { clase: vencido ? 'mal' : '', alTocar: () => ir('apagar') })),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    el('div', { clase: 'tarjeta sin-relleno' }, zona))
}

async function hojaProveedor (p) {
  const suc = S.sucursal
  const [deudasD, cat] = await Promise.all([leerDatos('deudas').catch(() => ({})), leerCatalogo(suc).catch(() => [])])
  const deudas = ((datosDe(deudasD, suc) || {}).pendientes || []).filter((d) => d.proveedorId === p.id)
  const productos = cat.filter((x) => x.proveedorId === p.id && x.activo !== false).sort((a, b) => b.vendido30 - a.vendido30)
  abrirHoja({
    titulo: p.nombre,
    completa: true,
    cuerpo: el('div', {},
      el('div', { clase: 'dato-grande' },
        el('div', {}, el('div', { clase: 'r' }, 'Le debés'), el('div', { clase: 'v ' + (p.vencido ? 'rojo' : '') }, plata(p.deuda || 0))),
        el('div', {}, el('div', { clase: 'r' }, 'Productos'), el('div', { clase: 'v' }, String(p.productos || 0))),
        el('div', {}, el('div', { clase: 'r' }, 'Última compra'), el('div', { clase: 'v', estilo: { fontSize: '14px' } }, p.ultimaCompra ? fechaCorta(isoLocal(new Date(p.ultimaCompra))) : '—'))),
      el('div', { clase: 'acciones-grandes' },
        el('button', { clase: 'btn primario grande', onclick: () => hojaDeudaNueva(p.id) }, icono('sumar'), 'Cargar deuda'),
        el('button', { clase: 'btn grande', onclick: () => { cerrarHoja(); ir('reponer') } }, icono('reponer'), 'Hacer pedido')),
      el('div', { clase: 'lista', estilo: { margin: '0 -16px' } },
        p.telefono ? el('a', { clase: 'item', href: 'tel:' + p.telefono }, icono('telefono'), el('div', { clase: 'cuerpo' }, el('b', {}, p.telefono), el('div', { clase: 'sub' }, 'Llamar')), icono('flecha')) : null,
        p.telefono ? el('a', { clase: 'item', href: linkWhatsApp(p.telefono), target: '_blank', rel: 'noreferrer' }, icono('mensaje'), el('div', { clase: 'cuerpo' }, el('b', {}, 'WhatsApp')), icono('flecha')) : null,
        p.cuit ? el('div', { clase: 'item' }, el('div', { clase: 'cuerpo' }, el('b', { clase: 'num' }, p.cuit), el('div', { clase: 'sub' }, 'CUIT'))) : null,
        el('button', { clase: 'item', onclick: () => hojaProveedorEditar(p) }, icono('editar'), el('div', { clase: 'cuerpo' }, el('b', {}, 'Editar datos')), icono('flecha'))),
      el('h3', {}, 'Facturas por pagar'),
      deudas.length ? el('div', { clase: 'lista', estilo: { margin: '0 -16px' } }, deudas.map((d) => itemDeuda(d))) : el('p', { clase: 'sub' }, 'No le debés nada.'),
      el('h3', {}, 'Sus productos (' + productos.length + ')'),
      productos.length ? el('div', { clase: 'lista', estilo: { margin: '0 -16px' } }, productos.slice(0, 15).map((x) => itemProducto(x, () => hojaProducto(x)))) : el('p', { clase: 'sub' }, 'Ningún producto tiene este proveedor.'),
      productos.length > 15 ? el('button', { clase: 'btn ancho', onclick: () => { S.prod = Object.assign(S.prod || {}, { proveedor: p.id, busca: '', filtro: 'todos' }); cerrarHoja(); ir('productos') } }, 'Ver los ' + productos.length) : null)
  })
}

function hojaProveedorEditar (p, nombreInicial) {
  const nombre = el('input', { type: 'text', valor: p ? p.nombre : (nombreInicial || '') })
  const tel = el('input', { type: 'tel', valor: p ? p.telefono || '' : '', placeholder: 'WhatsApp para los pedidos' })
  const cuit = el('input', { type: 'text', inputmode: 'numeric', valor: p ? p.cuit || '' : '', placeholder: '11 números (opcional)' })
  abrirHoja({
    titulo: p ? 'Editar proveedor' : 'Proveedor nuevo',
    cuerpo: el('div', {}, el('label', { clase: 'campo' }, 'Nombre', nombre), el('label', { clase: 'campo' }, 'Teléfono', tel), el('label', { clase: 'campo' }, 'CUIT', cuit)),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      if (!nombre.value.trim()) return toast('Falta el nombre', 'mal')
      const c = cuit.value.replace(/[^0-9]/g, '')
      if (c && c.length !== 11) return toast('El CUIT tiene 11 números', 'mal')
      cerrarHoja(p ? 2 : 1)
      await mandarOrden(S.sucursal, 'proveedor_guardar', { proveedor: { id: p ? p.id : undefined, nombre: nombre.value.trim(), telefono: tel.value.trim(), cuit: c } }, { texto: 'Proveedor ' + nombre.value.trim(), alTerminar: refrescarSeccion })
    } }]
  })
}

function itemDeuda (d) {
  const cuando = d.dias < 0 ? el('span', { clase: 'rojo' }, 'venció hace ' + (-d.dias) + (d.dias === -1 ? ' día' : ' días')) : d.dias === 0 ? el('span', { clase: 'ambar' }, 'vence hoy') : el('span', {}, 'vence ' + fechaCorta(d.vence))
  return el('div', { clase: 'item' },
    el('div', { clase: 'cuerpo' }, el('b', {}, d.proveedor + (d.comprobante ? ' · ' + d.comprobante : '')), el('div', { clase: 'sub' }, cuando, d.pagado ? ' · pagaste ' + plata(d.pagado) : '')),
    el('div', { clase: 'fin' }, el('b', { clase: 'num' }, plata(d.saldo)), el('button', { clase: 'btn chico' + (d.dias <= 0 ? ' primario' : ''), estilo: { marginTop: '4px' }, onclick: () => hojaPagarDeuda(d) }, 'Pagar')))
}

async function secAPagar () {
  if (!S.sucursal) return pintarSeccion('apagar', cabecera('A pagar'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'apagar')))
  const d = datosDe(await leerDatos('deudas'))
  if (!d) return pintarSeccion('apagar', cabecera('A pagar', nombreSucursal(S.sucursal)), el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió las deudas con proveedores. Aparecen después de actualizarla a la versión 0.11.', 'apagar')))
  const grupos = [['vencida', 'Vencidas'], ['hoy', 'Hoy'], ['semana', 'Próximos 7 días'], ['proxima', 'Más adelante']]
  pintarSeccion('apagar',
    cabecera('A pagar', nombreSucursal(S.sucursal) + ' · lo que les debés a los proveedores', el('button', { clase: 'btn primario', onclick: () => hojaDeudaNueva() }, icono('sumar'), 'Cargar deuda')),
    el('div', { clase: 'kpis' },
      kpi('Les debés', plata(d.total), d.pendientes.length + (d.pendientes.length === 1 ? ' factura' : ' facturas'), { clase: 'principal' }),
      kpi('Vencido', plata(d.vencido), d.vencido ? 'atrasado' : 'nada atrasado', { clase: d.vencido ? 'mal' : '' }),
      kpi('Vence hoy', plata(d.venceHoy), '', { clase: d.venceHoy ? 'alerta' : '' }),
      kpi('Próximos 7 días', plata(d.semana))),
    grupos.map(([id, t]) => {
      const del = d.pendientes.filter((x) => x.estado === id)
      if (!del.length) return null
      return [el('h3', {}, t + ' · ' + plata(del.reduce((s, x) => s + x.saldo, 0))), el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, del.map(itemDeuda)))]
    }),
    !d.pendientes.length ? el('div', { clase: 'tarjeta' }, vacio('No les debés nada a los proveedores.', 'apagar')) : null,
    d.calendario.length ? el('div', { clase: 'tarjeta', estilo: { marginTop: '12px' } }, el('h2', {}, 'Qué días pagar'),
      ranking(d.calendario.map((x) => ({ n: fechaCorta(x.fecha) + ' · ' + x.proveedores.slice(0, 2).join(', '), texto: plata(x.total), v: x.total })))) : null)
}

async function hojaDeudaNueva (proveedorId) {
  const suc = S.sucursal
  const lista = datosDe(await leerDatos('proveedores').catch(() => ({})), suc) || []
  const prov = el('select', {}, el('option', { valor: '' }, 'Elegí el proveedor…'), lista.map((x) => el('option', { valor: x.id }, x.nombre)))
  prov.value = proveedorId || ''
  const importe = el('input', { type: 'text', inputmode: 'decimal', clase: 'plata-grande' })
  const comp = el('input', { type: 'text', placeholder: 'Número de factura o remito' })
  const fecha = el('input', { type: 'date', valor: hoyISO() })
  const vence = el('input', { type: 'date', valor: sumarDias(hoyISO(), 7) })
  const nota = el('input', { type: 'text', placeholder: 'Opcional' })
  const plazos = el('div', { clase: 'chips' }, [[0, 'Contado'], [7, '7 días'], [15, '15 días'], [30, '30 días']].map(([n, t]) => el('button', { clase: 'filtro', onclick: () => { vence.value = sumarDias(fecha.value || hoyISO(), n) } }, t)))
  abrirHoja({
    titulo: 'Deuda con un proveedor',
    completa: true,
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Proveedor', prov),
      el('label', { clase: 'campo' }, 'Importe que se debe ($)', importe),
      el('label', { clase: 'campo' }, 'Factura o remito', comp),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Fecha de la factura', fecha), el('label', { clase: 'campo' }, 'Hay que pagarla el', vence)),
      el('div', { clase: 'campo' }, 'Plazo', plazos),
      el('label', { clase: 'campo' }, 'Nota', nota)),
    botones: [{ texto: 'Cargar deuda', primario: true, alTocar: async () => {
      if (!prov.value) return toast('Elegí el proveedor', 'mal')
      const n = aCentavos(importe.value)
      if (!Number.isFinite(n) || n <= 0) return toast('Escribí el importe', 'mal')
      if (!vence.value) return toast('Falta la fecha de pago', 'mal')
      cerrarHoja()
      await mandarOrden(suc, 'deuda_guardar', { deuda: { proveedorId: prov.value, importe: n, comprobante: comp.value.trim(), fecha: fecha.value, vence: vence.value, detalle: nota.value.trim() } }, { texto: 'Deuda con ' + prov.selectedOptions[0].textContent, alTerminar: refrescarSeccion })
    } }]
  })
}

async function hojaPagarDeuda (d) {
  const suc = S.sucursal
  const dd = datosDe(await leerDatos('deudas').catch(() => ({})), suc) || {}
  const medio = el('select', {}, (dd.medios || [{ id: 'transferencia', nombre: 'Transferencia' }]).map((m) => el('option', { valor: m.id }, m.nombre)))
  medio.value = 'transferencia'
  const importe = el('input', { type: 'text', inputmode: 'decimal', clase: 'plata-grande', valor: plataExacta(d.saldo) })
  const fecha = el('input', { type: 'date', valor: hoyISO() })
  const comp = el('input', { type: 'text', placeholder: 'Nº de transferencia, recibo… (opcional)' })
  abrirHoja({
    titulo: 'Pagar a ' + d.proveedor,
    cuerpo: el('div', {},
      el('div', { clase: 'sub', estilo: { marginBottom: '8px' } }, (d.comprobante || 'Factura sin número') + ' · falta pagar ' + plata(d.saldo)),
      el('label', { clase: 'campo' }, 'Cuánto pagás (menos es un pago parcial)', importe),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Cómo', medio), el('label', { clase: 'campo' }, 'Fecha', fecha)),
      el('label', { clase: 'campo' }, 'Comprobante', comp),
      el('p', { clase: 'sub' }, 'Pagar con el efectivo del cajón se carga en el local (queda como retiro del turno).')),
    botones: [{ texto: 'Cargar el pago', primario: true, alTocar: async () => {
      const n = aCentavos(importe.value)
      if (!Number.isFinite(n) || n <= 0) return toast('Escribí cuánto pagás', 'mal')
      if (n > d.saldo) return toast('Es más de lo que se debe', 'mal')
      cerrarHoja()
      await mandarOrden(suc, 'deuda_pagar', { deudaId: d.id, importe: n, medio: medio.value, fecha: fecha.value, comprobante: comp.value.trim() }, { texto: 'Pago a ' + d.proveedor, alTerminar: refrescarSeccion })
    } }]
  })
}

// --- HISTORIAL (auditoria) --------------------------------------------------------

const TIPOS_AUDITORIA = {
  precio: ['Precio', 'gastos'], costo: ['Costo', 'gastos'], nombre: ['Nombre', 'editar'], baja: ['Dado de baja', 'basura'], alta: ['Vuelve a venderse', 'ok'],
  producto_nuevo: ['Producto nuevo', 'sumar'], stock: ['Stock', 'stock'], anulacion: ['Venta anulada', 'ventas'], cuenta_ajuste: ['Ajuste de cuenta', 'clientes'], aumento: ['Aumento de precios', 'reportes'],
  foto: ['Foto nueva', 'foto']
}
const MOVS_STOCK = { ajuste_conteo: 'ajuste', rotura: 'rotura', vencimiento: 'vencimiento', carga_inicial: 'stock inicial' }

function itemAuditoria (x) {
  const [nombre, ic] = TIPOS_AUDITORIA[x.tipo] || [x.tipo, 'historial']
  let detalle = ''
  if (x.tipo === 'precio' || x.tipo === 'costo') detalle = plata(x.antes) + ' → ' + plata(x.despues)
  else if (x.tipo === 'nombre') detalle = '"' + x.antes + '" → "' + x.despues + '"'
  else if (x.tipo === 'stock') detalle = (x.cantidad > 0 ? '+' : '−') + unidades(Math.abs(x.cantidad)) + ' · ' + (MOVS_STOCK[x.movimiento] || x.movimiento) + (x.motivo ? ' · ' + x.motivo : '')
  else if (x.tipo === 'anulacion') detalle = (x.numero || '') + ' · ' + plata(x.antes) + (x.motivo ? ' · ' + x.motivo : '')
  else if (x.tipo === 'cuenta_ajuste') detalle = (x.cantidad > 0 ? '+' : '−') + plata(Math.abs(x.cantidad)).replace('−', '') + (x.motivo ? ' · ' + x.motivo : '')
  else if (x.tipo === 'aumento') detalle = pct(x.porcentajeBasis) + ' · ' + x.productos + ' productos' + (x.motivo ? ' · ' + x.motivo : '')
  else if (x.tipo === 'producto_nuevo') detalle = plata(x.despues)
  const desdeCel = x.origen && /celular/.test(x.origen)
  const desdeSuc = x.origen && /^sucursal:/.test(x.origen) ? x.origen.slice(9).trim() : ''
  return el('div', { clase: 'item' },
    el('span', { clase: 'ico', estilo: { color: 'var(--texto3)' } }, icono(ic)),
    el('div', { clase: 'cuerpo' },
      el('b', {}, (x.descripcion ? x.descripcion + ' · ' : '') + nombre),
      el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, detalle),
      el('div', { clase: 'sub' }, (x.usuario || '—') + ' · ' + fechaHora(x.ts) + (desdeCel ? ' · desde el celular' : '') + (desdeSuc ? ' · desde ' + desdeSuc : ''))))
}

async function secHistorial () {
  if (!S.sucursal) return pintarSeccion('historial', cabecera('Historial'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'historial')))
  const lista = datosDe(await leerDatos('auditoria')) || []
  const E = S.aud = Object.assign({ filtro: '', busca: '' }, S.aud || {})
  const filtros = [['', 'Todo'], ['precio', 'Precios'], ['costo', 'Costos'], ['stock', 'Stock'], ['anulacion', 'Anulaciones'], ['producto_nuevo', 'Productos nuevos'], ['cuenta_ajuste', 'Cuentas'], ['celular', 'Desde el celular']]
  const zona = el('div', {})
  const busca = el('input', { type: 'search', placeholder: 'Producto, persona o motivo…', valor: E.busca })
  const barra = el('div', { clase: 'filtros' })
  const pintar = () => {
    poner(barra, filtros.map(([id, t]) => el('button', { clase: 'filtro' + (E.filtro === id ? ' activo' : ''), onclick: () => { E.filtro = id; pintar() } }, t)))
    const filas = lista.filter((x) => (!E.filtro || (E.filtro === 'celular' ? /celular/.test(x.origen || '') : x.tipo === E.filtro)) && (!E.busca || coincide((x.descripcion || '') + ' ' + (x.usuario || '') + ' ' + (x.motivo || '') + ' ' + (x.numero || ''), E.busca)))
    let dia = ''
    const bloques = []
    let actual = null
    for (const x of filas) {
      const d = isoLocal(new Date(x.ts))
      if (d !== dia) { dia = d; actual = el('div', { clase: 'lista' }); bloques.push(el('h3', {}, fechaCorta(d)), el('div', { clase: 'tarjeta sin-relleno' }, actual)) }
      actual.append(itemAuditoria(x))
    }
    poner(zona, bloques.length ? bloques : el('div', { clase: 'tarjeta' }, vacio(lista.length ? 'Nada coincide.' : 'Todavía no hay cambios registrados. Se anotan desde la versión 0.11 de la caja.', 'historial')))
  }
  busca.addEventListener('input', () => { E.busca = busca.value; pintar() })
  pintar()
  pintarSeccion('historial',
    cabecera('Historial de cambios', nombreSucursal(S.sucursal) + ' · quién cambió qué, cuándo, y cómo estaba antes'),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    barra, zona)
}

seccion('ventas', { nombre: 'Ventas', icono: 'ventas', grupo: 'principal', fn: secVentas })
seccion('reportes', { nombre: 'Reportes', icono: 'reportes', grupo: 'principal', fn: secReportes })
seccion('clientes', { nombre: 'Clientes', icono: 'clientes', grupo: 'negocio', fn: secClientes })
seccion('caja', { nombre: 'Caja', icono: 'caja', grupo: 'negocio', fn: secCaja })
seccion('gastos', { nombre: 'Gastos', icono: 'gastos', grupo: 'negocio', fn: secGastos })
seccion('proveedores', { nombre: 'Proveedores', icono: 'proveedores', grupo: 'mercaderia', fn: secProveedores })
seccion('apagar', { nombre: 'A pagar', icono: 'apagar', grupo: 'mercaderia', fn: secAPagar })
seccion('historial', { nombre: 'Historial', icono: 'historial', grupo: 'control', fn: secHistorial })
