'use strict'
// METRICAS EN EL CELULAR (solo el dueño): el Dashboard nuevo.
//
// Lee de la nube el resumen de cada dia de cada sucursal (clave 'dia:...') y
// lo guarda en el celular: la segunda vez trae solo los dias que cambiaron.
// El calculo es el mismo de la compu (src/comun/metricas.js).

// Los dias entre dos fechas, de todas las sucursales.
async function diasMetricas (desde, hasta) {
  const { data, error } = await S.sb.from('pos_datos').select('sucursal_id,clave,actualizado').gte('clave', 'dia:' + desde).lte('clave', 'dia:' + hasta)
  if (error) throw error
  const salida = []
  const faltan = []
  for (const f of data || []) {
    const k = 'met:' + f.sucursal_id + '|' + f.clave
    const g = S.cache[k] || await DB.get(k)
    if (g && g.a === f.actualizado) { S.cache[k] = g; salida.push(Object.assign({}, g.d, { s: f.sucursal_id })) } else faltan.push(f)
  }
  const claves = [...new Set(faltan.map((f) => f.clave))]
  for (let i = 0; i < claves.length; i += 40) {
    const { data: filas, error: e2 } = await S.sb.from('pos_datos').select('sucursal_id,clave,actualizado,datos').in('clave', claves.slice(i, i + 40))
    if (e2) throw e2
    for (const f of filas || []) {
      if (!faltan.some((x) => x.sucursal_id === f.sucursal_id && x.clave === f.clave)) continue
      const g = { a: f.actualizado, d: f.datos }
      S.cache['met:' + f.sucursal_id + '|' + f.clave] = g
      DB.set('met:' + f.sucursal_id + '|' + f.clave, g)
      salida.push(Object.assign({}, f.datos, { s: f.sucursal_id }))
    }
  }
  return salida
}

async function secMetricas () {
  const E = S.met || (S.met = { clave: 'hoy', desde: '', hasta: '', sucursal: 'todas', neta: false, top: 'importe', hora: null })
  const hoyCom = () => {
    // El dia comercial: antes de la hora de corte, todavia es el de ayer.
    const corte = S.metCorte == null ? 5 : S.metCorte
    const ahora = new Date()
    return ahora.getHours() < corte ? sumarDias(hoyISO(), -1) : hoyISO()
  }
  const per = Metricas.periodo(E.clave, hoyCom(), E.desde, E.hasta)
  pintarSeccion('metricas', cabecera('Métricas', per.nombre), esqueleto(6))
  let dias
  try { dias = await diasMetricas(per.anterior.desde, per.hasta) } catch (err) {
    return pintarSeccion('metricas', cabecera('Métricas'), el('div', { clase: 'aviso mal' }, 'No se pudieron traer las métricas: ' + (err.message || err)))
  }
  const conCorte = dias.find((x) => x.hc != null)
  if (conCorte && conCorte.hc !== S.metCorte) S.metCorte = conCorte.hc
  const filtro = E.sucursal === 'todas' ? null : [E.sucursal]
  const opc = (d, h) => ({ desde: d, hasta: h, sucursales: filtro, horaCorte: S.metCorte == null ? 5 : S.metCorte })
  const act = Metricas.calcular(dias, opc(per.desde, per.hasta))
  const ant = Metricas.calcular(dias, opc(per.anterior.desde, per.anterior.hasta))
  const gan = (x) => E.neta ? x.gananciaNeta : x.ganancia
  const otra = (cambio) => { Object.assign(E, cambio); refrescarSeccion() }

  const filtros = el('div', { clase: 'filtros' }, [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Semana'], ['mes', 'Mes'], ['rango', 'Rango']].map(([k, n]) =>
    el('button', { clase: 'filtro' + (E.clave === k ? ' activo' : ''), onclick: () => otra({ clave: k, hora: null, desde: k === 'rango' && !E.desde ? sumarDias(hoyCom(), -6) : E.desde, hasta: k === 'rango' && !E.hasta ? hoyCom() : E.hasta }) }, n)))
  const rango = E.clave === 'rango' ? el('div', { clase: 'dos' },
    el('label', { clase: 'campo' }, 'Desde', el('input', { type: 'date', valor: E.desde, onchange: (ev) => otra({ desde: ev.target.value }) })),
    el('label', { clase: 'campo' }, 'Hasta', el('input', { type: 'date', valor: E.hasta, onchange: (ev) => otra({ hasta: ev.target.value }) }))) : null
  const suc = el('select', { onchange: (ev) => otra({ sucursal: ev.target.value }) }, el('option', { valor: 'todas' }, 'Todas las sucursales'), S.sucursales.map((s) => el('option', { valor: s.id }, s.nombre)))
  suc.value = E.sucursal
  const neta = el('label', { clase: 'fila sub', estilo: { gap: '6px', alignItems: 'center', margin: '6px 2px 10px' } },
    el('input', { type: 'checkbox', checked: E.neta, onchange: (ev) => otra({ neta: ev.target.checked }) }), 'Ganancia neta (sin comisiones de los medios de pago)')

  const comparar = (a, b) => delta(a, b, per.contra === 'ayer' ? 'ayer' : 'antes')
  const kpis = el('div', { clase: 'kpis' },
    kpi('Ventas', plata(act.ventas), comparar(act.ventas, ant.ventas), { clase: 'principal' }),
    kpi(E.neta ? 'Ganancia neta' : 'Ganancia', plata(gan(act)), comparar(gan(act), gan(ant))),
    kpi('Cantidad de ventas', String(act.cantidad), comparar(act.cantidad, ant.cantidad)),
    kpi('Ticket promedio', plata(act.ticketPromedio), comparar(act.ticketPromedio, ant.ticketPromedio)))

  const series = [{ campo: 'total', clase: 'serie-1' }, { campo: 'ganancia', clase: 'serie-2' }]
  const detalleHora = el('div', { clase: 'sub', estilo: { whiteSpace: 'normal', padding: '6px 2px 0' } })
  const pintarHora = () => {
    const h = E.hora != null ? act.horas.find((x) => x.hora === E.hora) : null
    poner(detalleHora, h ? [el('b', {}, String(h.hora).padStart(2, '0') + ' a ' + String((h.hora + 1) % 24).padStart(2, '0') + ' h: '), plata(h.total) + ' vendido · ' + plata(h.ganancia) + ' de ganancia · ' + h.cantidad + ' ventas · promedio ' + plata(h.cantidad ? Math.round(h.total / h.cantidad) : 0)] : 'Tocá una barra para ver esa hora.')
  }
  const grafHoras = el('div', { clase: 'grafico' })
  const dibujarHoras = () => { grafHoras.innerHTML = Metricas.barrasSvg(act.horas, { ancho: 360, alto: 170, series, seleccionado: act.horas.findIndex((x) => x.hora === E.hora), etiqueta: (h, i) => (i % 3 === 0 ? String(h.hora).padStart(2, '0') : '') }) }
  grafHoras.addEventListener('click', (ev) => { const g = ev.target.closest('[data-i]'); if (!g) return; E.hora = act.horas[Number(g.dataset.i)].hora; dibujarHoras(); pintarHora() })
  dibujarHoras()
  pintarHora()
  const leyenda = el('div', { clase: 'leyenda-met' }, el('i', { clase: 'serie-1' }), 'Ventas', el('i', { clase: 'serie-2' }), 'Ganancia')

  let grafDias = null
  if (act.dias.length > 1) {
    grafDias = el('div', { clase: 'grafico' })
    grafDias.innerHTML = (Metricas.barrasSvg(act.dias, { ancho: 360, alto: 170, series, etiqueta: (d, i) => (i % Math.ceil(act.dias.length / 7) === 0 ? d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7) : '') }))
    grafDias.addEventListener('click', (ev) => { const g = ev.target.closest('[data-i]'); if (!g) return; const d = act.dias[Number(g.dataset.i)].dia; otra({ clave: 'rango', desde: d, hasta: d, hora: null }) })
  }

  const camposTop = { unidades: 'Cantidad', importe: 'Facturación', ganancia: 'Ganancia' }
  const tabsTop = el('div', { clase: 'seg' }, Object.entries(camposTop).map(([k, n]) => el('button', { clase: E.top === k ? 'activo' : '', onclick: () => otra({ top: k }) }, n)))
  const valorTop = (p) => (E.top === 'unidades' ? unidades(p.unidades) + ' u.' : plata(p[E.top]))

  pintarSeccion('metricas',
    cabecera('Métricas', per.nombre + ' · contra ' + per.contra),
    filtros, rango,
    el('label', { clase: 'campo' }, suc),
    neta,
    kpis,
    act.sinCosto.length ? el('div', { clase: 'aviso alerta', onclick: () => abrirHoja({ titulo: 'Vendidos sin costo', cuerpo: el('div', {}, el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Cuentan como ganancia completa: cargales el costo en Productos.'), ranking(act.sinCosto.slice(0, 100).map((p) => ({ n: p.descripcion, texto: plata(p.importe), v: p.importe })))) }), estilo: { cursor: 'pointer' } },
      act.sinCosto.length + (act.sinCosto.length === 1 ? ' producto vendido no tiene' : ' productos vendidos no tienen') + ' costo: la ganancia sale más alta. Tocá para ver cuáles.') : null,
    el('div', { clase: 'tarjeta' }, el('div', { clase: 'fila', estilo: { justifyContent: 'space-between' } }, el('h2', {}, 'Por hora'), leyenda), grafHoras, detalleHora),
    grafDias ? el('div', { clase: 'tarjeta' }, el('div', { clase: 'fila', estilo: { justifyContent: 'space-between' } }, el('h2', {}, 'Por día'), leyenda.cloneNode(true)), grafDias, el('div', { clase: 'sub' }, 'Tocá un día para verlo por hora.')) : null,
    el('div', { clase: 'tarjeta' }, el('h2', {}, 'Medios de pago'), act.medios.length ? ranking(act.medios.map((m) => ({ n: m.nombre, texto: plata(m.importe) + ' · ' + (m.pct / 100).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%', v: m.importe, sub: m.comision ? 'comisión ' + plata(m.comision) : '' }))) : vacio('Sin ventas.')),
    el('div', { clase: 'tarjeta' }, el('h2', {}, 'Mostrador y mayorista'), ranking([['Mostrador', act.mostrador], ['Mayorista', act.mayorista]].map(([n, x]) => ({ n, texto: plata(x.total), v: x.total, sub: x.cantidad + ' ventas · ganancia ' + plata(x.ganancia) })))),
    el('div', { clase: 'tarjeta' }, el('div', { clase: 'fila', estilo: { justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' } }, el('h2', {}, 'Top productos'), tabsTop),
      act.productos.length ? ranking(Metricas.top(act.productos, E.top, 10).map((p) => ({ n: p.descripcion, texto: valorTop(p), v: p[E.top] || 0, sub: p.sinCosto ? 'sin costo cargado' : '' }))) : vacio('Sin ventas.')),
    el('div', { clase: 'tarjeta' }, el('h2', {}, 'Top categorías'), act.familias.length ? ranking(Metricas.top(act.familias, E.top, 8).map((f) => ({ n: f.nombre, texto: valorTop(f), v: f[E.top] || 0 }))) : vacio('Sin ventas.')),
    act.diasConDatos === 0 && dias.length === 0 ? el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Si no ves nada, las cajas todavía no subieron los resúmenes: necesitan la versión 0.35 o más nueva (se instala sola al cerrar el turno).') : null)
}

seccion('metricas', { nombre: 'Métricas', icono: 'reportes', grupo: 'principal', fn: secMetricas })
