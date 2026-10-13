'use strict'
// MAYORISTA EN EL CELULAR (solo el dueño: lleva costos y ganancia)
//
// Se arma el presupuesto aca mismo, con el catalogo y los precios de la
// sucursal elegida y el mismo calculo que la caja (mayorista-calculo.js). El
// PDF se hace en el telefono, al instante, y se comparte directo a WhatsApp.
// La caja lo guarda (historial, numero, cliente) cuando aplica la orden, en
// menos de un minuto; mientras tanto figura "guardando".
//
// El PDF NUNCA lleva costos ni ganancia: eso se ve solo en la pantalla.

const ESTADO_MAY = { presupuesto: ['Presupuesto', ''], confirmado: ['Confirmado', 'alerta'], entregado: ['Entregado', 'ok'], cancelado: ['Cancelado', 'mal'] }
const MEDIOS_MAY = [['efectivo', 'Cobrado en efectivo'], ['transferencia', 'Cobrado por transferencia'], ['mercado_pago', 'Cobrado con Mercado Pago'], ['debito', 'Cobrado con débito'], ['credito', 'Cobrado con crédito'], ['cuenta_corriente', 'A cuenta corriente del cliente']]
const pesosMay = (c) => '$ ' + ((c || 0) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pctMay = (b) => (b ? (Math.round(b) / 100).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%' : '—')
const fechaMay = (iso) => { if (!iso) return ''; if (String(iso).includes('T')) { const f = new Date(iso); return String(f.getDate()).padStart(2, '0') + '/' + String(f.getMonth() + 1).padStart(2, '0') + '/' + f.getFullYear() } const [a, m, d] = String(iso).slice(0, 10).split('-'); return d + '/' + m + '/' + a }

// Los que se guardaron desde este celular y la caja todavia no subio.
async function pendientesMay (suc) {
  const todos = (await DB.get('may:pend')) || []
  return todos.filter((x) => x.sucursalId === suc && Date.now() - new Date(x.guardadoEn).getTime() < 3 * 86400000)
}
async function anotarPendienteMay (p) {
  const todos = ((await DB.get('may:pend')) || []).filter((x) => x.id !== p.id)
  todos.push(p)
  await DB.set('may:pend', todos.slice(-60))
}

async function datosMay (suc, forzar) {
  const d = datosDe(await leerDatos('mayorista', forzar).catch(() => ({})), suc) || {}
  const subidos = d.presupuestos || []
  // Sigue "guardando" mientras la orden no se aplico (o la caja todavia no lo subio).
  const enCurso = (x) => S.cola.some((o) => o.id === x.ordenId) || S.esperando.has(x.ordenId)
  const pend = (await pendientesMay(suc)).filter((x) => enCurso(x) || !subidos.some((y) => y.id === x.id))
  // Lo pendiente reemplaza a lo subido (es mas nuevo) hasta que la caja lo suba.
  const lista = subidos.filter((y) => !pend.some((x) => x.id === y.id)).concat(pend.map((x) => Object.assign({}, x, { pendiente: true })))
    .sort((a, b) => String(b.creadoEn || '').localeCompare(String(a.creadoEn || '')))
  return {
    presupuestos: lista,
    clientes: d.clientes || [],
    config: d.config || { escalas: [], validezDias: 7, redondeo: 0, nota: '' },
    negocio: d.negocio || {},
    proximo: d.proximo || 'M-0001',
    hay: !!d.presupuestos
  }
}

function reservarNumero (d) {
  const nums = d.presupuestos.map((x) => x.numero)
  const prox = parseInt(String(d.proximo).replace(/\D+/g, ''), 10) || 1
  nums.push('M-' + (prox - 1))
  return MayoristaCalculo.proximoNumero(nums)
}

async function secMayorista () {
  if (!S.sucursal) return pintarSeccion('mayorista', cabecera('Mayorista'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'pedidos')))
  const suc = S.sucursal
  const d = await datosMay(suc)
  S.filtroMay = S.filtroMay || 'abiertos'
  const lista = d.presupuestos.filter((x) => S.filtroMay === 'todos' || ['presupuesto', 'confirmado'].includes(x.estado))
  const chips = el('div', { clase: 'filtros' }, [['abiertos', 'Abiertos'], ['todos', 'Todos']].map(([id, n]) =>
    el('button', { clase: 'filtro' + (S.filtroMay === id ? ' activo' : ''), onclick: () => { S.filtroMay = id; refrescarSeccion() } }, n)))
  pintarSeccion('mayorista',
    cabecera('Mayorista', nombreSucursal(suc) + ' · presupuestos para comercios',
      el('button', { clase: 'btn primario', onclick: () => hojaMay(suc, d, null) }, icono('sumar'), 'Nuevo')),
    d.hay ? null : el('div', { clase: 'aviso info' }, 'La caja de ' + nombreSucursal(suc) + ' todavía no subió los datos del mayorista: tiene que tener la versión 0.34 o más nueva (se instala sola al cerrar el turno).'),
    chips,
    el('div', { clase: 'tarjeta sin-relleno' }, lista.length ? el('div', { clase: 'lista' }, lista.map((x) => {
      const [nom, cls] = ESTADO_MAY[x.estado] || [x.estado, '']
      return el('div', { clase: 'item tocable', onclick: () => hojaMay(suc, d, x) },
        el('span', { clase: 'ico', estilo: { color: 'var(--texto3)' } }, icono('pedidos')),
        el('div', { clase: 'cuerpo' },
          el('b', {}, x.numero + ' · ' + (x.cliente.comercio || x.cliente.nombre)),
          el('div', { clase: 'sub' }, fechaMay(x.creadoEn) + ' · ' + x.items.length + (x.items.length === 1 ? ' producto' : ' productos') + (x.ahorro ? ' · ahorra ' + plata(x.ahorro) : '')),
          x.pendiente ? el('div', { clase: 'sub ambar' }, 'Guardando en la caja…') : x.venta ? el('div', { clase: 'sub' }, 'Venta ' + x.venta.numero) : null),
        el('div', { clase: 'fin pila' }, el('b', { clase: 'num' }, plata(x.total)), el('span', { clase: 'chip ' + cls }, nom)))
    })) : vacio(d.presupuestos.length ? 'No hay presupuestos abiertos.' : 'Todavía no hay presupuestos. Tocá "Nuevo".', 'pedidos')))
}

async function hojaMay (suc, d, x) {
  const catalogo = await leerCatalogo(suc).catch(() => [])
  const porId = new Map(catalogo.map((p) => [p.id, p]))
  const productoDe = (id) => porId.get(id) || null
  const editable = !x || (!x.venta && ['presupuesto', 'confirmado'].includes(x.estado) && !x.pendiente)
  let clienteId = x ? x.clienteId : null
  const lineas = x ? x.items.map((it) => ({ productoId: it.productoId, codigo: it.codigo, descripcion: it.descripcion, cantidad: it.cantidad, precioLista: it.precioLista,
    descuentoBasis: it.modo === 'pct' ? it.descuentoBasis : undefined, precioFijo: it.modo === 'precio' ? it.precioUnit : undefined })) : []
  const inp = (valor, ph, tipo) => el('input', { type: tipo || 'text', valor: valor || '', placeholder: ph || '', disabled: !editable })
  const cli = {
    nombre: inp(x && x.cliente.nombre, 'Nombre y apellido'),
    comercio: inp(x && x.cliente.comercio, 'Nombre del comercio'),
    telefono: inp(x && x.cliente.telefono, 'Para mandarle el PDF', 'tel'),
    cuit: inp(x && x.cliente.cuit, 'Opcional'),
    direccion: inp(x && x.cliente.direccion, 'Opcional')
  }
  cli.nombre.setAttribute('list', 'may-cli')
  const dl = el('datalist', { id: 'may-cli' }, d.clientes.map((c) => el('option', { valor: c.nombre }, c.comercio || c.telefono || '')))
  cli.nombre.addEventListener('change', () => {
    const c = d.clientes.find((k) => k.nombre.toLowerCase() === cli.nombre.value.trim().toLowerCase())
    clienteId = c ? c.id : null
    if (c) for (const k of ['comercio', 'telefono', 'cuit', 'direccion']) if (!cli[k].value) cli[k].value = c[k] || ''
  })
  const general = el('input', { type: 'text', inputmode: 'decimal', clase: 'num', placeholder: 'por cantidad', valor: x && x.descuentoGeneralBasis != null ? String(x.descuentoGeneralBasis / 100).replace('.', ',') : '', disabled: !editable, estilo: { width: '110px' } })
  const nota = el('textarea', { rows: '2', placeholder: 'Sale en el PDF', disabled: !editable }, x ? x.nota : '')
  const zona = el('div', { clase: 'lista' })
  const totales = el('div', {})
  const aPct = (t) => { const n = parseFloat(String(t).replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : null }
  const datos = () => ({ clienteId, cliente: { nombre: cli.nombre.value.trim(), comercio: cli.comercio.value.trim(), telefono: cli.telefono.value.trim(), cuit: cli.cuit.value.trim(), direccion: cli.direccion.value.trim() }, descuentoGeneralBasis: general.value.trim() ? aPct(general.value) : null, nota: nota.value.trim(), items: lineas })
  let calc = MayoristaCalculo.calcular(datos(), productoDe, d.config)

  const pintar = () => {
    for (let i = lineas.length - 1; i >= 0; i--) if (!(lineas[i].cantidad > 0)) lineas.splice(i, 1)
    calc = MayoristaCalculo.calcular(datos(), productoDe, d.config)
    poner(zona, lineas.length ? lineas.map((l, i) => {
      const f = calc.items[i] || {}
      const precio = el('input', { type: 'text', inputmode: 'decimal', clase: 'num', valor: f.precioUnit != null ? (f.precioUnit / 100).toLocaleString('es-AR') : '', disabled: !editable, estilo: { width: '96px' } })
      precio.addEventListener('change', () => { const v = aCentavos(precio.value); if (v > 0) { l.precioFijo = v; delete l.descuentoBasis; pintar() } })
      const pct = el('input', { type: 'text', inputmode: 'decimal', clase: 'num', valor: f.descuentoBasis != null ? String(f.descuentoBasis / 100).replace('.', ',') : '', disabled: !editable, estilo: { width: '58px' } })
      pct.addEventListener('change', () => { const v = aPct(pct.value); if (v != null) { l.descuentoBasis = v; delete l.precioFijo; pintar() } })
      const modo = { precio: 'precio fijo', pct: '% propio', general: 'general', escala: 'por cantidad' }[f.modo] || ''
      return el('div', { clase: 'item', estilo: { flexWrap: 'wrap', background: f.bajoCosto ? 'var(--rojo-suave)' : '' } },
        el('div', { clase: 'cuerpo' }, el('b', {}, l.descripcion),
          el('div', { clase: 'sub' }, 'Local ' + plata(f.precioLista) + ' · ' + modo + (f.costoUnit != null && S.rol === 'duenio' ? ' · costo ' + (f.costoUnit ? plata(f.costoUnit) : 'sin cargar') : '')),
          f.bajoCosto ? el('div', { clase: 'sub rojo' }, 'Queda por debajo del costo') : null),
        el('div', { clase: 'fin pila' }, el('b', { clase: 'num' }, plata(f.subtotal)), editable ? el('button', { clase: 'btn chico', onclick: () => { lineas.splice(i, 1); pintar() } }, 'Sacar') : null),
        el('div', { clase: 'fila', estilo: { width: '100%', gap: '8px', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' } },
          editable ? campoCantidad(l, pintar) : el('span', { clase: 'sub' }, unidades(l.cantidad) + ' u.'),
          el('label', { clase: 'sub fila', estilo: { gap: '4px', alignItems: 'center' } }, '$', precio),
          el('label', { clase: 'sub fila', estilo: { gap: '4px', alignItems: 'center' } }, pct, '%'),
          editable && (l.precioFijo || l.descuentoBasis != null) ? el('button', { clase: 'btn chico', onclick: () => { delete l.precioFijo; delete l.descuentoBasis; pintar() } }, 'Volver al general') : null))
    }) : vacio('Escaneá o buscá los productos.', 'pedidos'))
    const fila = (a, b, clase) => el('div', { clase: 'fila', estilo: { justifyContent: 'space-between', padding: '4px 2px' } }, el('span', { clase: 'sub' }, a), el('b', { clase: 'num ' + (clase || '') }, b))
    poner(totales, lineas.length ? [
      el('div', { clase: 'tarjeta' },
        fila('Total a precio del local', plata(calc.totalLista)),
        fila('Total mayorista', plata(calc.total)),
        fila('Ahorro del cliente', plata(calc.ahorro), 'verde')),
      S.rol === 'duenio' ? el('div', { clase: 'tarjeta' },
        el('div', { clase: 'sub', estilo: { marginBottom: '4px' } }, 'Solo para vos (no sale en el PDF)'),
        fila('Costo', plata(calc.costoTotal)),
        fila('Te queda', plata(calc.ganancia) + ' · ' + pctMay(calc.margenBasis), calc.ganancia < 0 ? 'rojo' : ''),
        calc.bajoCosto.length ? el('div', { clase: 'aviso mal' }, 'Por debajo del costo: ' + calc.bajoCosto.join(' · ')) : null,
        calc.sinCosto ? el('div', { clase: 'sub' }, calc.sinCosto + (calc.sinCosto === 1 ? ' producto sin costo cargado' : ' productos sin costo cargado') + ': la ganancia sale más alta.') : null) : null
    ] : null)
  }
  general.addEventListener('change', pintar)
  const agregar = (p) => { sumarALinea(lineas, p); pintar() }
  const escanear = () => leerCodigo({
    titulo: 'Productos del presupuesto',
    texto: 'Cada código que leés suma uno',
    textoListo: 'Listo',
    alLeer: async (c) => {
      const r = await buscarCodigo(c, suc).catch(() => ({}))
      if (!r.producto) return '✗ ' + c + ' no está en ' + nombreSucursal(suc)
      const l = sumarALinea(lineas, r.producto)
      return '✓ ' + l.descripcion + ' · ' + unidades(l.cantidad)
    }
  }).then(pintar)

  // Lo que se manda a la caja y lo que se muestra mientras la caja lo guarda.
  const armar = (numero, id) => {
    const dd = datos()
    const c = MayoristaCalculo.calcular(dd, productoDe, d.config)
    const ahora = new Date().toISOString()
    return {
      orden: { id, numero, clienteId: dd.clienteId, cliente: dd.cliente, descuentoGeneralBasis: dd.descuentoGeneralBasis, nota: dd.nota, items: lineas.map((l) => ({ productoId: l.productoId, descripcion: l.descripcion, cantidad: l.cantidad, descuentoBasis: l.descuentoBasis, precioFijo: l.precioFijo })) },
      vista: Object.assign({}, c, { id, numero, sucursalId: suc, cliente: dd.cliente, clienteId: dd.clienteId, nota: dd.nota, estado: x ? x.estado : 'presupuesto', creadoEn: x ? x.creadoEn : ahora, guardadoEn: ahora, validoHasta: x && x.validoHasta ? x.validoHasta : isoLocal(new Date(Date.now() + (d.config.validezDias || 7) * 86400000)) })
    }
  }
  const guardar = async (conPdf, cerrar) => {
    if (!cli.nombre.value.trim()) return toast('Falta el nombre del cliente', 'mal')
    if (!lineas.length) return toast('Agregá al menos un producto', 'mal')
    const id = x ? x.id : uuid()
    const numero = x ? x.numero : reservarNumero(d)
    const { orden, vista } = armar(numero, id)
    vista.ordenId = await mandarOrden(suc, 'mayorista_guardar', { presupuesto: orden }, { texto: 'Presupuesto ' + numero, alTerminar: () => refrescarSeccion() })
    await anotarPendienteMay(vista)
    cerrar()
    if (conPdf) await compartirPdfMay(vista, d)
    refrescarSeccion()
  }

  const cambiarEstado = (estado, cerrar) => { cerrar(); mandarOrden(suc, 'mayorista_estado', { id: x.id, estado }, { texto: x.numero + ': ' + ESTADO_MAY[estado][0].toLowerCase(), alTerminar: () => refrescarSeccion() }) }
  const aVenta = () => {
    const sel = el('select', {}, MEDIOS_MAY.map(([v, t]) => el('option', { valor: v }, t)))
    abrirHoja({
      titulo: 'Pasar ' + x.numero + ' a venta',
      cuerpo: el('div', {},
        el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Se carga como venta mayorista de ' + plata(x.total) + ' en ' + nombreSucursal(suc) + ': descuenta el stock y en los reportes va separada de las de mostrador. Si la caja está cerrada, entra cuando se abra.'),
        el('label', { clase: 'campo' }, 'Cómo paga', sel)),
      botones: [{ texto: 'Pasar a venta', primario: true, alTocar: (cerrar) => { cerrarHoja(2); mandarOrden(suc, 'mayorista_venta', { id: x.id, medio: sel.value }, { texto: 'Venta de ' + x.numero, alTerminar: () => refrescarSeccion() }); void cerrar } }]
    })
  }

  pintar()
  const acciones = x && !x.pendiente ? el('div', { clase: 'fila', estilo: { gap: '8px', flexWrap: 'wrap', margin: '6px 0 10px' } },
    x.estado === 'presupuesto' ? el('button', { clase: 'btn chico', onclick: () => cambiarEstado('confirmado', cerrarHoja) }, 'Confirmó') : null,
    x.estado === 'confirmado' && !x.venta ? el('button', { clase: 'btn chico primario', onclick: aVenta }, 'Pasar a venta') : null,
    x.estado === 'confirmado' ? el('button', { clase: 'btn chico', onclick: () => cambiarEstado('entregado', cerrarHoja) }, 'Entregado') : null,
    ['presupuesto', 'confirmado'].includes(x.estado) && !x.venta ? el('button', { clase: 'btn chico', onclick: () => { if (confirm('¿Cancelar el presupuesto ' + x.numero + '?')) cambiarEstado('cancelado', cerrarHoja) } }, 'Cancelar') : null) : null
  const [nomEst, clsEst] = x ? (ESTADO_MAY[x.estado] || [x.estado, '']) : ['Nuevo', '']
  abrirHoja({
    titulo: x ? 'Presupuesto ' + x.numero : 'Nuevo presupuesto',
    completa: true,
    cuerpo: el('div', {},
      dl,
      el('div', { clase: 'fila', estilo: { gap: '8px', marginBottom: '6px' } }, el('span', { clase: 'chip ' + clsEst }, nomEst), x && x.venta ? el('span', { clase: 'chip ok' }, 'Venta ' + x.venta.numero) : null, x && x.validoHasta ? el('span', { clase: 'sub' }, 'Vale hasta ' + fechaMay(x.validoHasta)) : null),
      acciones,
      el('h3', {}, 'Cliente'),
      el('label', { clase: 'campo' }, 'Nombre', cli.nombre),
      el('label', { clase: 'campo' }, 'Comercio', cli.comercio),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Teléfono', cli.telefono), el('label', { clase: 'campo' }, 'CUIT', cli.cuit)),
      el('label', { clase: 'campo' }, 'Dirección', cli.direccion),
      el('h3', {}, 'Productos'),
      editable ? el('button', { clase: 'btn primario ancho grande', estilo: { margin: '4px 0 8px' }, onclick: escanear }, icono('escanear'), 'Escanear productos') : null,
      editable ? buscadorParaAgregar(catalogo, agregar) : null,
      editable ? el('label', { clase: 'campo fila', estilo: { alignItems: 'center', gap: '8px' } }, 'Descuento general %', general) : null,
      el('div', { clase: 'tarjeta sin-relleno' }, zona),
      totales,
      el('label', { clase: 'campo' }, 'Observaciones', nota)),
    botones: editable
      ? [{ texto: 'Guardar', alTocar: (cerrar) => guardar(false, cerrar) }, { texto: 'Guardar y mandar PDF', primario: true, alTocar: (cerrar) => guardar(true, cerrar) }]
      : [{ texto: 'Mandar PDF', primario: true, alTocar: async () => { await compartirPdfMay(x, d) } }]
  })
}

// --- el PDF en el telefono ------------------------------------------------------------

const SCRIPTS_PDF = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
]
function cargarScriptMay (src) {
  return new Promise((ok, mal) => {
    if (document.querySelector('script[src="' + src + '"]')) return ok()
    const s = document.createElement('script')
    s.src = src
    s.onload = ok
    s.onerror = () => mal(new Error('No se pudo cargar el armador de PDF (¿hay internet?)'))
    document.head.append(s)
  })
}

function colorRgb (hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''))
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [27, 92, 224]
}

async function armarPdfMay (x, d) {
  for (const s of SCRIPTS_PDF) await cargarScriptMay(s)
  const { jsPDF } = window.jspdf
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const n = d.negocio || {}
  const color = colorRgb(n.colorPrimario)
  const gris = [100, 110, 125]
  let y = 16
  let xTexto = 14
  if (n.logo && /^data:image\/(png|jpe?g)/i.test(n.logo)) {
    try { doc.addImage(n.logo, /png/i.test(n.logo) ? 'PNG' : 'JPEG', 14, 10, 22, 22); xTexto = 40 } catch (e) { /* sin logo */ }
  }
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(26, 34, 51).text(String(n.nombre || ''), xTexto, y + 2)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...gris)
  const contacto = [n.telefono, n.whatsapp ? 'WhatsApp ' + n.whatsapp : '', n.email, n.instagram ? '@' + String(n.instagram).replace(/^@/, '') : ''].filter(Boolean).join(' · ')
  let yy = y + 7
  for (const t of [n.direccion, contacto, n.horario].filter(Boolean)) { doc.text(String(t), xTexto, yy); yy += 4.5 }
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...color).text('PRESUPUESTO MAYORISTA', 196, y - 2, { align: 'right' })
  doc.setFontSize(16).setTextColor(26, 34, 51).text(String(x.numero), 196, y + 5, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...gris).text('Fecha ' + fechaMay(x.creadoEn), 196, y + 10, { align: 'right' })
  y = Math.max(yy, 34) + 2
  doc.setDrawColor(...color).setLineWidth(0.8).line(14, y, 196, y)
  y += 5
  // Para quien.
  const c = x.cliente || {}
  doc.setFillColor(243, 246, 251).roundedRect(14, y, 182, 24, 2, 2, 'F')
  doc.setFontSize(7.5).setTextColor(...gris).text('PARA', 18, y + 5)
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(26, 34, 51).text(String(c.comercio || c.nombre || ''), 18, y + 10)
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...gris)
  const datosCli = [c.comercio ? c.nombre : '', c.cuit ? 'CUIT ' + c.cuit : '', c.telefono, c.direccion].filter(Boolean)
  doc.text(datosCli.slice(0, 2).join(' · '), 18, y + 15)
  if (datosCli.length > 2) doc.text(datosCli.slice(2).join(' · '), 18, y + 19.5)
  doc.setFontSize(7.5).text('VÁLIDO HASTA', 192, y + 5, { align: 'right' })
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(26, 34, 51).text(fechaMay(x.validoHasta), 192, y + 10, { align: 'right' })
  const unidadesTot = x.items.reduce((s, it) => s + it.cantidad, 0)
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...gris).text(unidades(unidadesTot) + ' unidades · ' + x.items.length + ' productos', 192, y + 15, { align: 'right' })
  y += 29
  // El detalle: el cliente ve su margen de reventa (precio del local contra el suyo).
  doc.autoTable({
    startY: y,
    margin: { left: 14, right: 14 },
    head: [['Producto', 'Cant.', 'Precio local', 'Precio mayorista', 'Desc.', 'Subtotal']],
    body: x.items.map((it) => [it.descripcion + (it.codigo ? '\n' + it.codigo : ''), unidades(it.cantidad), pesosMay(it.precioLista), pesosMay(it.precioUnit), pctMay(it.descuentoBasis), pesosMay(it.subtotal)]),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: [26, 34, 51] },
    headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center', cellWidth: 14 }, 2: { halign: 'right', cellWidth: 26, textColor: gris }, 3: { halign: 'right', cellWidth: 28 }, 4: { halign: 'center', cellWidth: 16, textColor: [11, 122, 69], fontStyle: 'bold' }, 5: { halign: 'right', cellWidth: 28, fontStyle: 'bold' } },
    alternateRowStyles: { fillColor: [248, 250, 253] }
  })
  y = doc.lastAutoTable.finalY + 6
  if (y > 240) { doc.addPage(); y = 20 }
  const tot = (t, v, op) => { doc.setFont('helvetica', op && op.negrita ? 'bold' : 'normal').setFontSize(op && op.grande ? 13 : 9.5).setTextColor(...(op && op.color ? op.color : [26, 34, 51])); doc.text(t, 120, y); doc.text(v, 196, y, { align: 'right' }); y += op && op.grande ? 7 : 5.5 }
  tot('Total a precio del local', pesosMay(x.totalLista))
  doc.setDrawColor(26, 34, 51).setLineWidth(0.4).line(120, y - 3, 196, y - 3)
  y += 2
  tot('Total mayorista', pesosMay(x.total), { negrita: true, grande: true })
  if (x.ahorro) tot('Tu ahorro', pesosMay(x.ahorro), { negrita: true, color: [11, 122, 69] })
  y += 4
  // Observaciones.
  doc.setDrawColor(201, 210, 223).setLineWidth(0.3).roundedRect(14, y, 182, 20, 2, 2)
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...gris).text('OBSERVACIONES', 18, y + 5)
  doc.setFontSize(9).setTextColor(26, 34, 51).text(doc.splitTextToSize(String(x.nota || ''), 172).slice(0, 3), 18, y + 10)
  y += 26
  doc.setFontSize(8.5).setTextColor(...gris)
  for (const t of [d.config && d.config.nota, 'Precios en pesos argentinos, sujetos a disponibilidad de stock.'].filter(Boolean)) { doc.text(doc.splitTextToSize(String(t), 182), 14, y); y += 5 }
  doc.setFillColor(...color).roundedRect(14, y, 70, 8, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(255, 255, 255).text('Válido hasta el ' + fechaMay(x.validoHasta), 18, y + 5.4)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...gris).text(String(n.nombre || '') + ' · ' + x.numero, 105, 290, { align: 'center' })
  return doc.output('blob')
}

function telWhatsApp (t) {
  let n = String(t || '').replace(/\D+/g, '')
  if (!n) return ''
  if (n.startsWith('0')) n = n.slice(1)
  if (!n.startsWith('54')) n = '549' + n
  return n
}

// Compartir: en el telefono abre "Compartir" con el PDF (WhatsApp, mail...).
// Si el navegador no puede compartir archivos, lo descarga y abre el chat.
async function compartirPdfMay (x, d) {
  let blob
  try {
    toast('Armando el PDF…', '', 2)
    blob = await armarPdfMay(x, d)
  } catch (err) { return toast(err.message, 'mal', 7) }
  const nombre = 'Presupuesto ' + x.numero + ' - ' + (x.cliente.comercio || x.cliente.nombre)
  const texto = 'Hola ' + x.cliente.nombre + ', te paso el presupuesto ' + x.numero + ' por ' + pesosMay(x.total) + (x.ahorro ? ' (ahorrás ' + pesosMay(x.ahorro) + ')' : '') + '. Vale hasta el ' + fechaMay(x.validoHasta) + '.'
  const archivo = new File([blob], nombre.replace(/[\\/:*?"<>|]+/g, '-') + '.pdf', { type: 'application/pdf' })
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: nombre, text: texto }); return } catch (err) { if (err && err.name === 'AbortError') return }
  }
  const a = el('a', { href: URL.createObjectURL(blob), download: archivo.name })
  document.body.append(a)
  a.click()
  a.remove()
  const tel = telWhatsApp(x.cliente.telefono)
  if (tel) window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(texto), '_blank')
  toast('PDF descargado: adjuntalo en el chat', 'ok', 5)
}

seccion('mayorista', { nombre: 'Mayorista', icono: 'pedidos', grupo: 'negocio', fn: secMayorista })
