'use strict'
// COSAS DEL LOCAL CON EL CELULAR EN LA MANO
//
// Contar stock y recibir mercaderia caminando por el local: la camara queda
// abierta y cada codigo que lee suma uno. Lo que se va armando queda guardado
// en el celular (si se corta, no se pierde) hasta que se manda a la caja.

// Una lista que se arma escaneando: la usan Contar y Recibir.
function listaEscaneada (clave, vacia) {
  const L = S.listas = S.listas || {}
  if (!L[clave]) L[clave] = leerLocal(clave, null) || vacia()
  const guardar = () => guardarLocal(clave, L[clave])
  const borrar = () => { L[clave] = vacia(); guardar() }
  return { datos: L[clave], guardar, borrar, nueva: () => { borrar(); return L[clave] } }
}

// Sumar un producto leido a la lista (o uno mas si ya estaba).
function sumarALinea (lineas, p, extra) {
  let l = lineas.find((x) => x.productoId === p.id)
  if (l) l.cantidad += 1000
  else {
    l = Object.assign({ productoId: p.id, descripcion: p.descripcion, codigo: (p.codigos || [])[0] || '', stock: p.stock || 0, cantidad: 1000 }, extra ? extra(p) : {})
    lineas.unshift(l)
  }
  l.ts = new Date().toISOString()
  return l
}

// El campo de cantidad de cada renglon: se escribe o se toca + / −.
function campoCantidad (l, alCambiar) {
  const entrada = el('input', { type: 'text', inputmode: 'decimal', clase: 'num', valor: unidades(l.cantidad), estilo: { width: '64px', textAlign: 'center' } })
  entrada.addEventListener('change', () => {
    const n = aMilesimas(entrada.value)
    if (Number.isFinite(n) && n >= 0) { l.cantidad = n; l.ts = new Date().toISOString() }
    alCambiar()
  })
  entrada.addEventListener('focus', () => entrada.select())
  return el('div', { clase: 'fila', estilo: { gap: '4px', alignItems: 'center' } },
    el('button', { clase: 'btn-ico', 'aria-label': 'Uno menos', onclick: () => { l.cantidad = Math.max(0, l.cantidad - 1000); alCambiar() } }, icono('restar')),
    entrada,
    el('button', { clase: 'btn-ico', 'aria-label': 'Uno más', onclick: () => { l.cantidad += 1000; l.ts = new Date().toISOString(); alCambiar() } }, icono('sumar')))
}

// Buscador para agregar a mano lo que no tiene codigo (o no se deja leer).
function buscadorParaAgregar (lista, alElegir) {
  const busca = el('input', { type: 'search', placeholder: 'Buscar para agregar a mano…', enterkeyhint: 'search' })
  const resultados = el('div', { clase: 'lista' })
  const tarjeta = el('div', { clase: 'tarjeta sin-relleno', estilo: { display: 'none' } }, resultados)
  busca.addEventListener('input', () => {
    const q = busca.value.trim()
    tarjeta.style.display = q.length < 2 ? 'none' : ''
    if (q.length < 2) return poner(resultados)
    const filas = lista.filter((p) => p.activo !== false && coincide(p.descripcion + ' ' + (p.codigos || []).join(' '), q)).slice(0, 12)
    poner(resultados, filas.length ? filas.map((p) => itemProducto(p, () => { busca.value = ''; tarjeta.style.display = 'none'; alElegir(p) })) : vacio('Nada coincide.', 'buscar'))
  })
  return [el('div', { clase: 'buscador' }, icono('buscar'), busca), tarjeta]
}

// --- CONTAR STOCK -----------------------------------------------------------------------

async function secContar () {
  if (!S.sucursal) return pintarSeccion('contar', cabecera('Contar stock'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'stock')))
  const suc = S.sucursal
  if (esEmpleado() && !(await estadoTurno()).puede) return pintarSeccion('contar', cabecera('Contar stock'), avisoSinTurno())
  const lista = await leerCatalogo(suc)
  const L = listaEscaneada('bs.contar.' + suc, () => ({ lineas: [], nota: '' }))
  const C = L.datos
  const zona = el('div', { clase: 'lista' })
  const resumen = el('div', { clase: 'sub', estilo: { margin: '6px 2px' } })

  const pintar = () => {
    L.guardar()
    poner(zona, C.lineas.length ? C.lineas.map((l, i) => {
      const dif = l.cantidad - l.stock
      return el('div', { clase: 'item' },
        el('div', { clase: 'cuerpo' },
          el('b', {}, l.descripcion),
          el('div', { clase: 'sub' }, 'El sistema dice ' + unidades(l.stock)),
          el('div', { clase: 'sub ' + (dif === 0 ? 'verde' : dif < 0 ? 'rojo' : 'ambar') }, dif === 0 ? 'Coincide' : dif < 0 ? 'Faltan ' + unidades(-dif) : 'Sobran ' + unidades(dif))),
        el('div', { clase: 'fin pila' },
          campoCantidad(l, pintar),
          el('button', { clase: 'btn chico', onclick: () => { C.lineas.splice(i, 1); pintar() } }, 'Sacar')))
    }) : vacio('Tocá "Escanear y contar" y pasá los productos por la cámara: cada lectura suma uno.', 'stock'))
    const conDif = C.lineas.filter((l) => l.cantidad !== l.stock).length
    resumen.textContent = C.lineas.length ? C.lineas.length + ' productos contados · ' + conDif + ' con diferencia' : ''
  }

  const escanear = () => leerCodigo({
    titulo: 'Contando',
    texto: 'Cada código que leés suma uno',
    textoListo: 'Terminé de contar',
    alLeer: async (c) => {
      const r = await buscarCodigo(c, suc).catch(() => ({}))
      if (!r.producto) return '✗ ' + c + ' no está en el catálogo'
      const l = sumarALinea(C.lineas, r.producto)
      L.guardar()
      return '✓ ' + l.descripcion + ' · ' + unidades(l.cantidad)
    }
  }).then(pintar)

  const mandar = async () => {
    const items = C.lineas.filter((l) => Number.isFinite(l.cantidad))
    if (!items.length) return toast('Todavía no contaste nada', 'mal')
    const conDif = items.filter((l) => l.cantidad !== l.stock).length
    if (!confirm('¿Mandar el conteo de ' + items.length + ' productos a ' + nombreSucursal(suc) + '?\n\n' + conDif + ' tienen diferencia: el stock queda en lo que contaste (menos lo que se vendió después de contarlo).')) return
    await mandarOrden(suc, 'conteo', { items: items.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, ts: l.ts })), nota: C.nota || '' }, { texto: 'Conteo de ' + items.length, alTerminar: () => refrescarSeccion() })
    L.nueva()
    S.listas['bs.contar.' + suc] = null
    refrescarSeccion()
  }

  pintar()
  pintarSeccion('contar',
    cabecera('Contar stock', nombreSucursal(suc) + ' · escaneá lo que hay en la góndola'),
    el('button', { clase: 'btn primario ancho grande', estilo: { marginBottom: '10px' }, onclick: escanear }, icono('escanear'), 'Escanear y contar'),
    buscadorParaAgregar(lista, (p) => { sumarALinea(C.lineas, p); pintar() }),
    el('h3', {}, 'Contado'),
    el('div', { clase: 'tarjeta sin-relleno' }, zona),
    resumen,
    el('div', { clase: 'fila', estilo: { gap: '8px', marginTop: '8px' } },
      el('button', { clase: 'btn', onclick: () => { if (C.lineas.length && !confirm('¿Borrar todo lo contado?')) return; L.nueva(); S.listas['bs.contar.' + suc] = null; refrescarSeccion() } }, 'Empezar de nuevo'),
      el('button', { clase: 'btn primario', estilo: { flex: '1' }, onclick: mandar }, icono('ok'), 'Mandar el conteo')),
    el('p', { clase: 'sub', estilo: { marginTop: '10px', whiteSpace: 'normal' } }, 'Solo se corrigen los productos que contaste. Lo que se vende mientras contás se descuenta solo.'))
}

// --- RECIBIR MERCADERIA -----------------------------------------------------------------

async function secRecibir () {
  if (!S.sucursal) return pintarSeccion('recibir', cabecera('Recibir mercadería'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'proveedores')))
  const suc = S.sucursal
  const [lista, provs] = await Promise.all([leerCatalogo(suc), leerDatos('proveedores').catch(() => ({}))])
  const proveedores = (datosDe(provs, suc) || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const conCostos = puede('verCostos')
  const L = listaEscaneada('bs.recibir.' + suc, () => ({ lineas: [], proveedorId: '', numero: '', aPagar: false, vence: sumarDias(hoyISO(), 21) }))
  const R = L.datos

  const prov = el('select', {}, el('option', { valor: '' }, '— sin proveedor —'), proveedores.map((x) => el('option', { valor: x.id, selected: x.id === R.proveedorId }, x.nombre)))
  const numero = el('input', { type: 'text', valor: R.numero || '', placeholder: 'Opcional', maxlength: '40' })
  const aPagar = el('input', { type: 'checkbox', checked: !!R.aPagar })
  const vence = el('input', { type: 'date', valor: R.vence || sumarDias(hoyISO(), 21) })
  const zonaPagar = el('div', {})
  prov.addEventListener('change', () => { R.proveedorId = prov.value; pintar() })
  numero.addEventListener('input', () => { R.numero = numero.value; L.guardar() })
  aPagar.addEventListener('change', () => { R.aPagar = aPagar.checked; pintar() })
  vence.addEventListener('change', () => { R.vence = vence.value; L.guardar() })

  const zona = el('div', { clase: 'lista' })
  const resumen = el('div', { clase: 'sub', estilo: { margin: '6px 2px' } })
  const total = () => R.lineas.reduce((s, l) => s + (l.costoUnit > 0 ? Math.round(l.cantidad * l.costoUnit / 1000) : 0), 0)

  const pintar = () => {
    L.guardar()
    poner(zona, R.lineas.length ? R.lineas.map((l, i) => {
      const costo = conCostos ? el('input', { type: 'text', inputmode: 'decimal', clase: 'num', placeholder: 'costo', valor: l.costoUnit > 0 ? plataExacta(l.costoUnit) : '', estilo: { width: '96px' } }) : null
      if (costo) costo.addEventListener('change', () => { const c = aCentavos(costo.value); l.costoUnit = Number.isFinite(c) && c > 0 ? c : null; pintar() })
      const vto = el('input', { type: 'date', valor: l.vence || '', estilo: { width: '140px' } })
      vto.addEventListener('change', () => { l.vence = vto.value; L.guardar() })
      return el('div', { clase: 'item', estilo: { flexWrap: 'wrap' } },
        el('div', { clase: 'cuerpo' },
          el('b', {}, l.descripcion),
          el('div', { clase: 'sub' }, (l.codigo || 'sin código') + ' · hay ' + unidades(l.stock))),
        el('div', { clase: 'fin pila' },
          campoCantidad(l, pintar),
          el('button', { clase: 'btn chico', onclick: () => { R.lineas.splice(i, 1); pintar() } }, 'Sacar')),
        el('div', { clase: 'fila', estilo: { width: '100%', gap: '8px', marginTop: '6px', alignItems: 'center' } },
          costo ? el('label', { clase: 'sub fila', estilo: { gap: '4px', alignItems: 'center' } }, 'Costo c/u $', costo) : null,
          el('label', { clase: 'sub fila', estilo: { gap: '4px', alignItems: 'center' } }, 'Vence', vto)))
    }) : vacio('Escaneá lo que trajo el proveedor: cada lectura suma uno.', 'proveedores'))
    const u = R.lineas.reduce((s, l) => s + l.cantidad, 0)
    const t = total()
    resumen.textContent = R.lineas.length ? R.lineas.length + (R.lineas.length === 1 ? ' producto · ' : ' productos · ') + unidades(u) + (u === 1000 ? ' unidad' : ' unidades') + (conCostos && t ? ' · total ' + plata(t) : '') : ''
    poner(zonaPagar, conCostos && R.proveedorId && t > 0
      ? el('div', { clase: 'tarjeta' },
        el('label', { clase: 'fila', estilo: { gap: '8px', alignItems: 'center' } }, aPagar, 'Anotar ' + plata(t) + ' en A pagar'),
        R.aPagar ? el('label', { clase: 'campo', estilo: { marginTop: '8px' } }, 'Hay que pagarlo el', vence) : null)
      : null)
  }

  const escanear = () => leerCodigo({
    titulo: 'Recibiendo',
    texto: 'Cada código que leés suma uno',
    textoListo: 'Listo',
    alLeer: async (c) => {
      const r = await buscarCodigo(c, suc).catch(() => ({}))
      if (!r.producto) return '✗ ' + c + ' no está: cargalo en Productos'
      const l = sumarALinea(R.lineas, r.producto, (p) => ({ costoUnit: conCostos && p.costo > 0 ? p.costo : null, vence: '' }))
      L.guardar()
      return '✓ ' + l.descripcion + ' · ' + unidades(l.cantidad)
    }
  }).then(pintar)

  const mandar = async () => {
    const lineas = R.lineas.filter((l) => l.cantidad > 0)
    if (!lineas.length) return toast('Todavía no cargaste nada', 'mal')
    const t = total()
    const nombreProv = R.proveedorId ? (proveedores.find((x) => x.id === R.proveedorId) || {}).nombre : ''
    if (!confirm('¿Cargar ' + lineas.length + ' productos en ' + nombreSucursal(suc) + (nombreProv ? ' de ' + nombreProv : '') + '?' + (R.aPagar && t ? '\n\nSe anota ' + plata(t) + ' en A pagar.' : ''))) return
    await mandarOrden(suc, 'recepcion', {
      proveedorId: R.proveedorId || null,
      numero: R.numero || '',
      lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, costoUnit: conCostos && l.costoUnit > 0 ? l.costoUnit : null, vence: l.vence || '' })),
      deuda: R.aPagar && R.proveedorId && t > 0 && R.vence ? { vence: R.vence } : null
    }, { texto: 'Recepción' + (nombreProv ? ' de ' + nombreProv : ''), alTerminar: () => refrescarSeccion() })
    L.nueva()
    S.listas['bs.recibir.' + suc] = null
    refrescarSeccion()
  }

  pintar()
  pintarSeccion('recibir',
    cabecera('Recibir mercadería', nombreSucursal(suc) + ' · entra al stock cuando la caja lo aplica'),
    el('div', { clase: 'tarjeta' },
      el('label', { clase: 'campo' }, 'Proveedor', prov),
      el('label', { clase: 'campo' }, 'Número de remito o factura', numero)),
    el('button', { clase: 'btn primario ancho grande', estilo: { marginBottom: '10px' }, onclick: escanear }, icono('escanear'), 'Escanear lo que llegó'),
    buscadorParaAgregar(lista, (p) => { sumarALinea(R.lineas, p, (x) => ({ costoUnit: conCostos && x.costo > 0 ? x.costo : null, vence: '' })); pintar() }),
    el('h3', {}, 'Lo que llegó'),
    el('div', { clase: 'tarjeta sin-relleno' }, zona),
    resumen,
    zonaPagar,
    el('div', { clase: 'fila', estilo: { gap: '8px', marginTop: '8px' } },
      el('button', { clase: 'btn', onclick: () => { if (R.lineas.length && !confirm('¿Borrar todo lo cargado?')) return; L.nueva(); S.listas['bs.recibir.' + suc] = null; refrescarSeccion() } }, 'Empezar de nuevo'),
      el('button', { clase: 'btn primario', estilo: { flex: '1' }, onclick: mandar }, icono('ok'), 'Cargar en la caja')))
}

// --- ENCARGOS DE CLIENTES ---------------------------------------------------------------

const ESTADO_ENCARGO = { pendiente: ['Pendiente', 'alerta'], preparando: ['Preparando', ''], listo: ['Listo', 'ok'], entregado: ['Entregado', 'ok'], cancelado: ['Cancelado', 'mal'] }

function cuandoEncargo (para) {
  if (!para) return 'cuando pase'
  const dia = para.slice(0, 10)
  const h = para.slice(11, 16)
  return (dia === hoyISO() ? 'hoy' : dia === sumarDias(hoyISO(), 1) ? 'mañana' : fechaCorta(dia)) + ' ' + h
}

function itemEncargo (x, suc) {
  const [nombre, clase] = ESTADO_ENCARGO[x.estado] || [x.estado, '']
  const abierto = ['pendiente', 'preparando', 'listo'].includes(x.estado)
  const tarde = abierto && x.para && new Date(x.para).getTime() < Date.now()
  const cambiar = (estado) => mandarOrden(suc, 'encargo_estado', { id: x.id, estado }, { texto: x.numero + ': ' + ESTADO_ENCARGO[estado][0].toLowerCase(), alTerminar: () => refrescarSeccion() })
  const siguiente = x.estado === 'pendiente' ? 'preparando' : x.estado === 'preparando' ? 'listo' : x.estado === 'listo' ? 'entregado' : null
  return el('div', { clase: 'item', estilo: { flexWrap: 'wrap' } },
    el('span', { clase: 'ico', estilo: { color: 'var(--texto3)' } }, icono('pedidos')),
    el('div', { clase: 'cuerpo' },
      el('b', {}, x.numero + ' · ' + x.cliente.nombre),
      el('div', { clase: 'sub' + (tarde ? ' rojo' : ''), estilo: { whiteSpace: 'normal' } }, (x.entrega === 'envio' ? 'Envío a ' + x.cliente.direccion : 'Retira') + ' · ' + cuandoEncargo(x.para)),
      el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, x.items.map((it) => unidades(it.cantidad) + ' ' + it.descripcion).join(' · ')),
      x.nota ? el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, x.nota) : null),
    el('div', { clase: 'fin pila' },
      el('b', { clase: 'num' }, plata(x.total)),
      el('span', { clase: 'chip ' + clase }, nombre)),
    abierto ? el('div', { clase: 'fila', estilo: { width: '100%', gap: '8px', marginTop: '8px' } },
      siguiente ? el('button', { clase: 'btn chico primario', onclick: () => cambiar(siguiente) }, siguiente === 'entregado' ? 'Entregado' : ESTADO_ENCARGO[siguiente][0]) : null,
      x.cliente.telefono ? el('a', { clase: 'btn chico', href: 'https://wa.me/' + (String(x.cliente.telefono).replace(/\D/g, '').startsWith('54') ? '' : '549') + String(x.cliente.telefono).replace(/\D/g, '').replace(/^0/, ''), target: '_blank', rel: 'noreferrer' }, icono('mensaje'), 'WhatsApp') : null,
      el('button', { clase: 'btn chico', onclick: () => { if (confirm('¿Cancelar el encargo ' + x.numero + '?')) cambiar('cancelado') } }, 'Cancelar')) : null)
}

async function secEncargos () {
  if (!S.sucursal) return pintarSeccion('encargos', cabecera('Encargos'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'pedidos')))
  const suc = S.sucursal
  const d = datosDe(await leerDatos('encargos').catch(() => ({})), suc) || { abiertos: [], cerrados: [] }
  pintarSeccion('encargos',
    cabecera('Encargos', nombreSucursal(suc) + ' · pedidos de clientes para retirar o enviar',
      el('button', { clase: 'btn primario', onclick: () => hojaEncargo(suc) }, icono('sumar'), 'Nuevo')),
    el('h3', {}, 'Abiertos'),
    el('div', { clase: 'tarjeta sin-relleno' }, d.abiertos.length ? el('div', { clase: 'lista' }, d.abiertos.map((x) => itemEncargo(x, suc))) : vacio('No hay encargos abiertos.', 'pedidos')),
    d.cerrados.length ? el('h3', {}, 'Últimos cerrados') : null,
    d.cerrados.length ? el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, d.cerrados.slice(0, 10).map((x) => itemEncargo(x, suc)))) : null,
    el('p', { clase: 'sub', estilo: { whiteSpace: 'normal', marginTop: '10px' } }, 'Se cobran en la caja: en la pantalla Encargos, botón "Cobrar".'))
}

async function hojaEncargo (suc) {
  const lista = await leerCatalogo(suc)
  const lineas = []
  const nombre = el('input', { type: 'text', maxlength: '60', placeholder: 'Nombre del cliente' })
  const telefono = el('input', { type: 'tel', maxlength: '30', placeholder: 'Para avisarle' })
  const entrega = el('select', {}, el('option', { valor: 'retira' }, 'Retira en el local'), el('option', { valor: 'envio' }, 'Se lo mandamos'))
  const direccion = el('input', { type: 'text', maxlength: '120', placeholder: 'Calle, número, piso…' })
  const campoDir = el('label', { clase: 'campo', estilo: { display: 'none' } }, 'Dirección', direccion)
  entrega.addEventListener('change', () => { campoDir.style.display = entrega.value === 'envio' ? '' : 'none' })
  const para = el('input', { type: 'datetime-local' })
  const nota = el('input', { type: 'text', maxlength: '200', placeholder: 'Opcional' })
  const zona = el('div', { clase: 'lista' })
  const total = el('b', { clase: 'num' })
  const pintar = () => {
    poner(zona, lineas.length ? lineas.map((l, i) => el('div', { clase: 'item' },
      el('div', { clase: 'cuerpo' }, el('b', {}, l.descripcion), el('div', { clase: 'sub' }, plata(l.precioUnit) + ' c/u')),
      el('div', { clase: 'fin pila' }, campoCantidad(l, pintar), el('button', { clase: 'btn chico', onclick: () => { lineas.splice(i, 1); pintar() } }, 'Sacar'))))
      : vacio('Agregá lo que encargó.', 'pedidos'))
    total.textContent = plata(lineas.reduce((s, l) => s + Math.round(l.cantidad * l.precioUnit / 1000), 0))
  }
  const agregar = (p) => { sumarALinea(lineas, p, (x) => ({ precioUnit: x.precio || 0 })); pintar() }
  pintar()
  abrirHoja({
    titulo: 'Nuevo encargo',
    completa: true,
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Cliente', nombre),
      el('label', { clase: 'campo' }, 'Teléfono', telefono),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Entrega', entrega), el('label', { clase: 'campo' }, 'Para cuándo', para)),
      campoDir,
      el('button', { clase: 'btn ancho', estilo: { margin: '6px 0' }, onclick: async () => {
        const c = await leerCodigo({ titulo: 'Producto del encargo' })
        if (!c) return
        const r = await buscarCodigo(c, suc).catch(() => ({}))
        if (r.producto) agregar(r.producto)
        else toast('Ese código no está en ' + nombreSucursal(suc), 'mal')
      } }, icono('escanear'), 'Escanear producto'),
      buscadorParaAgregar(lista, agregar),
      el('div', { clase: 'tarjeta sin-relleno' }, zona),
      el('div', { clase: 'fila', estilo: { justifyContent: 'space-between', margin: '8px 2px' } }, el('span', { clase: 'sub' }, 'Total con los precios de hoy'), total),
      el('label', { clase: 'campo' }, 'Nota', nota)),
    botones: [{ texto: 'Anotar', primario: true, alTocar: async () => {
      if (!nombre.value.trim()) return toast('Falta el nombre del cliente', 'mal')
      if (!lineas.length) return toast('Agregá al menos un producto', 'mal')
      if (entrega.value === 'envio' && !direccion.value.trim()) return toast('Falta la dirección', 'mal')
      cerrarHoja()
      await mandarOrden(suc, 'encargo_guardar', { encargo: {
        id: uuid(),
        cliente: { nombre: nombre.value.trim(), telefono: telefono.value.trim(), direccion: direccion.value.trim() },
        entrega: entrega.value,
        para: para.value,
        nota: nota.value.trim(),
        items: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad }))
      } }, { texto: 'Encargo de ' + nombre.value.trim(), alTerminar: () => refrescarSeccion() })
    } }]
  })
}

seccion('encargos', { nombre: 'Encargos', icono: 'pedidos', grupo: 'negocio', fn: secEncargos })
seccion('contar', { nombre: 'Contar stock', corto: 'Contar', icono: 'contar', grupo: 'mercaderia', fn: secContar })
seccion('recibir', { nombre: 'Recibir mercadería', icono: 'recibir', grupo: 'mercaderia', fn: secRecibir })

// --- EL TURNO DEL EMPLEADO -------------------------------------------------------------
//
// El empleado usa el celular solo con el turno iniciado en la caja (lo sube la
// caja cada minuto), o si el dueño puso el modo emergencia (la compu no anda).

async function estadoTurno () {
  const d = datosDe(await leerDatos('venta_celular', true).catch(() => ({})), S.sucursal) || {}
  const yo = S.empleado && S.empleado.usuarioId
  const trabajando = !esEmpleado() || (d.trabajando || []).includes(yo)
  let emergencia = !!(d.emergenciaHasta && d.emergenciaHasta > new Date().toISOString())
  if (!emergencia) {
    // Con la compu rota la caja no lo aplico todavia: se mira la orden del dueño.
    try {
      const { data } = await S.sb.from('pos_ordenes').select('creado,datos').eq('sucursal_id', S.sucursal).eq('tipo', 'modo_emergencia')
        .gte('creado', new Date(Date.now() - 24 * 3600000).toISOString()).order('creado', { ascending: false }).limit(1)
      const o = (data || [])[0]
      if (o) emergencia = new Date(o.creado).getTime() + (Number((o.datos || {}).horas) || 8) * 3600000 > Date.now()
    } catch (e) { /* sin internet: vale lo que se sabia */ }
  }
  return { puede: trabajando || emergencia, trabajando, emergencia, datos: d }
}

function avisoSinTurno () {
  return el('div', { clase: 'tarjeta' }, vacio('Iniciá tu turno en la caja de la compu para usar el celular. Si la compu no anda, pedile al dueño que ponga el modo emergencia.', 'caja'))
}

async function secInicioEmpleado () {
  const t = await estadoTurno()
  pintarSeccion('inicio',
    cabecera('Hola', nombreSucursal(S.sucursal) + (t.puede ? ' · turno abierto' : ' · sin turno')),
    t.puede
      ? el('div', {},
        t.emergencia && !t.trabajando ? el('div', { clase: 'aviso alerta' }, el('b', {}, 'Modo emergencia'), 'Las ventas se cargan en la caja cuando vuelva a andar la compu.') : null,
        el('div', { clase: 'mas-grilla' },
          el('button', { clase: 'acceso', onclick: () => ir('vender') }, el('span', { clase: 'ico' }, icono('ventas')), 'Vender'),
          el('button', { clase: 'acceso', onclick: () => ir('contar') }, el('span', { clase: 'ico' }, icono('contar')), 'Contar stock'),
          el('button', { clase: 'acceso', onclick: () => escanearYAbrir() }, el('span', { clase: 'ico' }, icono('escanear')), 'Consultar precio')))
      : avisoSinTurno())
}

// --- VENDER DESDE EL CELULAR --------------------------------------------------------------
//
// Escanear, ver el total (con las mismas promos que la caja), elegir como paga
// y listo. La venta viaja como orden y la caja la registra en el turno abierto
// a nombre de quien vendio; sin internet queda guardada y sale sola despues.

const MEDIOS_CELULAR = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['debito', 'Débito'], ['credito', 'Crédito'], ['mercado_pago', 'Mercado Pago']]

function cuentaVenta (lineas, datos) {
  const entrada = lineas.map((l) => ({ productoId: l.productoId, rubroId: l.rubroId || null, cantidad: l.cantidad, precioUnit: l.precioUnit, precioManual: false }))
  let calc = { lineas: entrada.map(() => null) }
  if (window.Promociones && (datos.promos || []).length) {
    try { calc = window.Promociones.calcularVenta(entrada, datos.promos, new Date(), plata) } catch (e) { calc = { lineas: entrada.map(() => null) } }
  }
  const filas = entrada.map((it, i) => {
    const promo = calc.lineas[i]
    const c = window.Promociones ? window.Promociones.importeLinea({ cantidad: it.cantidad, precioUnit: it.precioUnit, descuentoBasis: 0 }, promo) : { importe: Math.round(it.cantidad * it.precioUnit / 1000), descuentoPromo: 0 }
    return { importe: c.importe, ahorro: c.descuentoPromo || 0, promo: promo && promo.descuentoPromo ? promo.promoNombre : '' }
  })
  return { filas, total: filas.reduce((s, f) => s + f.importe, 0), ahorro: filas.reduce((s, f) => s + f.ahorro, 0) }
}

async function secVender () {
  if (!S.sucursal) return pintarSeccion('vender', cabecera('Vender'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'ventas')))
  const suc = S.sucursal
  const t = await estadoTurno()
  if (!t.puede) return pintarSeccion('vender', cabecera('Vender'), avisoSinTurno())
  const lista = await leerCatalogo(suc)
  const datos = t.datos || {}
  const L = listaEscaneada('bs.vender.' + suc, () => ({ lineas: [] }))
  const V = L.datos
  const zona = el('div', { clase: 'lista' })
  const totalNodo = el('div', {})

  const pintar = () => {
    L.guardar()
    const c = cuentaVenta(V.lineas, datos)
    poner(zona, V.lineas.length ? V.lineas.map((l, i) => el('div', { clase: 'item' },
      el('div', { clase: 'cuerpo' },
        el('b', {}, l.descripcion),
        el('div', { clase: 'sub' }, plata(l.precioUnit) + ' c/u' + (c.filas[i].promo ? ' · ' + c.filas[i].promo : ''))),
      el('div', { clase: 'fin pila' },
        el('b', { clase: 'num' }, plata(c.filas[i].importe)),
        campoCantidad(l, () => { if (l.cantidad <= 0) V.lineas.splice(i, 1); pintar() }))))
      : vacio('Escaneá lo que lleva el cliente.', 'ventas'))
    poner(totalNodo, V.lineas.length
      ? el('div', { clase: 'tarjeta', estilo: { textAlign: 'center' } },
        el('div', { clase: 'sub' }, 'Total'),
        el('div', { clase: 'num', estilo: { fontSize: '40px', fontWeight: '800' } }, plata(c.total)),
        c.ahorro ? el('div', { clase: 'sub verde' }, 'Ahorra ' + plata(c.ahorro) + ' con promos') : null,
        el('button', { clase: 'btn primario ancho grande', estilo: { marginTop: '10px' }, onclick: () => cobrar(c.total) }, 'Cobrar'))
      : null)
  }

  const agregar = (p) => {
    const l = sumarALinea(V.lineas, p, (x) => ({ precioUnit: x.precio || 0, rubroId: x.rubroId || null }))
    L.guardar()
    return l
  }

  const cobrar = (total) => {
    const recargos = datos.recargos || {}
    let medio = 'efectivo'
    const conCuanto = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Con cuánto paga (opcional)' })
    const detalle = el('div', {})
    const botones = el('div', { clase: 'chips', estilo: { flexWrap: 'wrap' } })
    const aCobrar = () => total + (recargos[medio] ? Math.round(total * recargos[medio] / 10000) : 0)
    const pintarCobro = () => {
      poner(botones, MEDIOS_CELULAR.map(([id, nombre]) => el('button', { clase: 'btn' + (medio === id ? ' primario' : ''), onclick: () => { medio = id; pintarCobro() } }, nombre)))
      const paga = aCentavos(conCuanto.value)
      poner(detalle,
        el('div', { clase: 'num', estilo: { fontSize: '34px', fontWeight: '800', textAlign: 'center', margin: '10px 0' } }, plata(aCobrar())),
        recargos[medio] ? el('div', { clase: 'sub', estilo: { textAlign: 'center' } }, 'Con recargo de ' + pct(recargos[medio])) : null,
        medio === 'efectivo' ? el('label', { clase: 'campo' }, 'Con cuánto paga', conCuanto) : null,
        medio === 'efectivo' && Number.isFinite(paga) && paga > aCobrar() ? el('div', { clase: 'aviso info' }, el('b', {}, 'Vuelto: ' + plata(paga - aCobrar()))) : null,
        medio === 'transferencia' ? el('div', { clase: 'sub', estilo: { textAlign: 'center' } }, 'Cobrá cuando te muestre el comprobante.') : null,
        medio === 'mercado_pago' ? el('div', { clase: 'sub', estilo: { textAlign: 'center' } }, 'Cobrá cuando veas el pago aprobado.') : null)
    }
    conCuanto.addEventListener('input', pintarCobro)
    pintarCobro()
    abrirHoja({
      titulo: 'Cobrar',
      cuerpo: el('div', {}, botones, detalle),
      botones: [{ texto: 'Listo, cobrado', primario: true, alTocar: async () => {
        const paga = aCentavos(conCuanto.value)
        cerrarHoja()
        await mandarOrden(suc, 'venta_celular', {
          items: V.lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, precioUnit: l.precioUnit })),
          medio, total, ts: new Date().toISOString(),
          efectivoRecibido: medio === 'efectivo' && Number.isFinite(paga) ? paga : 0
        }, { texto: 'Venta ' + plata(aCobrar()), callado: true })
        toast('Venta guardada (' + plata(aCobrar()) + '). Se carga en la caja sola.', 'ok', 4)
        L.nueva()
        S.listas['bs.vender.' + suc] = null
        refrescarSeccion()
      } }]
    })
  }

  const escanear = () => leerCodigo({
    titulo: 'Vendiendo',
    texto: 'Cada código que leés suma uno',
    textoListo: 'Listo',
    alLeer: async (c) => {
      const r = await buscarCodigo(c, suc).catch(() => ({}))
      if (!r.producto) return '✗ ' + c + ' no está en el catálogo'
      if (!r.producto.precio) return '✗ ' + r.producto.descripcion + ' no tiene precio'
      const l = agregar(r.producto)
      return '✓ ' + l.descripcion + ' · ' + unidades(l.cantidad)
    }
  }).then(pintar)

  pintar()
  pintarSeccion('vender',
    cabecera('Vender', nombreSucursal(suc) + (t.emergencia && !t.trabajando ? ' · modo emergencia' : '')),
    el('button', { clase: 'btn primario ancho grande', estilo: { marginBottom: '10px' }, onclick: escanear }, icono('escanear'), 'Escanear productos'),
    buscadorParaAgregar(lista.filter((p) => p.precio > 0), (p) => { agregar(p); pintar() }),
    el('div', { clase: 'tarjeta sin-relleno' }, zona),
    totalNodo,
    V.lineas.length ? el('button', { clase: 'btn ancho', estilo: { marginTop: '8px' }, onclick: () => { if (!confirm('¿Borrar esta venta?')) return; L.nueva(); S.listas['bs.vender.' + suc] = null; refrescarSeccion() } }, 'Borrar y empezar de nuevo') : null)
}

seccion('vender', { nombre: 'Vender', icono: 'ventas', grupo: 'principal', fn: secVender })
