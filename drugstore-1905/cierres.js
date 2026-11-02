'use strict'
// CERRAR SEMANA Y CERRAR MES (solo el dueño).
//
// Lo mismo que en la caja, desde el celular. La caja sube lo ya cerrado y lo
// que toca cerrar (con lo que tendria que haber por medio de pago); aca se
// cargan los totales reales y la orden vuelve a la caja, que vuelve a calcular
// y guarda el cierre. La caja tambien calcula las vistas previas elegidas aca.

const NOMBRES_LINEA = { efectivo: 'Efectivo', mercado_pago: 'Mercado Pago', transferencia: 'Transferencia', tarjeta: 'Tarjeta' }
const cuandoCierre = (iso) => fechaHora(iso)
const signoPlata = (c) => (c > 0 ? '+' : c < 0 ? '−' : '') + plata(Math.abs(c))
const nombreMesCierre = (mes) => {
  const [a, m] = String(mes).split('-').map(Number)
  const t = new Date(a, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const localCierre = (iso) => {
  const d = new Date(iso)
  const z = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes())
}
// Fecha + hora en 24 horas. El campo "datetime-local" del telefono usa a. m. / p. m.
// segun el idioma: escribir "12" deja las 12 de la noche y "3" las 3 de la madrugada,
// y el horario parece que nunca cambia. Con la hora en una lista de 00 a 23 no hay confusion.
// alCambiar recibe 'AAAA-MM-DDTHH:MM' (o '' si falta la fecha).
function campoFechaHora (inicial, alCambiar) {
  const z = (n) => String(n).padStart(2, '0')
  const [dia, h, m] = String(inicial || '').split(/[T:]/)
  const fecha = el('input', { type: 'date', valor: dia || '', estilo: { flex: '1 1 0', minWidth: '0', width: 'auto' } })
  const lista = { flex: 'none', width: '72px', paddingLeft: '8px', paddingRight: '4px' }
  const horas = el('select', { estilo: lista }, Array.from({ length: 24 }, (_, i) => el('option', { value: z(i) }, z(i))))
  const minutos = el('select', { estilo: lista }, Array.from({ length: 60 }, (_, i) => el('option', { value: z(i) }, z(i))))
  horas.value = h || '00'
  minutos.value = m || '00'
  const cambio = () => alCambiar(fecha.value ? fecha.value + 'T' + horas.value + ':' + minutos.value : '')
  for (const c of [fecha, horas, minutos]) c.addEventListener('change', cambio)
  return el('div', { estilo: { display: 'flex', gap: '6px', alignItems: 'center', minWidth: '0' } }, fecha, horas, el('b', {}, ':'), minutos)
}
const ESTADO_SEMANA ={ sucursal: null, desde: '', hasta: '', previo: null, pedido: false, editado: false, revision: 0 }

// --- CERRAR SEMANA ------------------------------------------------------------------------

async function secCierreSemana () {
  if (!S.sucursal) return pintarSeccion('cierresemana', cabecera('Cerrar semana'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'caja')))
  const d = datosDe(await leerDatos('cierre_semana'))
  if (!d) return pintarSeccion('cierresemana', cabecera('Cerrar semana', nombreSucursal(S.sucursal)), el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió los cierres. Aparecen cuando se actualiza a la versión nueva.', 'caja')))
  const e = ESTADO_SEMANA
  if (e.sucursal !== S.sucursal) {
    e.sucursal = S.sucursal
    e.desde = d.proximo ? localCierre(d.proximo.desde) : ''
    e.hasta = d.proximo ? localCierre(d.proximo.hasta) : ''
    e.previo = null
    e.pedido = false
    e.editado = false
    e.revision++
  }
  const p = e.pedido ? null : e.previo || (!e.editado && d.proximo && e.desde === localCierre(d.proximo.desde) && e.hasta === localCierre(d.proximo.hasta) ? d.proximo : null)
  const cuerpo = []
  const vista = el('div', {})
  const boton = el('button', { clase: 'btn primario ancho', disabled: e.pedido, onclick: () => pedirCierreSemana() }, e.pedido ? 'Calculando en la caja…' : 'Calcular este período')
  const mensaje = () => el('div', { clase: 'tarjeta' }, el('p', { clase: 'sub' }, e.pedido ? 'Esperando el cálculo de la caja…' : 'Elegí el período y tocá «Calcular este período» para ver los importes antes de cerrar.'))
  const cambiar = () => {
    e.previo = null; e.pedido = false; e.editado = true; e.revision++
    boton.disabled = false
    boton.textContent = 'Calcular este período'
    poner(vista, mensaje())
  }
  const desde = campoFechaHora(e.desde, (v) => { e.desde = v; cambiar() })
  const hasta = campoFechaHora(e.hasta, (v) => { e.hasta = v; cambiar() })
  cuerpo.push(el('div', { clase: 'tarjeta' },
    el('div', { clase: 'dos cierre-fechas' }, el('label', { clase: 'campo' }, 'Desde (fecha y hora)', desde), el('label', { clase: 'campo' }, 'Hasta (fecha y hora)', hasta)),
    boton,
    el('p', { clase: 'sub' }, 'Cuenta desde la hora de inicio hasta justo antes de la hora de fin. La caja debe estar encendida y conectada.')))
  poner(vista, p ? tarjetaCierreSemana(p) : mensaje())
  cuerpo.push(vista)
  cuerpo.push(el('h3', {}, 'Cierres guardados'))
  cuerpo.push(el('div', { clase: 'tarjeta sin-relleno' }, d.lista.length ? el('div', { clase: 'lista' }, d.lista.map((c) => {
    const difs = Object.keys(NOMBRES_LINEA).filter((l) => c.lineas[l] && c.lineas[l].diferencia).map((l) => NOMBRES_LINEA[l] + ' ' + signoPlata(c.lineas[l].diferencia)).join(' · ')
    return el('div', { clase: 'item' },
      el('div', { clase: 'cuerpo' }, el('b', {}, cuandoCierre(c.desde) + ' → ' + cuandoCierre(c.hasta)),
        el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, (difs || 'Sin diferencias') + (c.nota ? ' · ' + c.nota : ''))),
      el('div', { clase: 'fin' }, el('span', { clase: 'chip ' + (c.estado === 'ok' ? 'ok' : 'mal') }, c.estado === 'ok' ? 'OK' : 'Con diferencia')))
  })) : vacio('Todavía no hay cierres.', 'cierres')))
  pintarSeccion('cierresemana', cabecera('Cerrar semana', nombreSucursal(S.sucursal)), ...cuerpo)
}

async function pedirCierreSemana () {
  const e = ESTADO_SEMANA
  const desde = new Date(e.desde).getTime()
  const hasta = new Date(e.hasta).getTime()
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return toast('Elegí fecha y hora de inicio y de fin', 'mal')
  if (hasta <= desde) return toast('El fin tiene que ser después del inicio', 'mal')
  const sucursal = S.sucursal
  const revision = ++e.revision
  e.pedido = true
  e.previo = null
  e.editado = true
  refrescarSeccion()
  await mandarOrden(sucursal, 'cierre_semana_previsualizar', { desde: new Date(desde).toISOString(), hasta: new Date(hasta).toISOString() }, {
    texto: 'Calcular cierre semanal', callado: true, silencioso: true,
    alTerminar: (r) => {
      if (e.revision !== revision || e.sucursal !== sucursal) return
      e.pedido = false
      const res = r.resultado || {}
      if (r.estado === 'aplicada' && res.datos) { e.previo = res.datos; e.editado = false }
      else toast('No se pudo calcular: ' + (res.error || 'error de la caja'), 'mal', 7)
      if (S.seccion === 'cierresemana') refrescarSeccion()
    }
  })
}

function tarjetaCierreSemana (p) {
  const reales = {}
  const lineas = Object.keys(NOMBRES_LINEA)
  const fondo = el('input', { type: 'text', inputmode: 'decimal', valor: p.fondoSugerido ? String(p.fondoSugerido / 100).replace('.', ',') : '', estilo: { width: '130px', textAlign: 'right' } })
  const nota = el('textarea', { rows: '2', placeholder: 'Qué pasó con la diferencia (obligatoria si hay)' })
  const resumen = el('p', { clase: 'sub' })
  const difs = {}
  const leer = (i) => { const t = i.value.trim(); if (!t) return null; const c = aCentavos(t); return Number.isFinite(c) ? c : NaN }
  const calcular = () => {
    let hay = false
    let cargo = false
    for (const l of lineas) {
      let r = leer(reales[l])
      if (r != null && !Number.isNaN(r)) {
        if (l === 'efectivo') r -= (leer(fondo) || 0)
        const dif = r - p.lineas[l].esperado
        cargo = true
        if (dif) hay = true
        difs[l].textContent = dif ? signoPlata(dif) : 'Coincide'
        difs[l].className = 'num ' + (dif ? 'mal' : 'ok')
      } else { difs[l].textContent = 'Sin controlar'; difs[l].className = 'num sub' }
    }
    resumen.textContent = !cargo ? 'Cargá lo real para ver si coincide.' : hay ? 'Hay diferencias: se cierra "con diferencia" y hace falta una nota.' : 'Todo coincide.'
    return { hay, cargo }
  }
  const filas = lineas.map((l) => {
    const i = el('input', { type: 'text', inputmode: 'decimal', placeholder: l === 'efectivo' ? 'Contado' : 'Total', estilo: { width: '130px', textAlign: 'right' } })
    i.addEventListener('input', calcular)
    reales[l] = i
    difs[l] = el('b', { clase: 'num' })
    return el('div', { clase: 'fila' }, el('div', { clase: 'izq' }, el('b', {}, NOMBRES_LINEA[l]), el('div', { clase: 'sub' }, 'Esperado ' + plata(p.lineas[l].esperado))), el('div', { estilo: { textAlign: 'right' } }, i, el('div', {}, difs[l])))
  })
  fondo.addEventListener('input', calcular)
  // Lo que dice Mercado Pago para este rango: la caja lo consulta y se completa solo.
  const avisoMP = el('p', { clase: 'sub' })
  const botonMP = el('button', { clase: 'btn ancho', onclick: async () => {
    botonMP.disabled = true
    botonMP.textContent = 'Consultando Mercado Pago…'
    avisoMP.textContent = ''
    await mandarOrden(S.sucursal, 'cierre_semana_mercadopago', { desde: p.desde, hasta: p.hasta }, {
      texto: 'Mercado Pago', callado: true, silencioso: true,
      alTerminar: (r) => {
        botonMP.disabled = false
        botonMP.textContent = 'Traer de Mercado Pago'
        const res = r.resultado || {}
        if (r.estado !== 'aplicada' || !res.datos) { avisoMP.textContent = 'No se pudo traer de Mercado Pago: ' + (res.error || 'error de la caja') + '. Podés cargar el total a mano.'; return }
        reales.mercado_pago.value = String(res.datos.mp / 100).replace('.', ',')
        avisoMP.textContent = 'Mercado Pago: ' + plata(res.datos.mp) + ' (' + res.datos.cantidad + ' cobros)' + (res.datos.point ? ' · además ' + plata(res.datos.point) + ' de la terminal de tarjetas (Point): va en Tarjeta.' : '')
        calcular()
      }
    })
  } }, 'Traer de Mercado Pago')
  const tarjeta = el('div', { clase: 'tarjeta' },
    el('h2', {}, cuandoCierre(p.desde) + ' → ' + cuandoCierre(p.hasta)),
    el('p', { clase: 'sub' }, p.cantidadVentas + ' ventas' + (p.enCurso ? ' · la semana todavía no terminó' : '') + (p.aCuenta ? ' · ' + plata(p.aCuenta) + ' a cuenta corriente' : '')),
    p.yaCerrado ? el('p', { clase: 'sub mal' }, 'Este rango se pisa con un cierre ya guardado.') : null,
    filas,
    botonMP, avisoMP,
    el('label', { clase: 'campo' }, 'Fondo que ya había en la caja al empezar ($)', fondo),
    resumen,
    el('label', { clase: 'campo' }, 'Nota', nota),
    el('button', { clase: 'btn primario ancho grande', disabled: !!p.yaCerrado, onclick: async () => {
      const { hay, cargo } = calcular()
      if (!cargo) return toast('Cargá al menos un total real', 'mal')
      if (hay && !nota.value.trim()) return toast('Escribí una nota para cerrar con diferencia', 'mal')
      const r = {}
      for (const l of lineas) { const v = leer(reales[l]); if (Number.isNaN(v)) return toast('Revisá el importe de ' + NOMBRES_LINEA[l], 'mal'); r[l] = v }
      await mandarOrden(S.sucursal, 'cierre_semana_cerrar', { desde: p.desde, hasta: p.hasta, fondoInicial: leer(fondo) || 0, reales: r, estado: hay ? 'con_diferencia' : 'ok', nota: nota.value.trim() }, { texto: 'Cerrar semana', alTerminar: () => { ESTADO_SEMANA.previo = null; ESTADO_SEMANA.editado = false; refrescarSeccion() } })
    } }, 'Confirmar cierre'))
  calcular()
  return tarjeta
}

// --- CERRAR MES ---------------------------------------------------------------------------

const ESTADO_MES = { sucursal: null, mes: null, previo: null, pedido: false, revision: 0 }

async function secCierreMes () {
  if (!S.sucursal) return pintarSeccion('cierremes', cabecera('Cerrar mes'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'caja')))
  const d = datosDe(await leerDatos('cierre_mes'))
  if (!d) return pintarSeccion('cierremes', cabecera('Cerrar mes', nombreSucursal(S.sucursal)), el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió los cierres. Aparecen cuando se actualiza a la versión nueva.', 'caja')))
  const claves = Object.keys(d.meses).sort().reverse()
  const e = ESTADO_MES
  if (e.sucursal !== S.sucursal) {
    e.sucursal = S.sucursal
    e.mes = claves[0] || null
    e.previo = null
    e.pedido = false
    e.revision++
  }
  const p = e.pedido ? null : e.previo && e.previo.mes === e.mes ? e.previo : d.meses[e.mes]
  const cuerpo = []
  const mes = el('input', { type: 'month', valor: e.mes || '' })
  mes.addEventListener('change', () => { e.mes = mes.value; e.previo = null; e.pedido = false; e.revision++; refrescarSeccion() })
  cuerpo.push(el('div', { clase: 'tarjeta' }, el('label', { clase: 'campo' }, 'Mes que querés cerrar', mes),
    el('button', { clase: 'btn primario ancho', disabled: e.pedido, onclick: () => pedirCierreMes() }, e.pedido ? 'Calculando en la caja…' : 'Calcular este mes'),
    el('p', { clase: 'sub' }, 'El mes va del día 1 al último día calendario. La caja debe estar encendida y conectada.')))
  cuerpo.push(el('div', { clase: 'seg ancho', estilo: { marginBottom: '10px' } }, claves.map((m) => el('button', { clase: m === e.mes ? 'activo' : '', onclick: () => { e.mes = m; e.previo = null; e.pedido = false; e.revision++; refrescarSeccion() } }, nombreMesCierre(m)))))
  if (p) cuerpo.push(...tarjetasMes(p, d))
  else cuerpo.push(el('div', { clase: 'tarjeta' }, el('p', { clase: 'sub' }, e.pedido ? 'Esperando el cálculo de la caja…' : 'Tocá «Calcular este mes» para ver las cuentas antes de cerrar.')))
  cuerpo.push(el('h3', {}, 'Meses cerrados'))
  cuerpo.push(el('div', { clase: 'tarjeta sin-relleno' }, d.lista.length ? el('div', { clase: 'lista' }, d.lista.map((c) => el('div', { clase: 'item' },
    el('div', { clase: 'cuerpo' }, el('b', {}, nombreMesCierre(c.mes)), el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, c.reparto.map((x) => x.nombre + ' ' + plata(x.importe)).join(' · '))),
    el('div', { clase: 'fin' }, el('b', { clase: 'num' }, plata(c.cuentas.gananciaNeta)), el('div', {}, el('button', { clase: 'btn chico', onclick: () => copiarResumenMes(c, nombreSucursal(S.sucursal)) }, 'Copiar'))))))
    : vacio('Todavía no hay meses cerrados.', 'cierres')))
  pintarSeccion('cierremes', cabecera('Cerrar mes', nombreSucursal(S.sucursal), el('button', { clase: 'btn primario', onclick: () => hojaSocios(d.socios) }, icono('editar'), 'Socios')), ...cuerpo)
}

async function pedirCierreMes () {
  const e = ESTADO_MES
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.mes || '')) return toast('Elegí el mes', 'mal')
  const sucursal = S.sucursal
  const revision = ++e.revision
  e.pedido = true
  e.previo = null
  refrescarSeccion()
  await mandarOrden(sucursal, 'cierre_mes_previsualizar', { mes: e.mes }, {
    texto: 'Calcular cierre mensual', callado: true, silencioso: true,
    alTerminar: (r) => {
      if (e.revision !== revision || e.sucursal !== sucursal) return
      e.pedido = false
      const res = r.resultado || {}
      if (r.estado === 'aplicada' && res.datos) e.previo = res.datos
      else toast('No se pudo calcular: ' + (res.error || 'error de la caja'), 'mal', 7)
      if (S.seccion === 'cierremes') refrescarSeccion()
    }
  })
}

function tarjetasMes (p, d) {
  const c = p.cuentas
  const s = p.semanal
  const fila = (txt, valor, clase) => el('div', { clase: 'fila' }, el('span', {}, txt), el('b', { clase: 'num ' + (clase || '') }, valor))
  const nota = el('textarea', { rows: '2', placeholder: 'Nota del cierre (opcional)' })
  const out = []
  if (p.yaCerrado) out.push(el('div', { clase: 'tarjeta' }, el('b', { clase: 'mal' }, 'Este mes ya está cerrado'), el('div', { clase: 'sub' }, 'Se cerró el ' + cuandoCierre(p.yaCerrado.cerradoEn))))
  if (!c.cantidadVentas) out.push(el('div', { clase: 'tarjeta' }, el('b', {}, 'No hay ventas de ' + nombreSucursal(S.sucursal) + ' en este mes'), el('div', { clase: 'sub' }, 'Si es la sucursal de otra caja, el cierre se ve desde esa sucursal.')))
  if (c.lineasSinCosto) out.push(el('div', { clase: 'tarjeta' }, el('b', {}, c.lineasSinCosto + ' productos vendidos sin costo cargado'), el('div', { clase: 'sub' }, 'Su costo cuenta como cero: la ganancia queda más alta de lo real.')))
  out.push(el('div', { clase: 'tarjeta' }, el('h2', {}, nombreSucursal(S.sucursal) + ' · ' + nombreMesCierre(p.mes)),
    fila('Ventas (' + c.cantidadVentas + ')', plata(c.ventas)),
    fila('Costo de lo vendido', '−' + plata(c.costoVendido).replace('−', '')),
    fila('Ganancia bruta', plata(c.gananciaBruta)),
    fila('Comisiones de cobro', '−' + plata(c.comisiones).replace('−', '')),
    fila('Gastos', '−' + plata(c.gastos).replace('−', '')),
    fila('Ganancia neta a repartir', plata(c.gananciaNeta), c.gananciaNeta > 0 ? 'ok' : 'mal'),
    c.pagosMercaderia ? el('p', { clase: 'sub' }, 'Los ' + plata(c.pagosMercaderia) + ' pagados a proveedores no se restan: ya están en el costo.') : null))
  out.push(el('div', { clase: 'tarjeta' }, el('b', {}, 'Cierres de semana: ' + s.cierres + ' · cubren el ' + s.cobertura + '% del mes'),
    el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, s.conDiferencia
      ? s.conDiferencia + ' cerraron con diferencia (' + signoPlata(s.diferenciaTotal) + ' en total). Revisalas antes de repartir.'
      : s.cobertura >= 100 ? 'Todas las semanas del mes están cerradas y coinciden.' : 'Hay partes del mes sin cerrar: conviene cerrarlas antes de repartir.')))
  if (!p.socios.length) {
    out.push(el('div', { clase: 'tarjeta' }, el('h2', {}, 'Reparto'), el('p', { clase: 'sub' }, 'Esta sucursal todavía no tiene socios cargados.'), el('button', { clase: 'btn primario', onclick: () => hojaSocios(d.socios) }, 'Cargar socios')))
    return out
  }
  out.push(el('div', { clase: 'tarjeta' }, el('h2', {}, 'Reparto'),
    p.reparto.map((x) => el('div', { clase: 'fila' }, el('div', { clase: 'izq' }, el('b', {}, x.nombre), el('div', { clase: 'sub' }, (x.pct / 100) + '%')), el('b', { clase: 'num' }, plata(x.importe)))),
    c.gananciaNeta <= 0 ? el('p', { clase: 'sub mal' }, 'No hubo ganancia este mes: no hay nada para repartir.') : null))
  out.push(el('div', { clase: 'tarjeta' }, el('label', { clase: 'campo' }, 'Nota', nota),
    el('button', { clase: 'btn primario ancho grande', disabled: !!p.yaCerrado || !p.terminado, onclick: async () => {
      await mandarOrden(S.sucursal, 'cierre_mes_cerrar', { mes: p.mes, nota: nota.value.trim() }, { texto: 'Cerrar mes', alTerminar: () => { ESTADO_MES.previo = null; refrescarSeccion() } })
    } }, 'Confirmar cierre del mes'),
    el('button', { clase: 'btn ancho', estilo: { marginTop: '8px' }, onclick: () => copiarResumenMes({ mes: p.mes, cuentas: c, reparto: p.reparto }, nombreSucursal(S.sucursal)) }, 'Copiar resumen para los socios')))
  return out
}

async function copiarResumenMes (c, sucursal) {
  const lineas = ['Cierre de ' + nombreMesCierre(c.mes) + ' · ' + sucursal,
    'Ventas: ' + plata(c.cuentas.ventas), 'Costo de lo vendido: ' + plata(c.cuentas.costoVendido), 'Comisiones: ' + plata(c.cuentas.comisiones),
    'Gastos: ' + plata(c.cuentas.gastos), 'Ganancia neta: ' + plata(c.cuentas.gananciaNeta), '', 'Reparto:']
    .concat(c.reparto.map((x) => '- ' + x.nombre + ' (' + (x.pct / 100) + '%): ' + plata(x.importe)))
  try { await navigator.clipboard.writeText(lineas.join('\n')); toast('Copiado: pegalo en el grupo de los socios') } catch (e) { toast('No se pudo copiar', 'mal') }
}

function hojaSocios (actuales) {
  const filas = (actuales.length ? actuales : [{ nombre: '', pct: 0 }]).map((s) => ({ id: s.id, nombre: s.nombre, pct: s.pct ? String(s.pct / 100).replace('.', ',') : '' }))
  const zona = el('div', {})
  const total = el('p', { clase: 'sub' })
  const leer = (t) => { const n = Number(String(t).replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : 0 }
  const sumar = () => { const s = filas.reduce((t, f) => t + leer(f.pct), 0); total.textContent = 'Suman ' + (s / 100) + '%' + (s === 10000 ? ' ✓' : ' (tienen que sumar 100%)') }
  const pintar = () => {
    poner(zona, filas.map((f, i) => {
      const n = el('input', { type: 'text', maxlength: '40', valor: f.nombre, placeholder: 'Nombre del socio' })
      n.addEventListener('input', () => { f.nombre = n.value })
      const pc = el('input', { type: 'text', inputmode: 'decimal', valor: f.pct, placeholder: '%' })
      pc.addEventListener('input', () => { f.pct = pc.value; sumar() })
      return el('div', { clase: 'tarjeta', estilo: { marginBottom: '8px' } }, el('label', { clase: 'campo' }, 'Socio', n), el('label', { clase: 'campo' }, 'Porcentaje (%)', pc),
        filas.length > 1 ? el('button', { clase: 'btn chico peligro', onclick: () => { filas.splice(i, 1); pintar(); sumar() } }, 'Sacar') : null)
    }))
  }
  pintar()
  sumar()
  abrirHoja({
    titulo: 'Socios de ' + nombreSucursal(S.sucursal),
    completa: true,
    cuerpo: el('div', {}, zona, el('button', { clase: 'btn chico', onclick: () => { filas.push({ nombre: '', pct: '' }); pintar() } }, icono('sumar'), 'Agregar socio'), total,
      el('p', { clase: 'sub' }, 'Cada socio con su porcentaje de la ganancia de esta sucursal. Tienen que sumar 100%. Los meses ya cerrados no cambian.')),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      const socios = filas.map((f) => ({ id: f.id, nombre: f.nombre, pct: leer(f.pct) }))
      if (socios.reduce((t, s) => t + s.pct, 0) !== 10000) return toast('Los porcentajes tienen que sumar 100%', 'mal')
      cerrarHoja()
      await mandarOrden(S.sucursal, 'socios_guardar', { socios }, { texto: 'Socios', alTerminar: refrescarSeccion })
    } }]
  })
}

seccion('cierresemana', { nombre: 'Cerrar semana', icono: 'cierres', grupo: 'control', fn: secCierreSemana })
seccion('cierremes', { nombre: 'Cerrar mes', icono: 'cierres', grupo: 'control', fn: secCierreMes })
