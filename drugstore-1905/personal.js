'use strict'
// PERSONAL, SUELDOS Y VENCIMIENTOS (solo el dueño).
//
// Lo mismo que las pantallas Personal y Vencimientos de la caja: quién está
// trabajando, horas del mes, la liquidación de cada empleado (adelantos, vales,
// descuentos, extras, pagos), horarios y valor hora, y las partidas por vencer.
// Las plata van en centavos, como en la caja. Lo que cambia viaja como orden y
// la caja lo aplica con las mismas reglas que su pantalla.

const COLOR_LLEGADA = { verde: 'ok', amarillo: 'alerta', rojo: 'mal' }
const chipColor = (c, texto) => el('span', { clase: 'chip ' + (COLOR_LLEGADA[c] || '') }, texto)
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = (m) => { const [a, n] = String(m).split('-'); return MESES[Number(n) - 1] + ' ' + a }
const horaCorta = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—')
const horasTexto = (min) => Math.floor((min || 0) / 60) + ' h ' + String((min || 0) % 60).padStart(2, '0') + ' min'
// "2026-10-23T08:00" (lo que da el campo) <-> ISO de la compu.
const aLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) }
const deLocalInput = (v) => (v ? new Date(v).toISOString() : '')

// --- PERSONAL -----------------------------------------------------------------------------

async function secPersonal () {
  if (!S.sucursal) return pintarSeccion('personal', cabecera('Personal'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'clientes')))
  const E = S.per = Object.assign({ vista: 'hoy', mes: hoyISO().slice(0, 7) }, S.per || {})
  const pestanas = el('div', { clase: 'seg ancho', estilo: { marginBottom: '10px' } }, [['hoy', 'Hoy'], ['sueldos', 'Sueldos'], ['horas', 'Horas'], ['horarios', 'Horarios']].map(([id, t]) => el('button', { clase: E.vista === id ? 'activo' : '', onclick: () => { E.vista = id; render() } }, t)))
  const cuerpo = E.vista === 'sueldos' ? await vistaSueldos(E) : E.vista === 'horas' ? await vistaHoras() : E.vista === 'horarios' ? await vistaHorarios() : await vistaHoy()
  pintarSeccion('personal',
    cabecera('Personal', nombreSucursal(S.sucursal) + ' · sueldos y horarios', el('button', { clase: 'btn', onclick: () => hojaFichajeManual() }, icono('sumar'), 'Día a mano')),
    pestanas, cuerpo)
}

async function vistaHoy () {
  const d = datosDe(await leerDatos('personal_hoy'))
  if (!d) return el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió el personal. Aparece cuando se actualiza a la versión nueva.', 'clientes'))
  const fila = (v) => el('div', { clase: 'item tocable', onclick: () => hojaFichajeCorregir(v) },
    el('div', { clase: 'cuerpo' }, el('b', {}, v.nombre), el('div', { clase: 'sub' }, 'entró ' + horaCorta(v.entrada) + (v.salida ? ' · salió ' + horaCorta(v.salida) : ' · sigue trabajando') + ' · ' + horasTexto(v.minutos))),
    el('div', { clase: 'fin' }, chipColor(v.llegada && v.llegada.color, (v.llegada && v.llegada.texto) || '')))
  return el('div', {},
    el('div', { clase: 'kpis' }, kpi('Trabajando', String(d.trabajando.length), d.trabajando.map((v) => v.nombre).slice(0, 3).join(', ') || 'nadie ahora', { clase: 'principal' }), kpi('Sin llegar', String(d.faltan.length), d.faltan.length ? d.faltan.map((x) => x.nombre).slice(0, 2).join(', ') : 'todos al día', { clase: d.faltan.length ? 'mal' : '' }), kpi('Más tarde', String(d.proximos.length), 'todavía no les toca')),
    d.faltan.length ? el('div', { clase: 'tarjeta sin-relleno' }, el('h2', { estilo: { padding: '12px 16px 0' } }, 'No llegaron'), el('div', { clase: 'lista' }, d.faltan.map((x) => el('div', { clase: 'item' }, el('div', { clase: 'cuerpo' }, el('b', {}, x.nombre), el('div', { clase: 'sub' }, 'Tenía que entrar a las ' + horaCorta(x.turno.inicio))), el('div', { clase: 'fin' }, chipColor(x.color, x.texto)))))) : null,
    el('h3', {}, 'Trabajando ahora'),
    el('div', { clase: 'tarjeta sin-relleno' }, d.trabajando.length ? el('div', { clase: 'lista' }, d.trabajando.map(fila)) : vacio('No hay nadie con el turno iniciado.', 'clientes')),
    d.terminaron.length ? [el('h3', {}, 'Ya terminaron'), el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, d.terminaron.map(fila)))] : null,
    el('p', { clase: 'sub' }, 'Tocá un turno para corregir la entrada o la salida (siempre con motivo: queda anotado).'))
}

// Corregir un fichaje.
function hojaFichajeCorregir (v) {
  const entrada = el('input', { type: 'datetime-local', valor: aLocalInput(v.entrada) })
  const salida = el('input', { type: 'datetime-local', valor: aLocalInput(v.salida) })
  const motivo = el('input', { type: 'text', placeholder: 'Ej: se olvidó de fichar la salida' })
  abrirHoja({
    titulo: 'Corregir turno de ' + v.nombre,
    cuerpo: el('div', {}, el('label', { clase: 'campo' }, 'Entrada', entrada), el('label', { clase: 'campo' }, 'Salida (vacío = sigue trabajando)', salida), el('label', { clase: 'campo' }, 'Motivo (obligatorio)', motivo)),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      if (!motivo.value.trim()) return toast('Poné el motivo', 'mal')
      cerrarHoja()
      await mandarOrden(S.sucursal, 'fichaje_corregir', { id: v.id, entrada: deLocalInput(entrada.value), salida: deLocalInput(salida.value) || null, motivo: motivo.value.trim() }, { texto: 'Turno de ' + v.nombre, alTerminar: refrescarSeccion })
    } }]
  })
}

// Cargar un día que no se fichó (se cortó la luz, se olvidó).
async function hojaFichajeManual () {
  const h = datosDe(await leerDatos('personal_horarios')) || { lista: [] }
  const quien = el('select', {}, h.lista.map((u) => el('option', { valor: u.usuarioId }, u.nombre)))
  const entrada = el('input', { type: 'datetime-local' })
  const salida = el('input', { type: 'datetime-local' })
  const motivo = el('input', { type: 'text', placeholder: 'Ej: se cortó la luz y no pudo fichar' })
  abrirHoja({
    titulo: 'Cargar un día a mano',
    cuerpo: el('div', {}, el('label', { clase: 'campo' }, 'Empleado', quien), el('label', { clase: 'campo' }, 'Entró', entrada), el('label', { clase: 'campo' }, 'Salió', salida), el('label', { clase: 'campo' }, 'Motivo (obligatorio)', motivo)),
    botones: [{ texto: 'Cargar', primario: true, alTocar: async () => {
      if (!entrada.value || !salida.value) return toast('Poné la entrada y la salida', 'mal')
      if (!motivo.value.trim()) return toast('Poné el motivo', 'mal')
      cerrarHoja()
      await mandarOrden(S.sucursal, 'fichaje_manual', { usuarioId: quien.value, entrada: deLocalInput(entrada.value), salida: deLocalInput(salida.value), motivo: motivo.value.trim() }, { texto: 'Día a mano', alTerminar: refrescarSeccion })
    } }]
  })
}

async function vistaHoras () {
  const d = datosDe(await leerDatos('personal_horas'))
  if (!d) return el('div', { clase: 'tarjeta' }, vacio('Todavía no hay horas subidas.', 'clientes'))
  return el('div', {},
    el('div', { clase: 'kpis' }, kpi('Horas del mes', horasTexto(d.porEmpleado.reduce((s, x) => s + x.minutos, 0)), nombreMes(d.desde.slice(0, 7)), { clase: 'principal' }), kpi('Faltas', String(d.porEmpleado.reduce((s, x) => s + x.faltas, 0))), kpi('Llegadas tarde', String(d.porEmpleado.reduce((s, x) => s + x.tardes + x.muyTarde, 0)))),
    el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, d.porEmpleado.map((x) => el('div', { clase: 'item' },
      el('div', { clase: 'cuerpo' }, el('b', {}, x.nombre), el('div', { clase: 'sub' }, x.dias + ' días · ' + x.horas + (x.tardes + x.muyTarde ? ' · ' + (x.tardes + x.muyTarde) + ' tarde' : '') + (x.faltas ? ' · ' + x.faltas + ' faltas' : '') + (x.sinSalida ? ' · ' + x.sinSalida + ' sin salida' : ''))),
      el('div', { clase: 'fin' }, el('b', { clase: 'num' }, plata(x.monto))))))),
    el('h3', {}, 'Día por día'),
    el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, d.filas.slice(0, 80).map((f) => el('div', { clase: 'item' + (f.tipo === 'fichaje' ? ' tocable' : ''), onclick: f.tipo === 'fichaje' ? () => hojaFichajeCorregir(f) : null },
      el('div', { clase: 'cuerpo' }, el('b', {}, f.nombre), el('div', { clase: 'sub' }, fechaCorta(f.dia) + (f.tipo === 'fichaje' ? ' · ' + horaCorta(f.entrada) + ' a ' + (f.salida ? horaCorta(f.salida) : '…') + ' · ' + f.horas + (f.manual ? ' · a mano' : '') : ''))),
      el('div', { clase: 'fin' }, chipColor(f.llegada && f.llegada.color, (f.llegada && f.llegada.texto) || '')))))))
}

// --- SUELDOS ------------------------------------------------------------------------------

async function vistaSueldos (E) {
  const hoy = hoyISO()
  const meses = [0, 1, 2].map((i) => { const f = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1 - i, 1); return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') })
  if (!meses.includes(E.mes)) E.mes = meses[0]
  const d = datosDe(await leerDatos('sueldos_mes:' + E.mes))
  const selector = el('div', { clase: 'seg ancho', estilo: { marginBottom: '10px' } }, meses.map((m) => el('button', { clase: E.mes === m ? 'activo' : '', onclick: () => { E.mes = m; render() } }, nombreMes(m).split(' ')[0])))
  if (!d) return el('div', {}, selector, el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió los sueldos de ' + nombreMes(E.mes) + '.', 'clientes')))
  const t = d.total
  return el('div', {}, selector,
    el('div', { clase: 'kpis' }, kpi('A pagar en el mes', plata(t.aCobrar), 'horas ' + plata(t.sueldoHoras), { clase: 'principal' }), kpi('Ya pagado', plata(t.pagado), 'adelantos y vales ' + plata(t.adelantos)), kpi('Saldo', plata(t.saldo), t.saldo > 0 ? 'falta pagar' : 'al día', { clase: t.saldo > 0 ? 'mal' : '' })),
    el('div', { clase: 'tarjeta sin-relleno' }, d.empleados.length ? el('div', { clase: 'lista' }, d.empleados.map((x) => el('div', { clase: 'item tocable', onclick: () => hojaEmpleadoSueldo(d, x.usuarioId) },
      el('div', { clase: 'cuerpo' }, el('b', {}, x.nombre), el('div', { clase: 'sub' }, horasTexto(x.minutos) + ' · le corresponde ' + plata(x.aCobrar) + (x.pagado ? ' · pagado ' + plata(x.pagado) : '') + (x.sinValorHora ? ' · SIN valor hora' : '')),
        x.cuenta && x.cuenta.debe > 0 ? el('div', { clase: 'sub ambar' }, 'Debe ' + plata(x.cuenta.debe) + ' de fiado') : null),
      el('div', { clase: 'fin' }, el('b', { clase: 'num ' + (x.saldo > 0 ? 'rojo' : '') }, plata(x.saldo)), el('div', { clase: 'sub' }, 'saldo'))))) : vacio('No hay empleados con movimientos este mes.', 'clientes')),
    el('p', { clase: 'sub' }, 'Horas × valor hora + extras − adelantos, vales, fiado, descuentos y faltantes de caja. Lo que se paga con el efectivo del cajón se carga en el local (así el cierre cierra); acá van las transferencias, Mercado Pago y el efectivo de afuera.'))
}

function hojaEmpleadoSueldo (liq, usuarioId) {
  const x = liq.empleados.find((y) => y.usuarioId === usuarioId)
  if (!x) return
  const fila = (t, v, clase) => el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, t), el('b', { clase: 'num ' + (clase || '') }, v))
  const botonTipo = (tipo, texto) => el('button', { clase: 'btn chico', onclick: () => hojaMovimientoSueldo(liq, x, tipo) }, texto)
  abrirHoja({
    titulo: x.nombre + ' · ' + nombreMes(liq.mes),
    completa: true,
    cuerpo: el('div', {},
      fila('Horas trabajadas', horasTexto(x.minutos) + ' (' + x.dias + ' días)'),
      fila('Valor hora lun-jue / vie-dom', plata(x.valorHoraLunJue) + ' / ' + plata(x.valorHoraVieDom)),
      fila('Sueldo por horas', plata(x.sueldoHoras)),
      x.extras ? fila('+ Extras', plata(x.extras), 'verde') : null,
      x.adicionales ? fila('+ Aguinaldo, vacaciones y feriados', plata(x.adicionales), 'verde') : null,
      x.aguinaldoSugerido ? fila('Aguinaldo sin cargar', plata(x.aguinaldoSugerido), 'ambar') : null,
      x.adelantos ? fila('− Adelantos y vales', plata(x.adelantos)) : null,
      x.fiado ? fila('− Fiado de su cuenta', plata(x.fiado)) : null,
      x.descuentos ? fila('− Roturas y descuentos', plata(x.descuentos)) : null,
      x.faltante ? fila('− Faltantes de caja', plata(x.faltante)) : null,
      fila('Le corresponde', plata(x.aCobrar)),
      fila('Ya pagado', plata(x.pagado)),
      fila('Saldo', plata(x.saldo), x.saldo > 0 ? 'rojo' : 'verde'),
      // Lo que debe en su cuenta de fiado (la cuenta se elige en la caja, en Sueldos).
      x.cuenta && x.cuenta.debe > 0 ? el('div', { clase: 'aviso alerta', estilo: { marginTop: '10px' } }, el('b', {}, 'Debe ' + plata(x.cuenta.debe) + ' de fiado'), 'En la cuenta ' + x.cuenta.nombre + '. Al descontarlo del sueldo, la cuenta queda pagada.', el('div', { estilo: { marginTop: '8px' } }, el('button', { clase: 'btn chico primario', onclick: () => hojaMovimientoSueldo(liq, x, 'fiado') }, 'Descontar del sueldo'))) : null,
      el('div', { clase: 'chips', estilo: { margin: '12px 0' } }, botonTipo('adelanto', '+ Adelanto'), botonTipo('vale', '+ Vale'), botonTipo('descuento', '+ Descuento'), botonTipo('bono', '+ Extra'), botonTipo('feriado', '+ Feriado'), botonTipo('vacaciones', '+ Vacaciones'), botonTipo('aguinaldo', '+ Aguinaldo'), botonTipo('pago', 'Pagar sueldo')),
      x.faltantes.length ? [el('h3', {}, 'Faltantes de caja'), x.faltantes.map((f) => el('div', { clase: 'fila' },
        el('span', { clase: 'tenue' }, fechaCorta(f.dia) + ' · ' + plata(f.importe) + (f.perdonado ? ' (perdonado)' : '')),
        el('button', { clase: 'btn chico', onclick: async () => { cerrarHoja(); await mandarOrden(S.sucursal, 'sueldo_perdonar', { cajaId: f.cajaId, perdonado: !f.perdonado, motivo: 'Desde el celular' }, { texto: f.perdonado ? 'Volver a descontar' : 'Perdonar faltante', alTerminar: refrescarSeccion }) } }, f.perdonado ? 'Descontar' : 'Perdonar')))] : null,
      x.movimientos.length ? [el('h3', {}, 'Movimientos del mes'), x.movimientos.map((m) => el('div', { clase: 'fila' },
        el('div', { clase: 'izq' }, el('b', {}, (m.signo > 0 ? '+ ' : '− ') + m.nombreTipo), el('div', { clase: 'sub' }, fechaCorta(m.fecha) + (m.motivo ? ' · ' + m.motivo : '') + (m.nombreMedio ? ' · ' + m.nombreMedio : ''))),
        el('b', { clase: 'num' }, plata(m.importe)),
        m.medio === 'caja' ? null : el('button', { clase: 'btn chico peligro', onclick: () => { if (confirm('¿Anular este movimiento?')) { cerrarHoja(); mandarOrden(S.sucursal, 'sueldo_anular', { id: m.id, motivo: 'Anulado desde el celular' }, { texto: 'Anular movimiento', alTerminar: refrescarSeccion }) } } }, 'Anular')))] : null)
  })
}

function hojaMovimientoSueldo (liq, x, tipo) {
  const nombres = liq.tipos
  const conPlata = tipo === 'adelanto' || tipo === 'pago'
  const sugerido = tipo === 'pago' && x.saldo > 0 ? x.saldo : tipo === 'fiado' && x.cuenta ? x.cuenta.debe : 0
  const importe = el('input', { type: 'text', inputmode: 'decimal', clase: 'plata-grande', valor: (sugerido || (tipo === 'aguinaldo' && x.aguinaldoSugerido)) ? String((sugerido || x.aguinaldoSugerido) / 100).replace('.', ',') : '' })
  const motivo = el('input', { type: 'text', placeholder: tipo === 'vale' ? 'Qué se llevó' : 'Opcional' })
  const medio = el('select', {}, [['transferencia', 'Transferencia'], ['mercado_pago', 'Mercado Pago'], ['efectivo', 'Efectivo (fuera de la caja)']].map(([id, t]) => el('option', { valor: id }, t)))
  const fecha = el('input', { type: 'date', valor: hoyISO() })
  abrirHoja({
    titulo: nombres[tipo] + ' · ' + x.nombre,
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Importe ($)', importe),
      conPlata ? el('label', { clase: 'campo' }, 'Cómo se le pagó', medio) : null,
      el('label', { clase: 'campo' }, 'Fecha', fecha),
      tipo === 'fiado' ? null : el('label', { clase: 'campo' }, 'Motivo / detalle', motivo),
      conPlata ? el('p', { clase: 'sub' }, 'Queda también como gasto "Sueldos". Si salió del cajón, cargalo en el local.') : null,
      tipo === 'fiado' && x.cuenta ? el('p', { clase: 'sub' }, 'Debe ' + plata(x.cuenta.debe) + ' en la cuenta ' + x.cuenta.nombre + '. Lo que descontás queda pagado en la cuenta.') : null),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      const n = aCentavos(importe.value)
      if (!Number.isFinite(n) || n <= 0) return toast('Escribí el importe', 'mal')
      cerrarHoja(2)
      await mandarOrden(S.sucursal, 'sueldo_registrar', { usuarioId: x.usuarioId, tipo, importe: n, medio: conPlata ? medio.value : undefined, fecha: fecha.value, motivo: motivo.value.trim() }, { texto: nombres[tipo] + ' de ' + x.nombre, alTerminar: refrescarSeccion })
    } }]
  })
}

// --- HORARIOS -----------------------------------------------------------------------------

async function vistaHorarios () {
  const d = datosDe(await leerDatos('personal_horarios'))
  if (!d) return el('div', { clase: 'tarjeta' }, vacio('Todavía no hay horarios subidos.', 'clientes'))
  const dias = [1, 2, 3, 4, 5, 6, 0]
  const resumen = (u) => u.tieneHorario ? dias.filter((i) => u.dias[i]).map((i) => d.dias[i].slice(0, 3) + ' ' + u.dias[i].desde + '-' + u.dias[i].hasta).join(' · ') : 'Sin horario cargado'
  return el('div', {},
    el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, d.lista.map((u) => el('div', { clase: 'item tocable', onclick: () => hojaHorario(d, u) },
      el('div', { clase: 'cuerpo' }, el('b', {}, u.nombre), el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, resumen(u))),
      el('div', { clase: 'fin' }, el('div', { clase: 'sub' }, 'hora ' + plata(u.valorHoraLunJue) + ' / ' + plata(u.valorHoraVieDom))))))),
    el('p', { clase: 'sub' }, 'Tolerancia ' + d.config.tolerancia + ' min · "muy tarde" desde ' + d.config.tarde + ' min. Un horario nuevo rige desde hoy; los días viejos quedan como estaban.'))
}

function hojaHorario (d, u) {
  const dias = [1, 2, 3, 4, 5, 6, 0]
  const campos = {}
  for (const i of dias) campos[i] = { desde: el('input', { type: 'time', valor: (u.dias[i] || {}).desde || '' }), hasta: el('input', { type: 'time', valor: (u.dias[i] || {}).hasta || '' }) }
  const semana = el('input', { type: 'text', inputmode: 'decimal', valor: u.valorHoraLunJue ? String(u.valorHoraLunJue / 100).replace('.', ',') : '' })
  const finde = el('input', { type: 'text', inputmode: 'decimal', valor: u.valorHoraVieDom ? String(u.valorHoraVieDom / 100).replace('.', ',') : '' })
  abrirHoja({
    titulo: 'Horario de ' + u.nombre,
    completa: true,
    cuerpo: el('div', {},
      dias.map((i) => el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, d.dias[i] + ' · entra', campos[i].desde), el('label', { clase: 'campo' }, 'sale', campos[i].hasta))),
      el('p', { clase: 'sub' }, 'Dejá vacío el día que no trabaja. Un turno que termina a la madrugada cuenta para el día en que empieza.'),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Valor hora lun a jue ($)', semana), el('label', { clase: 'campo' }, 'Valor hora vie a dom ($)', finde))),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      const dd = {}
      for (const i of dias) {
        const a = campos[i].desde.value
        const b = campos[i].hasta.value
        if ((a && !b) || (!a && b)) return toast(d.dias[i] + ': completá la entrada y la salida', 'mal')
        dd[i] = a ? { desde: a, hasta: b } : null
      }
      const v1 = aCentavos(semana.value)
      const v2 = aCentavos(finde.value)
      cerrarHoja()
      await mandarOrden(S.sucursal, 'horario_guardar', { usuarioId: u.usuarioId, dias: dd, valorHoraLunJue: Number.isFinite(v1) ? v1 : 0, valorHoraVieDom: Number.isFinite(v2) ? v2 : 0 }, { texto: 'Horario de ' + u.nombre, alTerminar: refrescarSeccion })
    } }]
  })
}

// --- VENCIMIENTOS -------------------------------------------------------------------------

const ESTADO_VTO = { vencido: ['mal', 'Vencido'], urgente: ['alerta', 'Urgente'], proximo: ['info', 'Este mes'], lejos: ['', 'Con tiempo'], resuelto: ['', 'Resuelto'] }

async function secVencimientos () {
  if (!S.sucursal) return pintarSeccion('vencimientos', cabecera('Vencimientos'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'reloj')))
  const d = datosDe(await leerDatos('vencimientos'))
  if (!d) return pintarSeccion('vencimientos', cabecera('Vencimientos', nombreSucursal(S.sucursal)), el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió los vencimientos. Aparecen cuando se actualiza a la versión nueva.', 'reloj')))
  const E = S.vto = Object.assign({ ver: 'urgentes', busca: '' }, S.vto || {})
  // El encargado recorre la gondola: ve y resuelve las partidas, sin lo que cuestan.
  const conPlata = S.rol === 'duenio'
  const busca = el('input', { type: 'search', placeholder: 'Buscar producto o lote…', valor: E.busca })
  const zona = el('div', { clase: 'lista' })
  const filtros = {
    urgentes: (p) => p.estado === 'vencido' || p.estado === 'urgente',
    vencidos: (p) => p.estado === 'vencido',
    mes: (p) => p.dias <= 30,
    todos: () => true
  }
  const pintar = () => {
    const base = E.ver === 'resueltos' ? d.resueltos || [] : d.lista.filter(filtros[E.ver] || filtros.todos)
    const lista = base.filter((p) => !E.busca || coincide(p.descripcion + ' ' + (p.lote || '') + ' ' + (p.codigo || ''), E.busca))
    poner(zona, lista.length ? lista.map((p) => el('div', { clase: 'item tocable', onclick: () => hojaPartida(p) },
      el('div', { clase: 'cuerpo' }, el('b', {}, p.descripcion), el('div', { clase: 'sub' }, [unidades(p.cantidad) + ' u.', 'vence ' + fechaCorta(p.fecha), p.dias < 0 ? 'hace ' + (-p.dias) + ' días' : p.dias === 0 ? 'hoy' : 'en ' + p.dias + ' días', p.lote ? 'lote ' + p.lote : ''].filter(Boolean).join(' · '))),
      el('div', { clase: 'fin' }, el('span', { clase: 'chip ' + ESTADO_VTO[p.estado][0] }, ESTADO_VTO[p.estado][1]), conPlata ? el('div', { clase: 'sub' }, plata(p.valorCosto)) : null))) : vacio(E.ver === 'resueltos' ? 'No hay partidas resueltas.' : 'No hay nada para mostrar acá.', 'reloj'))
  }
  busca.addEventListener('input', () => { E.busca = busca.value; pintar() })
  pintar()
  pintarSeccion('vencimientos',
    cabecera('Vencimientos', nombreSucursal(S.sucursal) + ' · ' + d.partidas + ' partidas', el('button', { clase: 'btn primario', onclick: () => hojaPartida(null) }, icono('sumar'), 'Nueva')),
    conPlata ? el('div', { clase: 'kpis' },
      kpi('Vencido', plata(d.plataVencida), d.vencidos + ' partidas', { clase: d.vencidos ? 'mal' : '' }),
      kpi('Vence esta semana', plata(d.plataUrgente), d.urgentes + ' partidas'),
      kpi('En riesgo (30 días)', plata(d.plataEnRiesgo), 'al costo', { clase: 'principal' }))
      : el('div', { clase: 'kpis' }, kpi('Vencidas', String(d.vencidos || 0), 'partidas', { clase: d.vencidos ? 'mal' : '' }), kpi('Vencen esta semana', String(d.urgentes || 0), 'partidas', { clase: 'principal' })),
    el('div', { clase: 'seg ancho', estilo: { marginBottom: '10px' } }, [['urgentes', 'Urgentes'], ['vencidos', 'Vencidos'], ['mes', '30 días'], ['todos', 'Todos'], ['resueltos', 'Resueltos']].map(([id, t]) => el('button', { clase: E.ver === id ? 'activo' : '', onclick: () => { E.ver = id; render() } }, t))),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    el('div', { clase: 'tarjeta sin-relleno' }, zona),
    conPlata && (d.enRiesgo || []).length ? el('div', { clase: 'tarjeta' }, el('h2', {}, 'Lo que más plata tiene en riesgo'), ranking(d.enRiesgo.map((x) => ({ n: x.descripcion, texto: plata(x.valorCosto), sub: unidades(x.cantidad) + ' u. · desde ' + fechaCorta(x.primera), v: x.valorCosto })))) : null)
}

// Una partida (o una nueva si p es null).
async function hojaPartida (p) {
  const suc = S.sucursal
  if (!p) return hojaPartidaNueva()
  const resolver = (accion, texto) => async () => {
    if (accion === 'retirado' && !confirm('Se saca de la gondola y se descuentan ' + unidades(p.cantidad) + ' del stock como merma por vencimiento. ¿Seguro?')) return
    cerrarHoja()
    await mandarOrden(suc, 'vencimiento_resolver', { id: p.id, accion }, { texto: texto + ': ' + p.descripcion, alTerminar: refrescarSeccion })
  }
  const fila = (t, v) => el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, t), el('b', { clase: 'num' }, v))
  abrirHoja({
    titulo: p.descripcion,
    cuerpo: el('div', {},
      fila('Vence', fechaCorta(p.fecha) + (p.dias < 0 ? ' (hace ' + (-p.dias) + ' días)' : ' (en ' + p.dias + ' días)')),
      fila('Cantidad', unidades(p.cantidad) + ' u.'),
      S.rol === 'duenio' ? fila('Plata en juego (al costo)', plata(p.valorCosto)) : null,
      fila('Stock del producto', unidades(p.stockActual)),
      p.lote ? fila('Lote', p.lote) : null, p.nota ? fila('Nota', p.nota) : null,
      p.resuelto ? el('p', { clase: 'sub' }, 'Resuelta: ' + (p.accion || '')) : el('div', { clase: 'chips', estilo: { marginTop: '12px' } },
        el('button', { clase: 'btn primario', onclick: resolver('retirado', 'Retirar') }, 'Retirar de la gondola'),
        el('button', { clase: 'btn', onclick: resolver('vendido', 'Se vendió') }, 'Se vendió antes'),
        el('button', { clase: 'btn', onclick: () => { cerrarHoja(); hojaPartidaEditar(p) } }, 'Corregir'),
        S.rol !== 'duenio' ? null : el('button', { clase: 'btn peligro', onclick: () => { if (confirm('¿Borrar esta partida? No toca el stock.')) { cerrarHoja(); mandarOrden(suc, 'vencimiento_borrar', { id: p.id }, { texto: 'Borrar partida', alTerminar: refrescarSeccion }) } } }, 'Borrar')))
  })
}

function hojaPartidaEditar (p) {
  const fecha = el('input', { type: 'date', valor: p.fecha })
  const cant = el('input', { type: 'text', inputmode: 'decimal', valor: unidades(p.cantidad) })
  const lote = el('input', { type: 'text', valor: p.lote || '' })
  const nota = el('input', { type: 'text', valor: p.nota || '' })
  abrirHoja({
    titulo: 'Corregir ' + p.descripcion,
    cuerpo: el('div', {}, el('label', { clase: 'campo' }, 'Vence', fecha), el('label', { clase: 'campo' }, 'Cantidad', cant), el('label', { clase: 'campo' }, 'Lote', lote), el('label', { clase: 'campo' }, 'Nota', nota)),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      const n = aMilesimas(cant.value)
      if (!Number.isFinite(n) || n <= 0) return toast('Poné la cantidad', 'mal')
      if (!fecha.value) return toast('Poné la fecha', 'mal')
      cerrarHoja()
      await mandarOrden(S.sucursal, 'vencimiento_guardar', { id: p.id, fecha: fecha.value, cantidad: n, lote: lote.value.trim(), nota: nota.value.trim() }, { texto: 'Partida de ' + p.descripcion, alTerminar: refrescarSeccion })
    } }]
  })
}

async function hojaPartidaNueva () {
  const lista = await leerCatalogo(S.sucursal)
  let elegido = null
  const busca = el('input', { type: 'search', placeholder: 'Buscar producto…' })
  const resultados = el('div', { clase: 'lista' })
  const elegidoTxt = el('div', { clase: 'sub' }, 'Todavía no elegiste el producto')
  const escanear = el('button', { clase: 'btn ancho', estilo: { margin: '0 0 8px' }, onclick: async () => {
    const c = await leerCodigo({ titulo: 'Producto que vence' })
    if (!c) return
    const x = lista.find((y) => (y.codigos || []).includes(c))
    if (x) { elegido = x; elegidoTxt.textContent = x.descripcion }
    else toast('Ese código no está en ' + nombreSucursal(S.sucursal), 'mal')
  } }, icono('escanear'), 'Escanear el producto')
  const fecha = el('input', { type: 'date' })
  const cant = el('input', { type: 'text', inputmode: 'decimal', valor: '1' })
  const lote = el('input', { type: 'text', placeholder: 'Opcional' })
  busca.addEventListener('input', () => {
    limpiar(resultados)
    if (busca.value.trim().length < 2) return
    for (const x of lista.filter((y) => y.activo !== false && coincide(y.descripcion + ' ' + (y.codigos || []).join(' '), busca.value)).slice(0, 8)) {
      resultados.append(el('button', { clase: 'item', onclick: () => { elegido = x; elegidoTxt.textContent = x.descripcion; busca.value = ''; limpiar(resultados) } }, el('div', { clase: 'cuerpo' }, el('b', {}, x.descripcion)), el('span', { clase: 'num sub' }, 'stock ' + unidades(x.stock))))
    }
  })
  abrirHoja({
    titulo: 'Partida nueva',
    completa: true,
    cuerpo: el('div', {}, escanear, el('div', { clase: 'campo' }, 'Producto', el('div', { clase: 'buscador' }, icono('buscar'), busca), resultados, elegidoTxt), el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Vence', fecha), el('label', { clase: 'campo' }, 'Cantidad', cant)), el('label', { clase: 'campo' }, 'Lote', lote)),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      if (!elegido) return toast('Elegí el producto', 'mal')
      if (!fecha.value) return toast('Poné la fecha de vencimiento', 'mal')
      const n = aMilesimas(cant.value)
      if (!Number.isFinite(n) || n <= 0) return toast('Poné la cantidad', 'mal')
      cerrarHoja()
      await mandarOrden(S.sucursal, 'vencimiento_guardar', { productoId: elegido.id, fecha: fecha.value, cantidad: n, lote: lote.value.trim() }, { texto: 'Vencimiento de ' + elegido.descripcion, alTerminar: refrescarSeccion })
    } }]
  })
}

seccion('personal', { nombre: 'Personal', icono: 'clientes', grupo: 'negocio', fn: secPersonal })
seccion('vencimientos', { nombre: 'Vencimientos', icono: 'reloj', grupo: 'mercaderia', fn: secVencimientos })
