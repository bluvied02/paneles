'use strict'
// ENVASES, MEDIOS DE PAGO Y GANANCIA POR RUBRO (solo el dueño).
//
// La configuración que en la caja está en Configuración y en Productos:
// el depósito de cada envase retornable (y los vales que andan afuera), las
// comisiones y recargos de cada medio de pago, y la ganancia por rubro con la
// que la caja propone el precio cuando cambia el costo. Los porcentajes viajan
// como en la caja: "basis" (100 = 1%); la plata, en centavos.

const aBasis = (txt) => { const s = String(txt == null ? '' : txt).trim(); if (!s) return null; const n = Number(s.replace('%', '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : NaN }
const basisATexto = (b) => (b == null ? '' : String(b / 100).replace('.', ','))

// --- ENVASES ------------------------------------------------------------------------------

async function secEnvases () {
  if (!S.sucursal) return pintarSeccion('envases', cabecera('Envases'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'caja')))
  const d = datosDe(await leerDatos('envases'))
  if (!d) return pintarSeccion('envases', cabecera('Envases retornables', nombreSucursal(S.sucursal)), el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió los envases. Aparecen cuando se actualiza a la versión nueva.', 'caja')))
  const a = d.afuera
  pintarSeccion('envases',
    cabecera('Envases retornables', nombreSucursal(S.sucursal), el('button', { clase: 'btn primario', onclick: () => hojaEnvasesConfig(d.config) }, icono('editar'), 'Depósitos')),
    el('div', { clase: 'kpis' },
      kpi('Envases afuera', String(a.unidades), a.vales.length + ' vales', { clase: 'principal' }),
      kpi('Plata en depósitos', plata(a.importe), 'que tendrías que devolver'),
      kpi('Vales vencidos', String(a.vencidos), 'más de ' + d.config.validezDias + ' días', { clase: a.vencidos ? 'mal' : '' })),
    el('div', { clase: 'tarjeta' }, el('h2', {}, 'Depósito de cada envase'),
      d.config.tipos.map((t) => {
        const x = a.tipos.find((y) => y.tipoId === t.id)
        return el('div', { clase: 'fila' }, el('div', { clase: 'izq' }, el('b', {}, t.nombre), el('div', { clase: 'sub' }, x ? x.unidades + ' afuera' + (x.vencidos ? ' · ' + x.vencidos + ' vencidos' : '') : 'ninguno afuera')), el('b', { clase: 'num' }, t.deposito ? plata(t.deposito) : 'sin cargar'))
      })),
    el('h3', {}, 'Vales que andan afuera'),
    el('div', { clase: 'tarjeta sin-relleno' }, a.vales.length ? el('div', { clase: 'lista' }, a.vales.map((v) => el('div', { clase: 'item' },
      el('div', { clase: 'cuerpo' }, el('b', {}, v.numero), el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, v.lineas.map((l) => l.pendiente + ' ' + l.nombre).join(', ') + ' · vence ' + fechaCorta(v.vence))),
      el('div', { clase: 'fin' }, el('b', { clase: 'num' }, plata(v.importe)), v.vencido ? el('div', {}, el('span', { clase: 'chip mal' }, 'Vencido')) : null)))) : vacio('No hay envases afuera.', 'caja')),
    el('p', { clase: 'sub' }, 'Los vales se cobran y se devuelven en el mostrador (hace falta el vale o la autorización de un encargado). Desde acá se ve cuántos hay y se cambia el depósito.'))
}

function hojaEnvasesConfig (config) {
  const tipos = config.tipos.map((t) => ({ id: t.id, nombre: t.nombre, deposito: t.deposito }))
  const validez = el('input', { type: 'number', min: '1', max: '365', valor: String(config.validezDias) })
  const zona = el('div', {})
  const pintar = () => poner(zona, tipos.map((t, i) => {
    const n = el('input', { type: 'text', maxlength: '40', valor: t.nombre, placeholder: 'Ej: Coca 2 L retornable' })
    n.addEventListener('input', () => { t.nombre = n.value })
    const dep = el('input', { type: 'text', inputmode: 'decimal', valor: t.deposito ? String(t.deposito / 100).replace('.', ',') : '' })
    dep.addEventListener('input', () => { const c = aCentavos(dep.value); t.deposito = Number.isFinite(c) ? c : 0 })
    return el('div', { clase: 'tarjeta', estilo: { marginBottom: '8px' } },
      el('label', { clase: 'campo' }, 'Envase', n), el('label', { clase: 'campo' }, 'Depósito ($)', dep),
      el('button', { clase: 'btn chico peligro', onclick: () => { tipos.splice(i, 1); pintar() } }, 'Sacar'))
  }))
  pintar()
  abrirHoja({
    titulo: 'Envases y depósitos',
    completa: true,
    cuerpo: el('div', {}, zona,
      el('button', { clase: 'btn chico', onclick: () => { tipos.push({ id: '', nombre: '', deposito: 0 }); pintar() } }, icono('sumar'), 'Agregar envase'),
      el('label', { clase: 'campo', estilo: { marginTop: '12px' } }, 'Días que dura un vale', validez),
      el('p', { clase: 'sub' }, 'Para que una bebida lleve depósito, unila al envase en la caja (Productos). Sacar un envase de la lista no borra los vales que ya salieron.')),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      if (tipos.some((t) => !t.nombre.trim())) return toast('Ponele nombre a cada envase', 'mal')
      cerrarHoja()
      await mandarOrden(S.sucursal, 'envases_config', { tipos, validezDias: Number(validez.value) || 30 }, { texto: 'Envases', alTerminar: refrescarSeccion })
    } }]
  })
}

// --- MEDIOS DE PAGO -----------------------------------------------------------------------

async function secMedios () {
  if (!S.sucursal) return pintarSeccion('medios', cabecera('Medios de pago'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'caja')))
  const d = datosDe(await leerDatos('medios_pago'))
  if (!d) return pintarSeccion('medios', cabecera('Medios de pago', nombreSucursal(S.sucursal)), el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió los medios de pago. Aparecen cuando se actualiza a la versión nueva.', 'caja')))
  const comis = {}
  const recar = {}
  const campo = (obj, id, valor) => { const i = el('input', { type: 'text', inputmode: 'decimal', valor: basisATexto(valor), placeholder: '0', estilo: { width: '90px', textAlign: 'right' } }); obj[id] = i; return i }
  pintarSeccion('medios',
    cabecera('Medios de pago', nombreSucursal(S.sucursal) + ' · comisiones y recargos'),
    el('div', { clase: 'tarjeta' }, el('h2', {}, 'Comisión que te cobran'),
      el('p', { clase: 'sub' }, 'Sale de tu ganancia: se descuenta antes de decir si un producto rinde.'),
      d.medios.map((id) => el('div', { clase: 'fila' }, el('span', {}, d.nombres[id]), el('span', {}, campo(comis, id, d.comisiones[id] || 0), ' %')))),
    el('div', { clase: 'tarjeta' }, el('h2', {}, 'Recargo al cliente'),
      el('p', { clase: 'sub' }, 'Lo que se le suma al cliente por pagar con tarjeta. Cero: no se cobra.'),
      d.conRecargo.map((id) => el('div', { clase: 'fila' }, el('span', {}, d.nombres[id]), el('span', {}, campo(recar, id, d.recargos[id] || 0), ' %')))),
    el('button', { clase: 'btn primario ancho grande', onclick: async () => {
      const c = {}
      const r = {}
      for (const [id, i] of Object.entries(comis)) { const n = aBasis(i.value); if (Number.isNaN(n)) return toast('Revisá la comisión de ' + d.nombres[id], 'mal'); c[id] = n || 0 }
      for (const [id, i] of Object.entries(recar)) { const n = aBasis(i.value); if (Number.isNaN(n)) return toast('Revisá el recargo de ' + d.nombres[id], 'mal'); r[id] = n || 0 }
      await mandarOrden(S.sucursal, 'medios_config', { comisiones: c, recargos: r }, { texto: 'Medios de pago', alTerminar: refrescarSeccion })
    } }, 'Guardar'))
}

// --- GANANCIA POR RUBRO -------------------------------------------------------------------

async function secRubrosGanancia () {
  if (!S.sucursal) return pintarSeccion('rubrosganancia', cabecera('Ganancia por rubro'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'productos')))
  const lista = datosDe(await leerDatos('rubros_ganancia'))
  if (!lista) return pintarSeccion('rubrosganancia', cabecera('Ganancia por rubro', nombreSucursal(S.sucursal)), el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió los rubros. Aparecen cuando se actualiza a la versión nueva.', 'productos')))
  const campos = {}
  const busca = el('input', { type: 'search', placeholder: 'Buscar rubro…' })
  const zona = el('div', { clase: 'lista' })
  const pintar = () => {
    const filas = lista.filter((r) => !busca.value || coincide(r.ruta, busca.value))
    poner(zona, filas.length ? filas.map((r) => {
      const i = campos[r.id] || (campos[r.id] = el('input', { type: 'text', inputmode: 'decimal', valor: basisATexto(r.margenBasis), placeholder: 'heredado', estilo: { width: '90px', textAlign: 'right' } }))
      return el('div', { clase: 'item' }, el('div', { clase: 'cuerpo' }, el('b', {}, r.ruta)), el('span', {}, i, ' %'))
    }) : vacio('Ningún rubro coincide.', 'productos'))
  }
  busca.addEventListener('input', pintar)
  pintar()
  pintarSeccion('rubrosganancia',
    cabecera('Ganancia por rubro', nombreSucursal(S.sucursal), el('button', { clase: 'btn primario', onclick: async () => {
      const margenes = []
      for (const r of lista) {
        const i = campos[r.id]
        if (!i) continue
        const n = aBasis(i.value)
        if (Number.isNaN(n)) return toast('Revisá la ganancia de ' + r.ruta, 'mal')
        if (n !== (r.margenBasis == null ? null : r.margenBasis)) margenes.push({ rubroId: r.id, margenBasis: n })
      }
      if (!margenes.length) return toast('No cambiaste nada')
      await mandarOrden(S.sucursal, 'rubros_margen', { margenes }, { texto: 'Ganancia por rubro', alTerminar: refrescarSeccion })
    } }, 'Guardar')),
    el('p', { clase: 'sub' }, 'Si un rubro tiene ganancia, cuando cambia el costo la caja propone el precio con esa ganancia (sobre el costo). Vacío: usa la del rubro de arriba o, si no tiene, la que ya tenía cada producto.'),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    el('div', { clase: 'tarjeta sin-relleno' }, zona))
}

seccion('envases', { nombre: 'Envases', icono: 'caja', grupo: 'mercaderia', fn: secEnvases })
seccion('medios', { nombre: 'Medios de pago', icono: 'gastos', grupo: 'control', fn: secMedios })
seccion('rubrosganancia', { nombre: 'Ganancia por rubro', icono: 'productos', grupo: 'mercaderia', fn: secRubrosGanancia })
