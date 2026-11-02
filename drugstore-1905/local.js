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

// El campo de cantidad de cada renglon: se escribe o se toca + / −. Una
// cantidad sin escribir (null, "para contar hoy") queda vacia y no se manda.
function campoCantidad (l, alCambiar) {
  const entrada = el('input', { type: 'text', inputmode: 'decimal', clase: 'num', valor: l.cantidad == null ? '' : unidades(l.cantidad), placeholder: '¿?', estilo: { width: '64px', textAlign: 'center' } })
  entrada.addEventListener('change', () => {
    const n = aMilesimas(entrada.value)
    if (Number.isFinite(n) && n >= 0) { l.cantidad = n; l.ts = new Date().toISOString() }
    alCambiar()
  })
  entrada.addEventListener('focus', () => entrada.select())
  return el('div', { clase: 'fila', estilo: { gap: '4px', alignItems: 'center' } },
    el('button', { clase: 'btn-ico', 'aria-label': 'Uno menos', onclick: () => { l.cantidad = Math.max(0, (l.cantidad || 0) - 1000); alCambiar() } }, icono('restar')),
    entrada,
    el('button', { clase: 'btn-ico', 'aria-label': 'Uno más', onclick: () => { l.cantidad = (l.cantidad || 0) + 1000; l.ts = new Date().toISOString(); alCambiar() } }, icono('sumar')))
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
  const [lista, hoyD] = await Promise.all([leerCatalogo(suc), leerDatos('contar_hoy').catch(() => null)])
  const paraHoy = datosDe(hoyD)
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
          l.cantidad == null ? el('div', { clase: 'sub ambar' }, 'Escribí cuántos hay (si no, no se manda)')
            : el('div', { clase: 'sub ' + (dif === 0 ? 'verde' : dif < 0 ? 'rojo' : 'ambar') }, dif === 0 ? 'Coincide' : dif < 0 ? 'Faltan ' + unidades(-dif) : 'Sobran ' + unidades(dif))),
        el('div', { clase: 'fin pila' },
          campoCantidad(l, pintar),
          el('button', { clase: 'btn chico', onclick: () => { C.lineas.splice(i, 1); pintar() } }, 'Sacar')))
    }) : vacio('Tocá "Escanear y contar" y pasá los productos por la cámara: cada lectura suma uno.', 'stock'))
    const conDif = C.lineas.filter((l) => l.cantidad != null && l.cantidad !== l.stock).length
    const sinEscribir = C.lineas.filter((l) => l.cantidad == null).length
    resumen.textContent = C.lineas.length ? C.lineas.length + ' productos contados · ' + conDif + ' con diferencia' + (sinEscribir ? ' · ' + sinEscribir + ' sin escribir' : '') : ''
  }
  // Dos personas contando el mismo producto en dos lugares (gondola y deposito).
  const parte = el('input', { type: 'checkbox', checked: !!C.parte })
  parte.addEventListener('change', () => { C.parte = parte.checked; L.guardar() })

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
    const sinEscribir = C.lineas.length - items.length
    const conDif = items.filter((l) => l.cantidad !== l.stock).length
    if (!confirm('¿Mandar el conteo de ' + items.length + ' productos a ' + nombreSucursal(suc) + '?\n\n' + conDif + ' tienen diferencia: el stock queda en lo que contaste (menos lo que se vendió después de contarlo).' + (C.parte ? '\n\nEs solo una parte: lo que ya se contó hoy se suma.' : '') + (sinEscribir ? '\n\n' + sinEscribir + ' sin escribir no se mandan.' : ''))) return
    await mandarOrden(suc, 'conteo', { items: items.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, ts: l.ts })), nota: C.nota || '', parte: !!C.parte }, { texto: 'Conteo de ' + items.length, alTerminar: () => refrescarSeccion() })
    L.nueva()
    S.listas['bs.contar.' + suc] = null
    refrescarSeccion()
  }

  pintar()
  pintarSeccion('contar',
    cabecera('Contar stock', nombreSucursal(suc) + ' · escaneá lo que hay en la góndola'),
    el('button', { clase: 'btn primario ancho grande', estilo: { marginBottom: '10px' }, onclick: escanear }, icono('escanear'), 'Escanear y contar'),
    buscadorParaAgregar(lista, (p) => { sumarALinea(C.lineas, p); pintar() }),
    // Los 20 de hoy: tocar uno lo suma al conteo para escribir cuántos hay.
    paraHoy && paraHoy.filas && paraHoy.filas.length ? [el('h3', {}, 'Para contar hoy (' + (paraHoy.filas.length - paraHoy.hechos) + ' de ' + paraHoy.filas.length + ')'),
      el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, paraHoy.filas.map((f) => el('div', { clase: 'item' + (f.hecho ? ' inactivo' : ' tocable'), onclick: f.hecho ? null : () => { const l = sumarALinea(C.lineas, { id: f.productoId, descripcion: f.descripcion, codigos: [f.codigo], stock: f.stock }); l.cantidad = null; pintar(); toast(f.descripcion + ': escribí cuántos hay', '', 2) } },
        el('div', { clase: 'cuerpo' }, el('b', {}, f.descripcion), el('div', { clase: 'sub' }, f.porque + ' · el sistema dice ' + unidades(f.stock))),
        el('div', { clase: 'fin' }, f.hecho ? el('span', { clase: 'sub verde' }, '✓ contado') : el('span', { clase: 'sub' }, 'contar'))))))] : null,
    el('h3', {}, 'Contado'),
    el('div', { clase: 'tarjeta sin-relleno' }, zona),
    resumen,
    el('label', { clase: 'fila', estilo: { gap: '8px', alignItems: 'center', margin: '8px 2px', whiteSpace: 'normal' } }, parte, 'Es solo una parte (por ejemplo, el depósito): sumarlo a lo que otro ya contó hoy de esos productos'),
    el('div', { clase: 'fila', estilo: { gap: '8px', marginTop: '8px' } },
      el('button', { clase: 'btn', onclick: () => { if (C.lineas.length && !confirm('¿Borrar todo lo contado?')) return; L.nueva(); S.listas['bs.contar.' + suc] = null; refrescarSeccion() } }, 'Empezar de nuevo'),
      el('button', { clase: 'btn primario', estilo: { flex: '1' }, onclick: mandar }, icono('ok'), 'Mandar el conteo')),
    el('p', { clase: 'sub', estilo: { marginTop: '10px', whiteSpace: 'normal' } }, 'Solo se corrigen los productos que contaste. Lo que se vende mientras contás se descuenta solo.'))
}

// --- RECIBIR MERCADERIA -----------------------------------------------------------------

// Por caja: "2 cajas de 12 a $X la caja". La cantidad y el costo por unidad salen
// solos (igual que en la caja). Hasta saber cuantas trae la caja, no se toca nada.
function derivarCaja (l) {
  if (!l.porCaja || !(l.unidadesCaja > 1)) return
  if (l.cajas > 0) l.cantidad = Math.round(l.cajas * l.unidadesCaja * 1000)
  if (l.costoCaja == null && l.costoUnit != null) l.costoCaja = l.costoUnit * l.unidadesCaja
  l.costoUnit = l.costoCaja > 0 ? Math.round(l.costoCaja / l.unidadesCaja) : null
}

function pasarACaja (l) {
  const u = Number(l.unidadesPorBulto) > 1 ? Number(l.unidadesPorBulto) : 0
  l.porCaja = true
  l.unidadesCaja = u
  l.cajas = u && l.cantidad % (u * 1000) === 0 ? l.cantidad / (u * 1000) : 1
  l.costoCaja = l.costoUnit != null && u ? l.costoUnit * u : null
  derivarCaja(l)
}

async function secRecibir (params) {
  if (!S.sucursal) return pintarSeccion('recibir', cabecera('Recibir mercadería'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'proveedores')))
  const suc = S.sucursal
  const [lista, provs, peds] = await Promise.all([leerCatalogo(suc), leerDatos('proveedores').catch(() => ({})), leerDatos('pedidos_compra').catch(() => ({}))])
  const proveedores = (datosDe(provs, suc) || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const conCostos = puede('verCostos')
  const L = listaEscaneada('bs.recibir.' + suc, () => ({ lineas: [], proveedorId: '', numero: '', aPagar: false, vence: sumarDias(hoyISO(), 21), pedidoId: '', pedidoNumero: '', resto: false }))
  const R = L.datos

  // Los pedidos que esperan mercaderia en esta sucursal (los sube la caja).
  const pedidos = ((datosDe(peds, suc) || {}).pedidos || []).filter((x) => x.estado === 'enviado' || x.estado === 'borrador')
  const pendientes = () => pedidos.filter((x) => x.proveedorId === R.proveedorId)
    .sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'enviado' ? -1 : 1) || String(a.enviadoEn || a.creadoEn).localeCompare(String(b.enviadoEn || b.creadoEn)))
  const cargarPedido = (x) => {
    if (R.lineas.length && R.pedidoId !== x.id && !confirm('Se reemplaza lo que ya cargaste por lo del pedido ' + x.numero + '. ¿Seguir?')) return false
    const porId = new Map(lista.map((p) => [p.id, p]))
    R.proveedorId = x.proveedorId
    R.pedidoId = x.id
    R.pedidoNumero = x.numero
    R.resto = false
    R.lineas = x.filas.map((f) => {
      const p = porId.get(f.productoId) || {}
      const l = { productoId: f.productoId, descripcion: f.descripcion, codigo: f.codigo || '', stock: p.stock || 0, unidadesPorBulto: p.bulto || f.unidadesPorBulto || 1, cantidad: f.cantidad, costoUnit: conCostos && p.costo > 0 ? p.costo : null, vence: '', ts: new Date().toISOString() }
      // Lo pedido en cajas justas se carga por caja, como viene en el remito.
      if (l.unidadesPorBulto > 1 && l.cantidad % (l.unidadesPorBulto * 1000) === 0) pasarACaja(l)
      return l
    })
    L.guardar()
    return true
  }
  // Desde Reponer → "Llegó: recibir": ese pedido, una sola vez.
  if (params && params.pedidoId) {
    const x = pedidos.find((y) => y.id === params.pedidoId)
    delete params.pedidoId
    if (x) cargarPedido(x)
    else toast('Ese pedido ya no está esperando', '', 3)
  }
  // Si el pedido elegido ya no esta pendiente (lo recibio otro), se suelta.
  if (R.pedidoId && !pedidos.some((y) => y.id === R.pedidoId)) { R.pedidoId = ''; R.pedidoNumero = ''; R.resto = false; L.guardar() }

  const prov = el('select', {}, el('option', { valor: '' }, '— sin proveedor —'), proveedores.map((x) => el('option', { valor: x.id, selected: x.id === R.proveedorId }, x.nombre)))
  const numero = el('input', { type: 'text', valor: R.numero || '', placeholder: 'Opcional', maxlength: '40' })
  // Que se hace con la plata: nada, anotarlo en A pagar, o ya se pago (al contado).
  if (!R.pago) R.pago = R.aPagar ? 'apagar' : 'nada'
  const pago = el('select', {}, [['nada', 'No anotar nada'], ['apagar', 'Anotarlo en A pagar'], ['pagado', 'Ya lo pagué (al contado)']].map(([v, t]) => el('option', { valor: v }, t)))
  pago.value = R.pago
  const medioPago = el('select', {}, [['transferencia', 'Transferencia'], ['mercado_pago', 'Mercado Pago'], ['efectivo', 'Efectivo (de afuera de la caja)']].map(([v, t]) => el('option', { valor: v }, t)))
  medioPago.value = R.medioPago || 'transferencia'
  medioPago.addEventListener('change', () => { R.medioPago = medioPago.value; L.guardar() })
  // El total que dice la boleta: se compara con lo cargado y es lo que se anota.
  const boleta = el('input', { type: 'text', inputmode: 'decimal', valor: R.boleta ? plataExacta(R.boleta) : '', placeholder: 'Opcional' })
  boleta.addEventListener('change', () => { const c = aCentavos(boleta.value); R.boleta = Number.isFinite(c) && c > 0 ? c : null; pintar() })
  const vence = el('input', { type: 'date', valor: R.vence || sumarDias(hoyISO(), 21) })
  const zonaPagar = el('div', {})
  const zonaPedido = el('div', {})
  const zonaFaltan = el('div', {})
  R.noEstan = R.noEstan || []
  R.sinReconocer = R.sinReconocer || []
  prov.addEventListener('change', () => {
    R.proveedorId = prov.value
    if (R.pedidoId && !pendientes().some((x) => x.id === R.pedidoId)) { R.pedidoId = ''; R.pedidoNumero = ''; R.resto = false }
    pintar()
  })
  numero.addEventListener('input', () => { R.numero = numero.value; L.guardar() })
  pago.addEventListener('change', () => { R.pago = pago.value; R.aPagar = pago.value === 'apagar'; pintar() })
  vence.addEventListener('change', () => { R.vence = vence.value; L.guardar() })

  const zona = el('div', { clase: 'lista' })
  const resumen = el('div', { clase: 'sub', estilo: { margin: '6px 2px' } })
  const total = () => R.lineas.reduce((s, l) => s + (l.costoUnit > 0 ? Math.round(l.cantidad * l.costoUnit / 1000) : 0), 0)
  // Un producto mas: si ya se esta cargando por caja, es una caja mas.
  const sumarARecibir = (p) => {
    const ya = R.lineas.find((x) => x.productoId === p.id)
    if (ya && ya.porCaja) { ya.cajas += 1; derivarCaja(ya); ya.ts = new Date().toISOString(); return ya }
    return sumarALinea(R.lineas, p, (x) => ({ costoUnit: conCostos && x.costo > 0 ? x.costo : null, vence: '', unidadesPorBulto: x.bulto || 1 }))
  }

  const pintar = () => {
    L.guardar()
    poner(zona, R.lineas.length ? R.lineas.map((l, i) => {
      const caja = !!l.porCaja
      const costo = conCostos ? el('input', { type: 'text', inputmode: 'decimal', clase: 'num', placeholder: caja ? 'la caja' : 'costo', valor: caja ? (l.costoCaja > 0 ? plataExacta(l.costoCaja) : '') : (l.costoUnit > 0 ? plataExacta(l.costoUnit) : ''), estilo: { width: caja ? '118px' : '96px' } }) : null
      if (costo) {
        costo.addEventListener('change', () => {
          const c = aCentavos(costo.value)
          const valido = Number.isFinite(c) && c > 0 ? c : null
          if (caja) { l.costoCaja = valido; if (!valido) l.costoUnit = null; derivarCaja(l) } else l.costoUnit = valido
          pintar()
        })
      }
      const vto = el('input', { type: 'date', valor: l.vence || '', estilo: { width: '140px' } })
      vto.addEventListener('change', () => { l.vence = vto.value; L.guardar() })
      // Por caja: cuantas cajas y cuantas trae cada una.
      const cajas = el('input', { type: 'text', inputmode: 'decimal', clase: 'num', valor: caja && l.cajas ? String(l.cajas).replace('.', ',') : '', estilo: { width: '56px', textAlign: 'center' } })
      const unid = el('input', { type: 'text', inputmode: 'numeric', clase: 'num', valor: caja && l.unidadesCaja ? String(l.unidadesCaja) : '', placeholder: 'u.', estilo: { width: '56px', textAlign: 'center' } })
      cajas.addEventListener('change', () => { const n = Number(cajas.value.replace(',', '.')); if (n > 0 && n <= 9999) l.cajas = Math.round(n * 1000) / 1000; derivarCaja(l); pintar() })
      unid.addEventListener('change', () => { const n = Math.round(Number(unid.value.replace(',', '.'))); if (n > 1 && n <= 1000) l.unidadesCaja = n; derivarCaja(l); pintar() })
      const modo = el('button', { clase: 'btn chico', onclick: () => { if (l.porCaja) l.porCaja = false; else pasarACaja(l); pintar() } },
        caja ? 'Por unidad' : l.unidadesPorBulto > 1 ? 'Cajas de ' + l.unidadesPorBulto : 'Por caja')
      return el('div', { clase: 'item', estilo: { flexWrap: 'wrap' } },
        el('div', { clase: 'cuerpo' },
          el('b', {}, l.descripcion),
          el('div', { clase: 'sub' }, (l.codigo || 'sin código') + ' · hay ' + unidades(l.stock))),
        el('div', { clase: 'fin pila' },
          caja
            ? el('div', { clase: 'fila', estilo: { gap: '4px', alignItems: 'center' } }, cajas, el('span', { clase: 'sub' }, 'cajas de'), unid)
            : campoCantidad(l, pintar),
          caja ? el('div', { clase: 'sub', estilo: { textAlign: 'right' } }, l.unidadesCaja > 1 ? '= ' + unidades(l.cantidad) + ' unidades' : 'Poné cuántas trae la caja') : null,
          el('div', { clase: 'fila', estilo: { gap: '4px' } }, modo,
            el('button', { clase: 'btn chico', onclick: () => { R.lineas.splice(i, 1); pintar() } }, 'Sacar'))),
        el('div', { clase: 'fila', estilo: { width: '100%', gap: '8px', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' } },
          costo ? el('label', { clase: 'sub fila', estilo: { gap: '4px', alignItems: 'center' } }, caja ? 'Costo caja $' : 'Costo c/u $', costo) : null,
          costo && caja && l.costoUnit > 0 && l.unidadesCaja > 1 ? el('span', { clase: 'sub' }, '= ' + plata(l.costoUnit) + ' c/u') : null,
          el('label', { clase: 'sub fila', estilo: { gap: '4px', alignItems: 'center' } }, 'Vence', vto)))
    }) : vacio('Escaneá lo que trajo el proveedor: cada lectura suma uno.', 'proveedores'))
    const u = R.lineas.reduce((s, l) => s + l.cantidad, 0)
    const t = total()
    resumen.textContent = R.lineas.length ? R.lineas.length + (R.lineas.length === 1 ? ' producto · ' : ' productos · ') + unidades(u) + (u === 1000 ? ' unidad' : ' unidades') + (conCostos && t ? ' · total ' + plata(t) : '') : ''
    const espera = pendientes()
    if (R.pedidoId) {
      const resto = el('input', { type: 'checkbox', checked: !!R.resto })
      resto.addEventListener('change', () => { R.resto = resto.checked; L.guardar() })
      poner(zonaPedido, el('div', { clase: 'tarjeta' },
        el('div', { clase: 'fila entre', estilo: { gap: '8px', alignItems: 'center' } },
          el('div', {}, el('b', {}, 'Recibiendo el pedido ' + R.pedidoNumero),
            el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Corregí las cantidades a lo que vino y sacá lo que no vino. La caja te dice qué faltó.')),
          el('button', { clase: 'btn chico', estilo: { whiteSpace: 'nowrap', flexShrink: '0' }, onclick: () => { R.pedidoId = ''; R.pedidoNumero = ''; R.resto = false; pintar() } }, 'No es este')),
        el('label', { clase: 'fila', estilo: { gap: '8px', alignItems: 'center', marginTop: '8px' } }, resto, 'Si falta algo, lo traen después (queda esperando)')))
    } else if (espera.length) {
      poner(zonaPedido, el('div', { clase: 'tarjeta' },
        el('b', {}, espera.length === 1 ? 'Hay un pedido esperando de este proveedor' : 'Hay ' + espera.length + ' pedidos esperando de este proveedor'),
        el('div', { clase: 'lista' }, espera.map((x) => el('div', { clase: 'item' },
          el('div', { clase: 'cuerpo' }, el('b', {}, x.numero), el('div', { clase: 'sub' }, x.filas.length + (x.filas.length === 1 ? ' producto' : ' productos') + (x.estado === 'borrador' ? ' · sin mandar' : '') + (x.atrasado ? ' · atrasado' : ''))),
          el('button', { clase: 'btn chico primario', onclick: () => { if (cargarPedido(x)) pintar() } }, 'Cargar'))))))
    } else poner(zonaPedido, null)
    // Lo que no se pudo cargar: codigos que no estan, y lo que la foto del
    // remito no reconocio. Se crea o se elige ahi mismo, sin salir de Recibir.
    poner(zonaFaltan, R.noEstan.length || R.sinReconocer.length ? el('div', { clase: 'tarjeta' },
      R.noEstan.length ? [el('b', {}, R.noEstan.length === 1 ? 'Este código no está cargado' : 'Estos códigos no están cargados'),
        el('div', { clase: 'lista' }, R.noEstan.map((c) => el('div', { clase: 'item' }, el('div', { clase: 'cuerpo' }, el('b', { clase: 'num' }, c)),
          el('div', { clase: 'fin fila', estilo: { gap: '6px' } },
            el('button', { clase: 'btn chico primario', onclick: () => crearYRecibir({ codigo: c }) }, 'Crearlo'),
            el('button', { clase: 'btn chico', onclick: () => { R.noEstan = R.noEstan.filter((x) => x !== c); pintar() } }, 'Sacar')))))] : null,
      R.sinReconocer.length ? [el('b', { estilo: { display: 'block', marginTop: R.noEstan.length ? '10px' : 0 } }, 'La foto no reconoció estos'),
        el('div', { clase: 'lista' }, R.sinReconocer.map((x, i) => el('div', { clase: 'item', estilo: { flexWrap: 'wrap' } },
          el('div', { clase: 'cuerpo' }, el('b', {}, x.descripcionLeida || x.codigoLeido || 'Renglón sin nombre'), el('div', { clase: 'sub' }, unidades(x.cantidad) + (x.costoUnit ? ' · ' + plata(x.costoUnit) + ' c/u' : ''))),
          el('div', { clase: 'fila', estilo: { width: '100%', gap: '6px', marginTop: '6px', flexWrap: 'wrap' } },
            el('button', { clase: 'btn chico primario', onclick: () => elegirParaRenglon(x, i) }, 'Es este producto…'),
            el('button', { clase: 'btn chico', onclick: () => crearYRecibir({ codigo: x.codigoLeido, descripcion: x.descripcionLeida, cantidad: x.cantidad, costoUnit: x.costoUnit }, () => { R.sinReconocer.splice(i, 1) }) }, 'Crearlo nuevo'),
            el('button', { clase: 'btn chico', onclick: () => { R.sinReconocer.splice(i, 1); pintar() } }, 'No va')))))] : null) : null)
    const sinCosto = R.lineas.filter((l) => l.cantidad > 0 && !(l.costoUnit > 0)).length
    const dif = R.boleta ? R.boleta - t : 0
    poner(zonaPagar, conCostos && R.proveedorId && (t > 0 || R.boleta)
      ? el('div', { clase: 'tarjeta' },
        el('label', { clase: 'campo' }, 'Total de la boleta ($)', boleta),
        R.boleta && Math.abs(dif) > Math.max(100, R.boleta / 100) ? el('div', { clase: 'aviso alerta' }, el('b', {}, 'La boleta dice ' + plata(R.boleta) + ' y lo cargado suma ' + plata(t)), 'Revisá cantidades y costos. Se anota lo que dice la boleta.') : null,
        sinCosto ? el('p', { clase: 'sub ambar', estilo: { whiteSpace: 'normal' } }, sinCosto + (sinCosto === 1 ? ' producto no tiene costo: ' : ' productos no tienen costo: ') + (R.boleta ? 'se anota el total de la boleta.' : 'la deuda queda de menos (poné el total de la boleta).')) : null,
        el('label', { clase: 'campo' }, 'La plata (' + plata(R.boleta || t) + ')', pago),
        R.pago === 'apagar' ? el('label', { clase: 'campo', estilo: { marginTop: '8px' } }, 'Hay que pagarlo el', vence) : null,
        R.pago === 'pagado' ? el('label', { clase: 'campo', estilo: { marginTop: '8px' } }, 'Cómo lo pagaste', medioPago) : null)
      : null)
  }

  // Un producto que no estaba: se carga ahi mismo y entra con la recepcion
  // (la caja lo crea antes de recibir).
  const crearYRecibir = (previo, despues) => {
    const nombre = el('input', { type: 'text', valor: previo.descripcion || '', placeholder: 'Nombre del producto', autocapitalize: 'characters' })
    const codigo = el('input', { type: 'text', inputmode: 'numeric', valor: previo.codigo || '', placeholder: 'Código (opcional)' })
    const precio = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Precio de venta' })
    const costo = el('input', { type: 'text', inputmode: 'decimal', valor: previo.costoUnit ? plataExacta(previo.costoUnit) : '', placeholder: 'Costo c/u' })
    abrirHoja({
      titulo: 'Producto nuevo en esta recepción',
      cuerpo: el('div', {},
        el('label', { clase: 'campo' }, 'Nombre', nombre), el('label', { clase: 'campo' }, 'Código', codigo),
        el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Precio ($)', precio), conCostos ? el('label', { clase: 'campo' }, 'Costo ($)', costo) : null),
        el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Lo crea la caja cuando carga la recepción, con este proveedor.')),
      botones: [{ texto: 'Agregar', primario: true, alTocar: (cerrar) => {
        const n = nombre.value.trim()
        if (!n) return toast('Falta el nombre', 'mal')
        const pr = aCentavos(precio.value)
        if (!(pr > 0)) return toast('Falta el precio de venta', 'mal')
        const co = conCostos && costo.value.trim() ? aCentavos(costo.value) : null
        const cod = codigo.value.trim()
        if (cod && lista.some((p) => (p.codigos || []).includes(cod))) return toast('Ese código ya es de otro producto', 'mal')
        R.lineas.unshift({ productoId: 'nuevo:' + (cod || n), nuevo: { codigo: cod, descripcion: n, precio: pr, costo: co || 0 }, descripcion: n + ' (nuevo)', codigo: cod, stock: 0, unidadesPorBulto: 1, cantidad: previo.cantidad > 0 ? previo.cantidad : 1000, costoUnit: co, vence: '', ts: new Date().toISOString() })
        if (cod) R.noEstan = R.noEstan.filter((x) => x !== cod)
        if (despues) despues()
        cerrar()
        pintar()
      } }]
    })
  }
  // Un renglon de la foto que no se reconocio: se elige a mano el producto.
  const elegirParaRenglon = (x, i) => {
    abrirHoja({
      titulo: '¿Qué producto es "' + (x.descripcionLeida || x.codigoLeido) + '"?',
      completa: true,
      cuerpo: el('div', {}, buscadorParaAgregar(lista, (p) => {
        const l = sumarARecibir(p)
        l.cantidad = x.cantidad > 0 ? x.cantidad : l.cantidad
        if (conCostos && x.costoUnit > 0) l.costoUnit = x.costoUnit
        R.sinReconocer.splice(i, 1)
        cerrarHoja()
        pintar()
      }))
    })
  }
  // La foto del remito: el celular la saca y la achica, la caja la lee con el
  // servicio de lectura y devuelve lo que entendio, que se carga aca para revisar.
  const fotoRemito = () => {
    const entrada = el('input', { type: 'file', accept: 'image/*', capture: 'environment', estilo: { display: 'none' } })
    document.body.append(entrada)
    entrada.addEventListener('change', async () => {
      const archivo = entrada.files && entrada.files[0]
      entrada.remove()
      if (!archivo) return
      let url
      try { url = await achicarFoto(archivo, 1600) } catch (err) { return toast(err.message, 'mal') }
      toast('Le mandé la foto a la caja: la lee en menos de un minuto.', '', 5)
      await mandarOrden(suc, 'remito_foto', { imagen: url.split(',')[1], proveedorId: R.proveedorId || null }, {
        texto: 'Leer el remito', callado: true, silencioso: true,
        alTerminar: (r) => {
          const res = r.resultado || {}
          if (r.estado !== 'aplicada' || !res.datos) return toast('No se pudo leer el remito: ' + (res.error || 'error de la caja') + '. Cargalo escaneando.', 'mal', 9)
          let cargados = 0
          for (const x of res.datos.propuestas || []) {
            const p = x.productoId ? lista.find((y) => y.id === x.productoId) : null
            if (!p) { R.sinReconocer.push({ descripcionLeida: x.descripcionLeida, codigoLeido: x.codigoLeido, cantidad: x.cantidad, costoUnit: x.costoUnit }); continue }
            const l = sumarARecibir(p)
            l.cantidad = x.cantidad > 0 ? x.cantidad : l.cantidad
            if (conCostos && x.costoUnit > 0) l.costoUnit = x.costoUnit
            cargados++
          }
          const doc = res.datos.documento || {}
          if (doc.numero && !R.numero) R.numero = doc.numero
          L.guardar()
          toast('Remito leído: ' + cargados + ' productos cargados' + (R.sinReconocer.length ? ', ' + R.sinReconocer.length + ' para elegir a mano' : '') + '. Revisá antes de mandar.', 'ok', 7)
          if (S.seccion === 'recibir') refrescarSeccion()
        }
      })
    })
    entrada.click()
  }

  const escanear = () => leerCodigo({
    titulo: 'Recibiendo',
    texto: 'Cada código que leés suma uno',
    textoListo: 'Listo',
    alLeer: async (c) => {
      const r = await buscarCodigo(c, suc).catch(() => ({}))
      if (!r.producto) {
        // Uno nuevo que ya se cargo en esta recepcion: suma uno mas.
        const nuevo = R.lineas.find((l) => l.nuevo && l.codigo === c)
        if (nuevo) { nuevo.cantidad += 1000; L.guardar(); return '✓ ' + nuevo.descripcion + ' · ' + unidades(nuevo.cantidad) }
        if (!R.noEstan.includes(c)) R.noEstan.push(c)
        L.guardar()
        return '✗ ' + c + ' no está: al terminar lo creás ahí mismo'
      }
      const l = sumarARecibir(r.producto)
      L.guardar()
      return '✓ ' + l.descripcion + ' · ' + (l.porCaja ? String(l.cajas).replace('.', ',') + (l.cajas === 1 ? ' caja' : ' cajas') : unidades(l.cantidad))
    }
  }).then(pintar)

  const mandar = async (elegido) => {
    const lineas = R.lineas.filter((l) => l.cantidad > 0)
    if (!lineas.length) return toast('Todavía no cargaste nada', 'mal')
    const sinUnidades = lineas.find((l) => l.porCaja && !(l.unidadesCaja > 1))
    if (sinUnidades) return toast('Falta cuántas trae la caja de ' + sinUnidades.descripcion, 'mal')
    const t = total()
    const importe = R.boleta || t
    const nombreProv = R.proveedorId ? (proveedores.find((x) => x.id === R.proveedorId) || {}).nombre : ''
    // Hay pedidos esperando y no se cargo desde ahi: ¿es uno de esos?
    const espera = pendientes()
    let pedidoId = R.pedidoId
    let pedidoNumero = R.pedidoNumero
    if (elegido) { pedidoId = elegido.id || ''; pedidoNumero = elegido.numero || '' } else if (!pedidoId && espera.length === 1 && confirm('¿Esto es lo que vino del pedido ' + espera[0].numero + '?\n\nAceptar = sí (se compara con lo pedido). Cancelar = no es de un pedido.')) {
      pedidoId = espera[0].id
      pedidoNumero = espera[0].numero
    } else if (!pedidoId && espera.length > 1) {
      // Con varios, antes entraba suelto sin preguntar: se elige cual.
      return abrirHoja({
        titulo: '¿De qué pedido es?',
        cuerpo: el('div', { clase: 'lista' }, espera.map((x) => el('button', { clase: 'item', onclick: () => { cerrarHoja(); luegoDeAtras(() => mandar(x)) } },
          el('div', { clase: 'cuerpo' }, el('b', {}, x.numero), el('div', { clase: 'sub' }, x.filas.length + ' productos' + (x.estado === 'borrador' ? ' · sin mandar' : '') + (x.atrasado ? ' · atrasado' : ''))), icono('flecha'))),
        el('button', { clase: 'item', onclick: () => { cerrarHoja(); luegoDeAtras(() => mandar({ id: '' })) } }, el('div', { clase: 'cuerpo' }, el('b', {}, 'No es de ningún pedido')), icono('flecha')))
      })
    }
    const dePlata = conCostos && R.proveedorId && importe > 0
    if (!confirm('¿Cargar ' + lineas.length + ' productos en ' + nombreSucursal(suc) + (nombreProv ? ' de ' + nombreProv : '') + (pedidoId ? ' (pedido ' + pedidoNumero + ')' : '') + '?' +
      (dePlata && R.pago === 'apagar' ? '\n\nSe anota ' + plata(importe) + ' en A pagar.' : dePlata && R.pago === 'pagado' ? '\n\nSe anota ' + plata(importe) + ' como pagado al contado.' : ''))) return
    await mandarOrden(suc, 'recepcion', {
      pedidoId: pedidoId || null,
      resto: !!(R.pedidoId && R.resto),
      proveedorId: R.proveedorId || null,
      numero: R.numero || '',
      lineas: lineas.map((l) => Object.assign(l.nuevo ? { nuevo: l.nuevo } : { productoId: l.productoId }, { cantidad: l.cantidad, costoUnit: conCostos && l.costoUnit > 0 ? l.costoUnit : null, vence: l.vence || '' },
        l.porCaja && l.unidadesCaja > 1 ? { cajas: l.cajas, unidadesCaja: l.unidadesCaja } : {})),
      deuda: !dePlata ? null : R.pago === 'apagar' && R.vence ? { vence: R.vence, importe: R.boleta || null } : R.pago === 'pagado' ? { pagado: { medio: R.medioPago || 'transferencia' }, importe: R.boleta || null } : null
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
    zonaPedido,
    el('div', { clase: 'fila', estilo: { gap: '8px', marginBottom: '10px' } },
      el('button', { clase: 'btn primario grande', estilo: { flex: '1' }, onclick: escanear }, icono('escanear'), 'Escanear lo que llegó'),
      el('button', { clase: 'btn grande', onclick: fotoRemito, title: 'La caja lee el remito y carga los productos' }, icono('foto'), 'Foto del remito')),
    buscadorParaAgregar(lista, (p) => { sumarARecibir(p); pintar() }),
    zonaFaltan,
    el('h3', {}, 'Lo que llegó'),
    el('div', { clase: 'tarjeta sin-relleno' }, zona),
    resumen,
    zonaPagar,
    el('div', { clase: 'fila', estilo: { gap: '8px', marginTop: '8px' } },
      el('button', { clase: 'btn', onclick: () => { if (R.lineas.length && !confirm('¿Borrar todo lo cargado?')) return; L.nueva(); S.listas['bs.recibir.' + suc] = null; refrescarSeccion() } }, 'Empezar de nuevo'),
      el('button', { clase: 'btn primario', estilo: { flex: '1' }, onclick: () => mandar() }, icono('ok'), 'Cargar en la caja')))
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
      x.desdeTienda ? el('div', {}, el('span', { clase: 'chip ok' }, 'Tienda online')) : null,
      el('div', { clase: 'sub' + (tarde ? ' rojo' : ''), estilo: { whiteSpace: 'normal' } }, (x.entrega === 'envio' ? 'Envío a ' + x.cliente.direccion : 'Retira') + ' · ' + cuandoEncargo(x.para)),
      el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, x.items.map((it) => unidades(it.cantidad) + ' ' + it.descripcion).join(' · ')),
      x.nota ? el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, x.nota) : null),
    el('div', { clase: 'fin pila' },
      el('b', { clase: 'num' }, plata(x.total)),
      el('span', { clase: 'chip ' + clase }, nombre)),
    abierto ? el('div', { clase: 'fila', estilo: { width: '100%', gap: '8px', marginTop: '8px', flexWrap: 'wrap' } },
      siguiente ? el('button', { clase: 'btn chico primario', onclick: () => cambiar(siguiente) }, siguiente === 'entregado' ? 'Entregado' : ESTADO_ENCARGO[siguiente][0]) : null,
      el('button', { clase: 'btn chico', onclick: () => hojaEncargo(suc, x) }, 'Corregir'),
      x.cliente.telefono ? el('a', { clase: 'btn chico', href: linkWhatsApp(x.cliente.telefono), target: '_blank', rel: 'noreferrer' }, icono('mensaje'), 'WhatsApp') : null,
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

// previo: un encargo abierto para corregir (antes solo se podia cancelar).
async function hojaEncargo (suc, previo) {
  const lista = await leerCatalogo(suc)
  const porId = new Map(lista.map((p) => [p.id, p]))
  const lineas = previo ? previo.items.map((it) => ({ productoId: it.productoId, descripcion: it.descripcion, cantidad: it.cantidad, precioUnit: (porId.get(it.productoId) || {}).precio || it.precioUnit || 0 })) : []
  const nombre = el('input', { type: 'text', maxlength: '60', placeholder: 'Nombre del cliente', valor: previo ? previo.cliente.nombre : '' })
  const telefono = el('input', { type: 'tel', maxlength: '30', placeholder: 'Para avisarle', valor: previo ? previo.cliente.telefono || '' : '' })
  const entrega = el('select', {}, el('option', { valor: 'retira' }, 'Retira en el local'), el('option', { valor: 'envio' }, 'Se lo mandamos'))
  if (previo) entrega.value = previo.entrega === 'envio' ? 'envio' : 'retira'
  const direccion = el('input', { type: 'text', maxlength: '120', placeholder: 'Calle, número, piso…', valor: previo ? previo.cliente.direccion || '' : '' })
  const campoDir = el('label', { clase: 'campo', estilo: { display: entrega.value === 'envio' ? '' : 'none' } }, 'Dirección', direccion)
  entrega.addEventListener('change', () => { campoDir.style.display = entrega.value === 'envio' ? '' : 'none' })
  const para = el('input', { type: 'datetime-local', valor: previo && previo.para ? String(previo.para).slice(0, 16) : '' })
  const nota = el('input', { type: 'text', maxlength: '200', placeholder: 'Opcional', valor: previo ? previo.nota || '' : '' })
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
    titulo: previo ? 'Corregir ' + previo.numero : 'Nuevo encargo',
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
    botones: [{ texto: previo ? 'Guardar cambios' : 'Anotar', primario: true, alTocar: async () => {
      if (!nombre.value.trim()) return toast('Falta el nombre del cliente', 'mal')
      if (!lineas.length) return toast('Agregá al menos un producto', 'mal')
      if (entrega.value === 'envio' && !direccion.value.trim()) return toast('Falta la dirección', 'mal')
      cerrarHoja()
      await mandarOrden(suc, 'encargo_guardar', { encargo: {
        id: previo ? previo.id : uuid(),
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
  const ahora = new Date().toISOString()
  let hasta = d.emergenciaHasta && d.emergenciaHasta > ahora ? d.emergenciaHasta : null
  // Con la compu rota la caja no lo aplico todavia: manda la ultima orden del
  // dueño (la de "ya anda la compu" lo saca).
  try {
    const { data } = await S.sb.from('pos_ordenes').select('creado,datos').eq('sucursal_id', S.sucursal).eq('tipo', 'modo_emergencia')
      .gte('creado', new Date(Date.now() - 24 * 3600000).toISOString()).order('creado', { ascending: false }).limit(1)
    const o = (data || [])[0]
    if (o) {
      const horas = Number((o.datos || {}).horas)
      const fin = new Date(new Date(o.creado).getTime() + (horas || 8) * 3600000).toISOString()
      hasta = horas === 0 || fin <= ahora ? null : fin
    }
  } catch (e) { /* sin internet: vale lo que se sabia */ }
  const emergencia = !!hasta
  return { puede: trabajando || emergencia, trabajando, emergencia, emergenciaHasta: hasta, datos: d }
}

function avisoSinTurno () {
  return el('div', { clase: 'tarjeta' }, vacio('Iniciá tu turno en la caja de la compu para usar el celular. Si la compu no anda, pedile al dueño que ponga el modo emergencia.', 'caja'))
}

async function secInicioEmpleado () {
  const t = await estadoTurno()
  pintarSeccion('inicio',
    cabecera('Hola', nombreSucursal(S.sucursal) + (t.puede ? ' · turno abierto' : ' · sin turno')),
    avisoNoEntro(),
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
  if (!V.envases) V.envases = {}
  const zona = el('div', { clase: 'lista' })
  const totalNodo = el('div', {})
  const envasesNodo = el('div', {})
  // Envases retornables con deposito (los pone el dueño en Configuración de la caja).
  const tiposEnvase = (datos.envases || []).filter((x) => x.deposito > 0)
  const depositoEnvases = () => tiposEnvase.reduce((s, x) => s + (V.envases[x.id] || 0) * x.deposito, 0)
  const tarjetaEnvases = () => el('div', { clase: 'tarjeta' },
    el('b', {}, 'Envases retornables'),
    el('div', { clase: 'sub', estilo: { whiteSpace: 'normal', marginBottom: '6px' } }, 'Si se lleva el envase sin traer uno, deja el depósito en efectivo y le mandás el vale con el ticket.'),
    tiposEnvase.map((x) => {
      const n = V.envases[x.id] || 0
      const cambiar = (d) => { V.envases[x.id] = Math.max(0, n + d); pintar() }
      return el('div', { clase: 'fila', estilo: { justifyContent: 'space-between', gap: '8px', padding: '4px 0' } },
        el('div', {}, el('div', {}, x.nombre), el('div', { clase: 'sub' }, plata(x.deposito) + ' de depósito')),
        el('div', { clase: 'fila', estilo: { gap: '6px', alignItems: 'center' } },
          el('button', { clase: 'btn chico', onclick: () => cambiar(-1) }, '−'),
          el('b', { clase: 'num', estilo: { minWidth: '22px', textAlign: 'center' } }, String(n)),
          el('button', { clase: 'btn chico', onclick: () => cambiar(1) }, '+')))
    }))

  const pintar = () => {
    L.guardar()
    const c = cuentaVenta(V.lineas, datos)
    const deposito = depositoEnvases()
    poner(envasesNodo, tiposEnvase.length && V.lineas.length ? tarjetaEnvases() : null)
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
        el('div', { clase: 'num venta-total', estilo: { fontSize: '40px', fontWeight: '800' } }, plata(c.total)),
        c.ahorro ? el('div', { clase: 'sub verde' }, 'Ahorra ' + plata(c.ahorro) + ' con promos') : null,
        deposito ? el('div', { clase: 'sub' }, '+ ' + plata(deposito) + ' de depósito de envases') : null,
        el('button', { clase: 'btn primario ancho grande venta-cobrar', estilo: { marginTop: '10px' }, onclick: () => cobrar(c.total) }, 'Cobrar'))
      : null)
  }

  const agregar = (p) => {
    const l = sumarALinea(V.lineas, p, (x) => ({ precioUnit: x.precio || 0, rubroId: x.rubroId || null }))
    L.guardar()
    return l
  }

  const cobrar = (total) => {
    // Dos toques a "Cobrar" abrian dos ventanas: confirmando las dos, eran dos ventas.
    if (document.querySelector('.hoja-cobrar')) return
    const recargos = datos.recargos || {}
    // El deposito de los envases va en efectivo y aparte de la venta (como en la caja).
    const deposito = depositoEnvases()
    const envases = tiposEnvase.filter((x) => V.envases[x.id] > 0).map((x) => ({ tipoId: x.id, nombre: x.nombre, cantidad: V.envases[x.id], importe: V.envases[x.id] * x.deposito }))
    // Fiar lo hacen el dueño y el encargado (el empleado no ve los clientes).
    const medios = esEmpleado() ? MEDIOS_CELULAR : MEDIOS_CELULAR.concat([['cuenta_corriente', 'A cuenta (fiado)']])
    let medio = 'efectivo'
    let clientes = null
    let cliente = null
    const conCuanto = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Con cuánto paga (opcional)' })
    const entrega = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Opcional' })
    const buscaCliente = el('input', { type: 'search', placeholder: 'Nombre o teléfono…' })
    const detalle = el('div', {})
    const botones = el('div', { clase: 'chips', estilo: { flexWrap: 'wrap' } })
    const montoDe = (campo) => { const n = aCentavos(campo.value); return Number.isFinite(n) && n > 0 ? n : 0 }
    const aCobrar = () => total + (recargos[medio] ? Math.round(total * recargos[medio] / 10000) : 0)
    // Lo que deja ahora en efectivo un fiado (nunca mas que la venta).
    const dejaAhora = () => Math.min(montoDe(entrega), total)
    const zonaFiado = () => {
      if (!clientes) {
        leerDatos('clientes').then((x) => { clientes = (datosDe(x) || []).filter((c) => c.activo !== false && c.aCuenta !== false); pintarCobro() }).catch(() => { clientes = []; pintarCobro() })
        return el('div', { clase: 'sub', estilo: { textAlign: 'center' } }, 'Cargando los clientes…')
      }
      if (cliente) {
        const va = total - dejaAhora()
        const pasa = cliente.disponible != null && va > cliente.disponible
        return el('div', {},
          el('div', { clase: 'item' },
            el('div', { clase: 'cuerpo' }, el('b', {}, cliente.nombre), el('div', { clase: 'sub' }, 'Debe ' + plata(cliente.saldo) + (cliente.disponible != null ? ' · puede llevar ' + plata(Math.max(cliente.disponible, 0)) : ''))),
            el('button', { clase: 'btn chico', onclick: () => { cliente = null; pintarCobro() } }, 'Cambiar')),
          el('label', { clase: 'campo' }, 'Deja ahora en efectivo', entrega),
          pasa ? el('div', { clase: 'aviso alerta' }, el('b', {}, 'Se pasa del límite'), 'Puede llevar a cuenta hasta ' + plata(Math.max(cliente.disponible, 0)) + '. La caja no la va a cargar.') : null,
          el('div', { clase: 'sub', estilo: { textAlign: 'center' } }, plata(va) + ' a su cuenta' + (dejaAhora() ? ' · deja ' + plata(dejaAhora()) : '')))
      }
      const filas = clientes.filter((c) => !buscaCliente.value.trim() || coincide(c.nombre + ' ' + (c.telefono || ''), buscaCliente.value)).slice(0, 8)
      return el('div', {},
        el('label', { clase: 'campo' }, 'A la cuenta de', buscaCliente),
        el('div', { clase: 'lista', estilo: { margin: '0 -16px' } }, filas.length
          ? filas.map((c) => el('button', { clase: 'item', onclick: () => { cliente = c; pintarCobro() } }, el('div', { clase: 'cuerpo' }, el('b', {}, c.nombre), el('div', { clase: 'sub' }, 'Debe ' + plata(c.saldo))), icono('flecha')))
          : vacio(clientes.length ? 'Nadie coincide.' : 'No hay clientes con cuenta corriente. Se dan de alta en Clientes.')))
    }
    const pintarCobro = () => {
      poner(botones, medios.map(([id, nombre]) => el('button', { clase: 'btn' + (medio === id ? ' primario' : ''), onclick: () => { medio = id; pintarCobro() } }, nombre)))
      const paga = aCentavos(conCuanto.value)
      const enMano = medio === 'efectivo' ? aCobrar() + deposito : 0
      poner(detalle,
        el('div', { clase: 'num venta-total', estilo: { fontSize: '34px', fontWeight: '800', textAlign: 'center', margin: '10px 0' } }, plata(medio === 'efectivo' ? enMano : aCobrar())),
        recargos[medio] ? el('div', { clase: 'sub', estilo: { textAlign: 'center' } }, 'Con recargo de ' + pct(recargos[medio])) : null,
        deposito ? el('div', { clase: 'sub', estilo: { textAlign: 'center' } }, medio === 'efectivo' ? 'Incluye ' + plata(deposito) + ' de depósito de envases' : '+ ' + plata(deposito) + ' de depósito de envases, en efectivo') : null,
        medio === 'efectivo' ? el('label', { clase: 'campo' }, 'Con cuánto paga', conCuanto) : null,
        medio === 'efectivo' && Number.isFinite(paga) && paga > enMano ? el('div', { clase: 'aviso info' }, el('b', {}, 'Vuelto: ' + plata(paga - enMano))) : null,
        medio === 'transferencia' ? el('div', { clase: 'sub', estilo: { textAlign: 'center' } }, 'Cobrá cuando te muestre el comprobante.') : null,
        medio === 'mercado_pago' ? el('div', { clase: 'sub', estilo: { textAlign: 'center' } }, 'Cobrá cuando veas el pago aprobado.') : null,
        medio === 'cuenta_corriente' ? zonaFiado() : null)
    }
    conCuanto.addEventListener('input', pintarCobro)
    entrega.addEventListener('change', pintarCobro)
    buscaCliente.addEventListener('input', () => { pintarCobro(); buscaCliente.focus() })
    pintarCobro()
    abrirHoja({
      titulo: 'Cobrar',
      clase: 'hoja-cobrar',
      cuerpo: el('div', {}, botones, detalle),
      botones: [{ texto: 'Listo, cobrado', primario: true, alTocar: async (cerrar, boton) => {
        if (medio === 'cuenta_corriente' && !cliente) return toast('Elegí a la cuenta de quién va', 'mal')
        if (boton) boton.disabled = true
        const paga = aCentavos(conCuanto.value)
        const vendido = V.lineas.map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, precioUnit: l.precioUnit }))
        const cobrado = aCobrar()
        const fiado = medio === 'cuenta_corriente' ? { cliente: cliente.nombre, deja: dejaAhora() } : null
        const vale = envases.length ? numeroValeCelular() : null
        cerrarHoja()
        await mandarOrden(suc, 'venta_celular', {
          items: V.lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, precioUnit: l.precioUnit })),
          medio, total, ts: new Date().toISOString(),
          efectivoRecibido: medio === 'efectivo' && Number.isFinite(paga) ? paga : 0,
          clienteId: fiado ? cliente.id : undefined,
          entrega: fiado ? fiado.deja : undefined,
          envases: vale ? envases.map((x) => ({ tipoId: x.tipoId, cantidad: x.cantidad })) : undefined,
          valeNumero: vale || undefined
        }, { texto: 'Venta ' + plata(cobrado), callado: true })
        // Sin caja abierta la venta espera: se dice (antes parecia que ya estaba).
        toast(datos.cajaAbierta === false ? 'Venta guardada (' + plata(cobrado) + '). La caja está cerrada: entra cuando la abran.' : 'Venta guardada (' + plata(cobrado) + '). Se carga en la caja sola.', 'ok', 5)
        L.nueva()
        S.listas['bs.vender.' + suc] = null
        refrescarSeccion()
        luegoDeAtras(() => hojaTicket(vendido, cobrado, medio, { fiado, envases, vale, deposito }))
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
      // Lo dado de baja no se vende (en la caja tampoco pasa con el lector).
      if (r.producto.activo === false) return '✗ ' + r.producto.descripcion + ' está dado de baja'
      if (!r.producto.precio) return '✗ ' + r.producto.descripcion + ' no tiene precio'
      const l = agregar(r.producto)
      return '✓ ' + l.descripcion + ' · ' + unidades(l.cantidad)
    }
  }).then(pintar)

  pintar()
  pintarSeccion('vender',
    cabecera('Vender', nombreSucursal(suc) + (t.emergencia && !t.trabajando ? ' · modo emergencia' : '')),
    datos.cajaAbierta === false ? el('div', { clase: 'aviso alerta' }, el('b', {}, 'La caja está cerrada'), 'Lo que vendas queda guardado y entra cuando abran la caja, con el día y la hora en que lo vendiste.') : null,
    el('button', { clase: 'btn primario ancho grande', estilo: { marginBottom: '10px' }, onclick: escanear }, icono('escanear'), 'Escanear productos'),
    buscadorParaAgregar(lista.filter((p) => p.precio > 0), (p) => { agregar(p); pintar() }),
    el('div', { clase: 'tarjeta sin-relleno' }, zona),
    envasesNodo,
    totalNodo,
    V.lineas.length ? el('button', { clase: 'btn ancho', estilo: { marginTop: '8px' }, onclick: () => { if (!confirm('¿Borrar esta venta?')) return; L.nueva(); S.listas['bs.vender.' + suc] = null; refrescarSeccion() } }, 'Borrar y empezar de nuevo') : null)
}

// El vale de envases de una venta del celular: el numero lo pone el celular
// (asi va en el ticket enseguida) y la caja lo busca igual que los suyos.
function numeroValeCelular () {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const r = crypto.getRandomValues(new Uint8Array(6))
  return 'C' + Array.from(r, (n) => letras[n % letras.length]).join('')
}

// Despues de cobrar: el comprobante para el cliente por WhatsApp (o copiarlo).
// extra: el fiado ({ cliente, deja }) y los envases con su vale.
function hojaTicket (lineas, total, medio, extra = {}) {
  const env = extra.vale ? '\n\nDepósito de envases ' + plata(extra.deposito) + ' (' + extra.envases.map((x) => x.cantidad + ' x ' + x.nombre).join(', ') + ')\nVale ' + extra.vale + ': traé el envase y este mensaje y te devolvemos el depósito.' : ''
  const pago = extra.fiado ? 'A cuenta de ' + extra.fiado.cliente + (extra.fiado.deja ? ' · dejó ' + plata(extra.fiado.deja) + ' en efectivo' : '') : (NOMBRE_MEDIO[medio] || medio)
  const texto = S.negocio + ' · ' + nombreSucursal(S.sucursal) + '\n' + fechaHora(new Date().toISOString()) + '\n\n' +
    lineas.map((l) => unidades(l.cantidad) + ' x ' + l.descripcion + ' ' + plata(Math.round(l.cantidad * l.precioUnit / 1000))).join('\n') +
    '\n\nTotal ' + plata(total) + ' (' + pago + ')' + env + '\n¡Gracias por tu compra!'
  abrirHoja({
    titulo: 'Venta guardada',
    cuerpo: el('div', {},
      el('div', { clase: 'num venta-total', estilo: { fontSize: '30px', fontWeight: '800', textAlign: 'center', margin: '6px 0 12px' } }, plata(total)),
      extra.vale ? el('div', { clase: 'aviso info' }, el('b', {}, 'Vale de envases ' + extra.vale), 'Depósito de ' + plata(extra.deposito) + ' en efectivo. Mandale el ticket: con el envase y el vale le devuelven la plata en la caja.') : null,
      el('p', { clase: 'sub', estilo: { whiteSpace: 'normal', textAlign: 'center' } }, extra.vale ? 'El vale va en el ticket.' : 'Si el cliente quiere el comprobante, mandáselo.'),
      el('a', { clase: 'btn primario ancho grande', href: 'https://wa.me/?text=' + encodeURIComponent(texto), target: '_blank', rel: 'noreferrer' }, icono('mensaje'), 'Mandar el ticket por WhatsApp'),
      el('button', { clase: 'btn ancho', estilo: { marginTop: '8px' }, onclick: async () => { try { await navigator.clipboard.writeText(texto); toast('Ticket copiado', 'ok') } catch (e) { toast('No se pudo copiar', 'mal') } } }, 'Copiar el ticket')),
    botones: [{ texto: 'Listo', primario: true, alTocar: (cerrar) => cerrar() }],
    sinCancelar: true
  })
}

seccion('vender', { nombre: 'Vender', icono: 'ventas', grupo: 'principal', fn: secVender })
